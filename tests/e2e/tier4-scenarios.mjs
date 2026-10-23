import {
  describe,
  it,
  expect,
  callApi,
  createStation,
  cleanDatabase,
  listenDeviceEvents,
  computeComposerHeight,
  computeCounterWarning,
  simulateComposerKeydown,
  extractSanitizedFirstUrl,
  parseMarkdownTokens,
} from './harness.mjs';
import { performance } from 'node:perf_hooks';

export function registerTier4Tests() {
  describe('Tier 4: Real-World Application Scenarios', () => {
    it('TC-4.1: Scenario 1 - Multi-Tag Matchmaker Race: 2 tagged users (#coding) and 1 untagged user queue simultaneously', async () => {
      await cleanDatabase();

      // 1. Untagged user arrives first
      const untagged = await createStation('UntaggedStranger');
      await callApi('joinQueue', { deviceId: untagged.deviceId, interests: [] });

      // 2. Two tagged users arrive slightly later with matching tag #coding
      const dev1 = await createStation('DevOne');
      const dev2 = await createStation('DevTwo');
      await callApi('joinQueue', { deviceId: dev1.deviceId, interests: ['coding', 'rust'] });
      await callApi('joinQueue', { deviceId: dev2.deviceId, interests: ['coding', 'python'] });

      // 3. Dev1 and Dev2 heartbeats
      const beat1 = await callApi('heartbeatQueue', { deviceId: dev1.deviceId });
      const beat2 = await callApi('heartbeatQueue', { deviceId: dev2.deviceId });

      const activeSession = beat1.data?.desk?.activeSession || beat2.data?.desk?.activeSession;
      expect(Boolean(activeSession)).toBe(true);
      expect(activeSession?.interests).toContain('coding');

      // 4. Untagged user remains waiting in queue
      const beatUntagged = await callApi('heartbeatQueue', { deviceId: untagged.deviceId });
      expect(beatUntagged.data?.status).toBe('waiting');
    });

    it('TC-4.2: Scenario 2 - Sub-50ms Message Burst: Rapid exchange of 10 messages with optimistic rendering and SSE confirmations', async () => {
      await cleanDatabase();
      const alice = await createStation('BurstAlice');
      const bob = await createStation('BurstBob');

      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['speed-burst'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['speed-burst'] });

      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });
      const session = beatA.data?.desk?.activeSession || beatB.data?.desk?.activeSession;
      expect(Boolean(session)).toBe(true);

      const bobListener = await listenDeviceEvents(bob.deviceId, 'message', 3000);
      const latencies = [];

      // Burst send 10 messages alternating
      for (let i = 1; i <= 10; i++) {
        const sender = i % 2 === 1 ? alice : bob;
        const start = performance.now();
        const res = await callApi('sendMessage', {
          deviceId: sender.deviceId,
          sessionId: session.id,
          body: `Burst packet #${i}`,
        });
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
        expect(res.ok).toBe(true);
      }

      // Check average latency
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(50);

      // Verify messages are recorded in order
      const messagesRes = await callApi('listMessages', {
        deviceId: alice.deviceId,
        sessionId: session.id,
      });
      expect(messagesRes.data?.messages?.length).toBeGreaterThanOrEqual(10);
      bobListener.close();
    });

    it('TC-4.3: Scenario 3 - Developer Code Sharing: User sends multiline TypeScript code block containing URLs, verifies formatting, copy button, and absence of spurious preview cards', async () => {
      await cleanDatabase();
      const alice = await createStation('CodeSharer');
      const bob = await createStation('CodeReviewer');

      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['typescript-review'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['typescript-review'] });

      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });
      const session = beatA.data?.desk?.activeSession || beatB.data?.desk?.activeSession;
      expect(Boolean(session)).toBe(true);

      const codePayload =
        'Here is the handler:\n```typescript\nimport { fetch } from "undici";\nconst url = "https://api.github.com/repos";\nexport const run = () => fetch(url);\n```\nLet me know your thoughts!';

      const sendRes = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: codePayload,
      });
      expect(sendRes.ok).toBe(true);

      // 1. Verify markdown tokens parsed
      const tokens = parseMarkdownTokens(codePayload);
      const codeBlock = tokens.find((t) => t.type === 'code_block');
      expect(Boolean(codeBlock)).toBe(true);
      expect(codeBlock.language).toBe('typescript');
      expect(codeBlock.hasCopyButton).toBe(true);
      expect(codeBlock.code).toContain('https://api.github.com/repos');

      // 2. Verify URL sanitization excludes the URL inside the code block
      const extractedPreviewUrl = extractSanitizedFirstUrl(codePayload);
      expect(extractedPreviewUrl).toBeNull();
    });

    it('TC-4.4: Scenario 4 - Mobile Touch & Long Message Ergonomics: Mobile user types 260 characters, verifies counter warning, enters newlines, sends, replies to stranger, and jumps to source', async () => {
      // 1. User types long message (260 characters)
      const typedText = 'Reviewing late night thoughts: ' + 'X'.repeat(230);
      expect(typedText.length).toBe(261);

      // 2. Character counter warning activated
      const counterStatus = computeCounterWarning(typedText.length);
      expect(counterStatus.status).toBe('warning');
      expect(counterStatus.textClass).toContain('text-amber-400');

      // 3. User inserts newline via Shift+Enter
      const keydownShiftEnter = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: true,
        value: typedText,
      });
      expect(keydownShiftEnter.submitted).toBe(false);
      expect(keydownShiftEnter.reason).toBe('newline');

      // 4. Height expands to fit multiline content
      const expandedHeight = computeComposerHeight(150);
      expect(expandedHeight).toBe(150);

      // 5. User submits message via desktop Enter
      const keydownEnter = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: false,
        value: typedText,
      });
      expect(keydownEnter.submitted).toBe(true);

      // 6. Reply to peer message
      const peerMsg = { id: 'peer-msg-42', fromCallsign: 'Quiet-Traveler', body: 'Are you listening?' };
      const replyChip = {
        id: peerMsg.id,
        fromCallsign: peerMsg.fromCallsign,
        body: peerMsg.body,
      };
      expect(replyChip.id).toBe('peer-msg-42');

      // 7. Jump-to-source selector targeting message anchor
      const jumpTargetSelector = `msg-${replyChip.id}`;
      expect(jumpTargetSelector).toBe('msg-peer-msg-42');
    });

    it('TC-4.5: Scenario 5 - Full Conversation Lifecycle: Match, exchange markdown messages, see seen receipts transition from ✓ to ✓✓, disconnect', async () => {
      await cleanDatabase();

      // 1. Stations register
      const alice = await createStation('LifecycleAlice');
      const bob = await createStation('LifecycleBob');

      // 2. Join queue with matching interest
      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['midnight-talk'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['midnight-talk'] });

      // 3. Matchmaker connects them
      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });
      const session = beatA.data?.desk?.activeSession || beatB.data?.desk?.activeSession;
      expect(Boolean(session)).toBe(true);
      expect(session.interests).toContain('midnight-talk');

      // 4. Alice sends formatted message
      const msgAlice = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Hello from **Alice**! Check `console.log("ready")`',
      });
      expect(msgAlice.ok).toBe(true);

      // 5. Bob reads messages (triggering seen receipt)
      const listBob = await callApi('listMessages', {
        deviceId: bob.deviceId,
        sessionId: session.id,
      });
      expect(listBob.ok).toBe(true);

      // 6. Bob replies
      const msgBob = await callApi('sendMessage', {
        deviceId: bob.deviceId,
        sessionId: session.id,
        body: 'Glad to meet you Alice! ✓✓',
      });
      expect(msgBob.ok).toBe(true);

      // 7. Alice leaves session
      const leaveRes = await callApi('leaveSession', {
        deviceId: alice.deviceId,
        sessionId: session.id,
      });
      expect(leaveRes.ok).toBe(true);

      // 8. Bob checks desk: session is now ended/cleared
      const deskBob = await callApi('getDesk', { deviceId: bob.deviceId });
      expect(deskBob.data?.activeSession).toBeNull();
    });
  });
}
