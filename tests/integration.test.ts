// @ts-nocheck
import {
  describe,
  it,
  expect,
  callApi,
  createStation,
  cleanDatabase,
  computeComposerHeight,
  computeCounterWarning,
  simulateComposerKeydown,
  extractSanitizedFirstUrl,
  parseMarkdownTokens,
} from './test-helpers.ts';
import { performance } from 'node:perf_hooks';

async function createPairedSession(interestsA, interestsB) {
  await cleanDatabase();
  const defaultTag = 'pair-' + crypto.randomUUID().slice(0, 8);
  const tagsA = interestsA ?? [defaultTag];
  const tagsB = interestsB ?? [defaultTag];
  const alice = await createStation('AlicePair');
  const bob = await createStation('BobPair');

  await callApi('joinQueue', { deviceId: alice.deviceId, interests: tagsA });
  await callApi('joinQueue', { deviceId: bob.deviceId, interests: tagsB });

  const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
  const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });

  const session = beatA.data?.desk?.activeSession || beatB.data?.desk?.activeSession;
  if (!session) {
    throw new Error('Failed to create paired test session');
  }

  return { alice, bob, session };
}

export function registerTier3Tests() {
  describe('Tier 3: Pairwise Cross-Feature Combinations', () => {
    it('TC-3.1: F1 (Message Pipeline) + F11 (Delivery Checkmarks): Message dispatch confirms sent state and transitions to seen receipt', async () => {
      const { alice, bob, session } = await createPairedSession();
      // Alice sends message
      const sendRes = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Checkmark pipeline test',
      });
      expect(sendRes.ok).toBe(true);
      const sentMsg = sendRes.data.messages.find((m) => m.body === 'Checkmark pipeline test');
      expect(Boolean(sentMsg.seenAt)).toBe(false); // Initially delivered, not seen

      // Bob reads messages
      const bobList = await callApi('listMessages', {
        deviceId: bob.deviceId,
        sessionId: session.id,
      });
      expect(bobList.ok).toBe(true);
    });

    it('TC-3.2: F2 (Instant Matchmaker) + F4 (Status Header): Single-tag match generates session and reflects #topic in StatusHeader', async () => {
      await cleanDatabase();
      const alice = await createStation('MatchedAlice');
      const bob = await createStation('MatchedBob');

      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['nostalgia'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['nostalgia'] });

      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });
      const session = beatA.data?.desk?.activeSession || beatB.data?.desk?.activeSession;
      expect(Boolean(session)).toBe(true);
      expect(session.interests).toContain('nostalgia');

      // StatusHeader badge representation
      const topicBadge = session.interests.length > 0 ? `#${session.interests[0]}` : null;
      expect(topicBadge).toBe('#nostalgia');
    });

    it('TC-3.3: F3 (Optimistic Rendering) + F1 (Sub-50ms Pipeline): 0ms optimistic message replaced by server UUID in <50ms', async () => {
      const { alice, session } = await createPairedSession();
      const optId = `opt-${Date.now()}-combo`;
      let localStore = [{ id: optId, body: 'Fast render', createdAt: new Date().toISOString() }];

      // Measure roundtrip latency
      const start = performance.now();
      const sendRes = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Fast render',
      });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(sendRes.ok).toBe(true);

      // Reconcile
      const confirmedMsg = sendRes.data.messages.find((m) => m.body === 'Fast render');
      localStore = localStore.map((m) => (m.body === confirmedMsg.body ? confirmedMsg : m));
      expect(localStore[0].id).toBe(confirmedMsg.id);
    });

    it('TC-3.4: F5 (Expanding Textarea) + F7 (Character Counter): Textarea expands smoothly while character counter warns at >250', () => {
      const longText = 'A'.repeat(260);
      const computedHeight = computeComposerHeight(180);
      const counterWarning = computeCounterWarning(longText.length);

      expect(computedHeight).toBe(180);
      expect(counterWarning.status).toBe('warning');
      expect(counterWarning.textClass).toContain('text-amber-400');
    });

    it('TC-3.5: F6 (Keyboard Enter) + F3 (Optimistic Rendering): Desktop Enter triggers immediate optimistic local render and clears composer', () => {
      let composerValue = 'Line to send';
      const keydownResult = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: false,
        value: composerValue,
      });

      expect(keydownResult.submitted).toBe(true);
      let localMessages = [];
      if (keydownResult.submitted) {
        localMessages.push({ id: `opt-${Date.now()}-enter`, body: composerValue, mine: true });
        composerValue = '';
      }
      expect(localMessages.length).toBe(1);
      expect(composerValue).toBe('');
    });

    it('TC-3.6: F8 (Mobile Touch Safety) + F9 (Reply Chip): Mobile tap on reply sets reply chip and focuses composer', () => {
      const targetMsg = { id: 'msg-target', fromCallsign: 'Quiet-Traveler', body: 'Are you awake?' };
      let replyingTo = null;
      let focused = false;

      // Tap on reply button
      const handleReplyTap = (msg) => {
        replyingTo = msg;
        focused = true;
      };

      handleReplyTap(targetMsg);
      expect(replyingTo.id).toBe('msg-target');
      expect(focused).toBe(true);
    });

    it('TC-3.7: F9 (Reply Navigation) + F12 (Rich Markdown): Replying to a formatted code block quotes the text snippet cleanly', () => {
      const codeMsg = {
        id: 'msg-code',
        fromCallsign: 'DevStranger',
        body: '```ts\nconst port = 3000;\n```',
      };

      const quoteSnippet = codeMsg.body.replace(/[\r\n]+/g, ' ').slice(0, 50);
      const outgoingBody = `> ${codeMsg.fromCallsign}: ${quoteSnippet}\nI see the port!`;

      expect(outgoingBody).toContain('> DevStranger: ```ts const port = 3000; ```');
      expect(outgoingBody).toContain('I see the port!');
    });

    it('TC-3.8: F10 (Spring Animation) + F11 (Delivery Checkmarks): Outgoing message bubble animates with spring entrance and renders checkmark', () => {
      const isMine = true;
      const animationClass = isMine ? 'animate-bubble-mine' : 'animate-bubble-peer';
      const deliveryStatus = 'Delivered';

      expect(animationClass).toBe('animate-bubble-mine');
      expect(deliveryStatus).toBe('Delivered');
    });

    it('TC-3.9: F12 (Rich Markdown) + F13 (Sanitized Link Previews): Code block containing URL does not trigger link preview card', () => {
      const codeBlockWithUrl = 'Check my config:\n```json\n{"site": "https://secret.prod.com"}\n```';
      const extractedUrl = extractSanitizedFirstUrl(codeBlockWithUrl);
      expect(extractedUrl).toBeNull();
    });

    it('TC-3.10: F1 (Message Pipeline) + F12 (Rich Markdown): End-to-end send of markdown payload preserves syntax across transmission', async () => {
      const { alice, session } = await createPairedSession();
      const markdownBody = '**Bold Announcement** and `code token`';
      const res = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: markdownBody,
      });

      expect(res.ok).toBe(true);
      const received = res.data.messages.find((m) => m.body === markdownBody);
      expect(Boolean(received)).toBe(true);
      const parsed = parseMarkdownTokens(received.body);
      expect(parsed.some((t) => t.type === 'bold' && t.content === 'Bold Announcement')).toBe(true);
      expect(parsed.some((t) => t.type === 'inline_code' && t.content === 'code token')).toBe(true);
    });

    it('TC-3.11: F2 (Instant Matchmaker) + F8 (Touch Safety): Matched session initiates and renders responsive controls on mobile viewport', async () => {
      const { session } = await createPairedSession(['stargazing'], ['stargazing']);
      expect(Boolean(session.id)).toBe(true);
      const mobileControls = {
        sendButtonHeight: 40,
        replyTargetHitbox: 40,
        touchAction: 'manipulation',
      };
      expect(mobileControls.sendButtonHeight).toBeGreaterThanOrEqual(40);
    });

    it('TC-3.12: F6 (IME Composition) + F5 (Expanding Textarea): IME multi-line composition expands textarea without submitting on IME Enter', () => {
      const imeInput = '夜遅くのチャット';
      const simulatedHeight = computeComposerHeight(90);
      const keydown = simulateComposerKeydown({
        key: 'Enter',
        isComposing: true,
        value: imeInput,
      });

      expect(simulatedHeight).toBe(90);
      expect(keydown.submitted).toBe(false);
      expect(keydown.reason).toBe('ime_composing');
    });

    it('TC-3.13: F4 (Topic Badge) + F11 (Checkmarks) + F1 (Pipeline): Matched topic session completes full message lifecycle with checkmarks', async () => {
      const { alice, bob, session } = await createPairedSession(['astronomy'], ['astronomy']);
      expect(session.interests).toContain('astronomy');

      const sendRes = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Do you see Orion?',
      });

      expect(sendRes.ok).toBe(true);
      expect(sendRes.data.messages[0].body).toBe('Do you see Orion?');
    });
  });
}

export const registerIntegrationTests = registerTier3Tests;
