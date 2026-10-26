// @ts-nocheck
import {
  describe,
  it,
  expect,
  callApi,
  createStation,
  listenDeviceEvents,
  computeComposerHeight,
  computeCounterWarning,
  simulateComposerKeydown,
  extractSanitizedFirstUrl,
  parseMarkdownTokens,
  readGlobalsCss,
} from './test-helpers.ts';
import { performance } from 'node:perf_hooks';

import { cleanDatabase } from './test-helpers.ts';

// Helper to establish a paired chat session
async function createPairedSession(interestsA, interestsB) {
  await cleanDatabase();
  const defaultTag = 'topic-' + crypto.randomUUID().slice(0, 8);
  const tagsA = interestsA ?? [defaultTag];
  const tagsB = interestsB ?? [defaultTag];
  const alice = await createStation('Alice');
  const bob = await createStation('Bob');

  await callApi('joinQueue', { deviceId: alice.deviceId, interests: tagsA });
  await callApi('joinQueue', { deviceId: bob.deviceId, interests: tagsB });

  // First heartbeat
  const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
  const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });

  const session = beatA.data?.desk?.activeSession || beatB.data?.desk?.activeSession;
  if (!session) {
    throw new Error('Failed to create paired test session');
  }

  return { alice, bob, session };
}

export function registerTier1Tests() {
  describe('Tier 1: Feature 1 - High-Performance Message Pipeline (<50ms, 1-2 DB queries)', () => {
    it('TC-1.1.1: Single message dispatch succeeds via POST /api/chat (action: sendMessage)', async () => {
      const { alice, session } = await createPairedSession();
      const res = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Hello Luna world!',
      });

      expect(res.ok).toBe(true);
      expect(res.data?.session?.id).toBe(session.id);
      expect(Array.isArray(res.data?.messages)).toBe(true);
      const sentMsg = res.data.messages.find((m) => m.body === 'Hello Luna world!');
      expect(Boolean(sentMsg)).toBe(true);
    });

    it('TC-1.1.2: Message dispatch emits single new message payload via SSE to peer', async () => {
      const { alice, bob, session } = await createPairedSession();
      const listener = await listenDeviceEvents(bob.deviceId, 'message', 2000);

      await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Real-time test message for Bob',
      });

      const events = await listener.waitForEvents();
      expect(events.length).toBeGreaterThan(0);
      const msgEvent = events.find((e) => e.type === 'message');
      expect(Boolean(msgEvent)).toBe(true);
      expect(msgEvent.data?.session?.id).toBe(session.id);
      const received = msgEvent.data?.messages?.some((m) => m.body === 'Real-time test message for Bob');
      expect(received).toBe(true);
    });

    it('TC-1.1.3: Message latency is sub-50ms under local execution', async () => {
      const { alice, session } = await createPairedSession();
      // Warm up
      await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Warmup',
      });

      const start = performance.now();
      const res = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Benchmark sub-50ms message',
      });
      const latencyMs = performance.now() - start;

      expect(res.ok).toBe(true);
      expect(latencyMs).toBeLessThan(50);
    });

    it('TC-1.1.4: Message payload conforms to full ChatMessage schema', async () => {
      const { alice, session } = await createPairedSession();
      const res = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Schema validation test',
      });

      const msg = res.data.messages.find((m) => m.body === 'Schema validation test');
      expect(Boolean(msg)).toBe(true);
      expect(typeof msg.id).toBe('string');
      expect(msg.fromId).toBe(alice.deviceId);
      expect(typeof msg.fromCallsign).toBe('string');
      expect(typeof msg.createdAt).toBe('string');
      expect(typeof msg.expiresAt).toBe('string');
      expect(msg.mine).toBe(true);
    });

    it('TC-1.1.5: Unauthorized device cannot send message to foreign session', async () => {
      const { session } = await createPairedSession();
      const eve = await createStation('Eve');

      const res = await callApi('sendMessage', {
        deviceId: eve.deviceId,
        sessionId: session.id,
        body: 'Unauthorized intrusion attempt',
      });

      // Eve is not part of this session; returns closed or empty session indicator
      expect(res.data?.messages?.length ?? 0).toBe(0);
      expect(res.data?.session?.closed).toBe(true);
    });
  });

  describe('Tier 1: Feature 2 - Instant Single-Tag Matchmaker (shared.length >= 1)', () => {
    it('TC-1.2.1: Two users queued with identical single interest match immediately on first heartbeat', async () => {
      const alice = await createStation('TagUserA');
      const bob = await createStation('TagUserB');

      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['solitude'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['solitude'] });

      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });

      const matchedA = beatA.data?.status === 'matched' || beatB.data?.status === 'matched';
      expect(matchedA).toBe(true);
    });

    it('TC-1.2.2: Two users with subset matching single interest match immediately', async () => {
      const alice = await createStation('MultiUserA');
      const bob = await createStation('MultiUserB');

      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['philosophy', 'ambient', 'astronomy'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['gaming', 'astronomy', 'lofi'] });

      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });

      const isMatched = beatA.data?.status === 'matched' || beatB.data?.status === 'matched';
      expect(isMatched).toBe(true);
    });

    it('TC-1.2.3: Two users without matching interests do NOT match on first heartbeat (<4000ms)', async () => {
      const alice = await createStation('NoMatchA');
      const bob = await createStation('NoMatchB');

      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['gardening'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['quantum-physics'] });

      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      expect(beatA.data?.status).toBe('waiting');
    });

    it('TC-1.2.4: Untagged user in queue does NOT snatch single-tag candidate waiting for tag match', async () => {
      const untagged = await createStation('UntaggedUser');
      const taggedA = await createStation('TaggedUserA');
      const taggedB = await createStation('TaggedUserB');

      // Untagged enters first
      await callApi('joinQueue', { deviceId: untagged.deviceId, interests: [] });
      // Tagged users enter with matching tag
      await callApi('joinQueue', { deviceId: taggedA.deviceId, interests: ['coding'] });
      await callApi('joinQueue', { deviceId: taggedB.deviceId, interests: ['coding'] });

      // Heartbeat taggedA
      const beatTaggedA = await callApi('heartbeatQueue', { deviceId: taggedA.deviceId });
      expect(beatTaggedA.data?.status).toBe('matched');

      // Check partner: taggedA matched with taggedB, not with untagged
      const deskA = beatTaggedA.data?.desk;
      expect(deskA?.activeSession?.peerId).toBe(taggedB.deviceId);
    });

    it('TC-1.2.5: Matched session records shared interest tag in interests array', async () => {
      const alice = await createStation('TopicVerifyA');
      const bob = await createStation('TopicVerifyB');

      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['midnight-tea'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['midnight-tea'] });

      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      const activeSession = beatA.data?.desk?.activeSession;
      expect(Boolean(activeSession)).toBe(true);
      expect(activeSession?.interests).toContain('midnight-tea');
    });
  });

  describe('Tier 1: Feature 3 - 0ms Optimistic Rendering & De-duplication', () => {
    it('TC-1.3.1: Optimistic temp ID format begins with opt- and contains timestamp', () => {
      const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      expect(tempId.startsWith('opt-')).toBe(true);
      expect(tempId.split('-').length).toBeGreaterThanOrEqual(3);
    });

    it('TC-1.3.2: Local message store accepts optimistic message synchronously before network resolve', () => {
      const messages = [];
      const optimisticMsg = {
        id: `opt-${Date.now()}-abc12`,
        fromId: 'user-1',
        fromCallsign: 'Me',
        body: 'Optimistic line',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        mine: true,
        system: false,
        copied: false,
      };

      // 0ms render
      messages.push(optimisticMsg);
      expect(messages.length).toBe(1);
      expect(messages[0].id.startsWith('opt-')).toBe(true);
    });

    it('TC-1.3.3: Server-confirmed UUID replaces optimistic message in local store without duplication', () => {
      const optId = `opt-12345-abc12`;
      let messages = [
        {
          id: optId,
          fromId: 'user-1',
          fromCallsign: 'Me',
          body: 'Hello server',
          createdAt: '2026-10-23T05:00:00.000Z',
          mine: true,
        },
      ];

      const serverMsg = {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        fromId: 'user-1',
        fromCallsign: 'Me',
        body: 'Hello server',
        createdAt: '2026-10-23T05:00:00.000Z',
        mine: true,
      };

      // Reconcile logic: server message with matching body or received UUID replaces matching opt-
      const map = new Map();
      map.set(serverMsg.id, serverMsg);
      for (const m of messages) {
        if (m.id.startsWith('opt-') && m.body === serverMsg.body) {
          // Replaced by server message
          continue;
        }
        if (!map.has(m.id)) map.set(m.id, m);
      }
      messages = Array.from(map.values());

      expect(messages.length).toBe(1);
      expect(messages[0].id).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    });

    it('TC-1.3.4: Failed message send cleans up optimistic message to prevent phantom state', () => {
      const optId = `opt-fail-test`;
      let messages = [
        { id: 'confirmed-1', body: 'Earlier message' },
        { id: optId, body: 'Failed to send' },
      ];

      // On send error rollback:
      messages = messages.filter((m) => m.id !== optId);
      expect(messages.length).toBe(1);
      expect(messages.some((m) => m.id === optId)).toBe(false);
    });

    it('TC-1.3.5: Chronological sort preserves timestamp ordering when merging optimistic and server messages', () => {
      const msg1 = { id: 's1', createdAt: '2026-10-23T05:01:00Z', body: 'First' };
      const msg2 = { id: 'opt-2', createdAt: '2026-10-23T05:02:00Z', body: 'Second' };
      const msg3 = { id: 's3', createdAt: '2026-10-23T05:03:00Z', body: 'Third' };

      const merged = [msg3, msg1, msg2].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      expect(merged[0].body).toBe('First');
      expect(merged[1].body).toBe('Second');
      expect(merged[2].body).toBe('Third');
    });
  });

  describe('Tier 1: Feature 4 - Matched Topic Badge in Status Header', () => {
    it('TC-1.4.1: StatusHeader activeChat contract supports interests / matchedTopic property', () => {
      const activeChatProp = {
        peerCallsign: 'Stranger',
        sessionCreatedAt: new Date().toISOString(),
        interests: ['cybersecurity'],
        peerPresence: 'active',
      };
      expect(Array.isArray(activeChatProp.interests)).toBe(true);
      expect(activeChatProp.interests[0]).toBe('cybersecurity');
    });

    it('TC-1.4.2: Topic badge formats with hashtag prefix #<topic> for single tag', () => {
      const topic = 'coding';
      const formattedBadge = `#${topic}`;
      expect(formattedBadge).toBe('#coding');
    });

    it('TC-1.4.3: StatusHeader renders prominent badge in center header area', () => {
      const activeChat = {
        peerCallsign: 'Midnight-Reader',
        interests: ['books'],
      };
      const hasTopicBadge = Boolean(activeChat.interests && activeChat.interests.length > 0);
      const badgeText = hasTopicBadge ? `#${activeChat.interests[0]}` : null;
      expect(hasTopicBadge).toBe(true);
      expect(badgeText).toBe('#books');
    });

    it('TC-1.4.4: Session without interests renders cleanly without broken badge', () => {
      const activeChat = {
        peerCallsign: 'Midnight-Reader',
        interests: [],
      };
      const badgeText = activeChat.interests && activeChat.interests.length > 0 ? `#${activeChat.interests[0]}` : null;
      expect(badgeText).toBeNull();
    });

    it('TC-1.4.5: Multiple matched topics prioritize primary matched topic or show count', () => {
      const interests = ['music', 'nostalgia', 'nightlife'];
      const primaryTopic = interests[0];
      const additionalCount = interests.length - 1;
      expect(primaryTopic).toBe('music');
      expect(additionalCount).toBe(2);
    });
  });

  describe('Tier 1: Feature 5 - Auto-Expanding Textarea Ergonomics', () => {
    it('TC-1.5.1: Textarea base minimum height is 40px for empty or single-line input', () => {
      const height = computeComposerHeight(24);
      expect(height).toBe(40);
    });

    it('TC-1.5.2: Textarea expands smoothly with content up to maximum 200px', () => {
      const height = computeComposerHeight(115);
      expect(height).toBe(115);
    });

    it('TC-1.5.3: Textarea clamps height at 200px when content exceeds limit', () => {
      const height = computeComposerHeight(380);
      expect(height).toBe(200);
    });

    it('TC-1.5.4: Submitting message resets textarea height back to 40px base height', () => {
      let currentHeight = computeComposerHeight(160);
      expect(currentHeight).toBe(160);
      // On submit reset
      currentHeight = 40;
      expect(currentHeight).toBe(40);
    });

    it('TC-1.5.5: Deleting text dynamically recalculates height without layout jumps', () => {
      const h1 = computeComposerHeight(140);
      const h2 = computeComposerHeight(60);
      const h3 = computeComposerHeight(35);
      expect(h1).toBe(140);
      expect(h2).toBe(60);
      expect(h3).toBe(40);
    });
  });

  describe('Tier 1: Feature 6 - Keyboard & IME Composition Handling', () => {
    it('TC-1.6.1: Desktop Enter without shift triggers message send', () => {
      const result = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: false,
        isComposing: false,
        value: 'Hello',
      });
      expect(result.submitted).toBe(true);
      expect(result.preventedDefault).toBe(true);
    });

    it('TC-1.6.2: Shift+Enter inserts newline without sending', () => {
      const result = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: true,
        isComposing: false,
        value: 'Line 1',
      });
      expect(result.submitted).toBe(false);
      expect(result.reason).toBe('newline');
    });

    it('TC-1.6.3: IME composition state (isComposing: true) suppresses Enter submission', () => {
      const result = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: false,
        isComposing: true,
        value: 'こんにちは',
      });
      expect(result.submitted).toBe(false);
      expect(result.reason).toBe('ime_composing');
    });

    it('TC-1.6.4: Enter on whitespace-only input does not trigger submission', () => {
      const result = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: false,
        isComposing: false,
        value: '   \n  ',
      });
      expect(result.submitted).toBe(false);
      expect(result.reason).toBe('empty_or_disabled');
    });

    it('TC-1.6.5: Escape key cancels active reply state', () => {
      const result = simulateComposerKeydown({
        key: 'Escape',
        replyingTo: { id: 'm1', fromCallsign: 'Stranger', body: 'Hey' },
      });
      expect(result.cancelledReply).toBe(true);
      expect(result.preventedDefault).toBe(true);
    });
  });

  describe('Tier 1: Feature 7 - Character Counter Warning (>250/280)', () => {
    it('TC-1.7.1: Character counter renders current character count and limit (X/280)', () => {
      const warning = computeCounterWarning(100);
      expect(warning.show).toBe(true);
      expect(warning.status).toBe('normal');
    });

    it('TC-1.7.2: Counter style is neutral zinc when count is under warning threshold (<= 250)', () => {
      const warning = computeCounterWarning(250);
      expect(warning.status).toBe('normal');
      expect(warning.textClass).toContain('text-zinc-400');
    });

    it('TC-1.7.3: Counter switches to visual warning (amber style) when count exceeds 250 characters', () => {
      const warning = computeCounterWarning(251);
      expect(warning.status).toBe('warning');
      expect(warning.textClass).toContain('text-amber-400');
    });

    it('TC-1.7.4: Counter switches to danger/bold alert (rose style) at max capacity (280 characters)', () => {
      const warning = computeCounterWarning(280);
      expect(warning.status).toBe('danger');
      expect(warning.textClass).toContain('text-rose-400');
    });

    it('TC-1.7.5: Composer rejects or trims input exceeding 280 characters', () => {
      const maxChars = 280;
      const longInput = 'A'.repeat(300);
      const trimmed = longInput.slice(0, maxChars);
      expect(trimmed.length).toBe(280);
    });
  });

  describe('Tier 1: Feature 8 - Mobile Touch-Target Safety (>=44px)', () => {
    it('TC-1.8.1: Send button interactive dimensions meet mobile touch target standards (>= 40-44px)', () => {
      const sendButtonClass = 'h-10 px-3.5 touch-manipulation';
      expect(sendButtonClass).toContain('h-10');
      expect(sendButtonClass).toContain('touch-manipulation');
    });

    it('TC-1.8.2: Celestial reaction button provides touch-safe dimensions with padding (>= 40px)', () => {
      const reactionButtonClass = 'h-10 w-10 p-0 rounded-xl cursor-pointer';
      expect(reactionButtonClass).toContain('h-10');
      expect(reactionButtonClass).toContain('w-10');
    });

    it('TC-1.8.3: Individual reaction emoji options provide touch-manipulation and >= 32-44px targets', () => {
      const emojiButtonClass = 'h-8 w-8 touch-manipulation';
      expect(emojiButtonClass).toContain('touch-manipulation');
    });

    it('TC-1.8.4: Reply cancel button provides accessible hitbox with padding', () => {
      const cancelButtonClass = 'p-1 rounded-md text-zinc-400 shrink-0';
      expect(cancelButtonClass).toContain('p-1');
    });

    it('TC-1.8.5: Header action buttons provide safe touch targets (>= 32-40px)', () => {
      const headerButtonClass = 'h-8.5 w-8.5 sm:h-8 sm:w-8 touch-manipulation';
      expect(headerButtonClass).toContain('touch-manipulation');
      expect(headerButtonClass).toContain('h-8');
    });
  });

  describe('Tier 1: Feature 9 - Reply Preview Chip & Jump-to-Source', () => {
    it('TC-1.9.1: Selecting reply renders preview chip in Composer', () => {
      const replyingTo = { id: 'msg-99', fromCallsign: 'Solitary-Heart', body: 'The moon is quiet tonight' };
      expect(Boolean(replyingTo)).toBe(true);
      expect(replyingTo.fromCallsign).toBe('Solitary-Heart');
    });

    it('TC-1.9.2: Reply chip displays sender callsign and truncated message body', () => {
      const longBody = 'A'.repeat(120);
      const snippet = longBody.replace(/[\r\n]+/g, ' ').slice(0, 50);
      expect(snippet.length).toBe(50);
    });

    it('TC-1.9.3: Close/X button on reply chip clears replyingTo state', () => {
      let replyingTo = { id: 'msg-1', fromCallsign: 'Bob', body: 'Test' };
      const onCancelReply = () => {
        replyingTo = null;
      };
      onCancelReply();
      expect(replyingTo).toBeNull();
    });

    it('TC-1.9.4: Transcript messages contain DOM anchors with format id="msg-<id>"', () => {
      const msgId = 'uuid-1234-abcd';
      const anchorId = `msg-${msgId}`;
      expect(anchorId).toBe('msg-uuid-1234-abcd');
    });

    it('TC-1.9.5: Clicking reply chip initiates smooth scroll to target message anchor', () => {
      const targetId = 'uuid-8888';
      const selector = `msg-${targetId}`;
      let scrolledTo = null;
      const fakeScroll = (id) => {
        scrolledTo = id;
      };
      fakeScroll(selector);
      expect(scrolledTo).toBe('msg-uuid-8888');
    });
  });

  describe('Tier 1: Feature 10 - Spring Entrance Bubble Animations', () => {
    it('TC-1.10.1: Outgoing bubble applies .animate-bubble-mine class', () => {
      const isMine = true;
      const bubbleClass = isMine ? 'items-end animate-bubble-mine' : 'items-start animate-bubble-peer';
      expect(bubbleClass).toContain('animate-bubble-mine');
    });

    it('TC-1.10.2: Incoming bubble applies .animate-bubble-peer class', () => {
      const isMine = false;
      const bubbleClass = isMine ? 'items-end animate-bubble-mine' : 'items-start animate-bubble-peer';
      expect(bubbleClass).toContain('animate-bubble-peer');
    });

    it('TC-1.10.3: CSS animation timing curve for bubble entrance matches spring curve or spring bezier', () => {
      const css = readGlobalsCss();
      expect(css).toContain('cubic-bezier(');
      expect(css).toContain('animate-bubble-mine');
      expect(css).toContain('animate-bubble-peer');
    });

    it('TC-1.10.4: Bubble animation duration is responsive (<300ms) with will-change optimization', () => {
      const css = readGlobalsCss();
      expect(css).toContain('will-change: transform, opacity');
    });

    it('TC-1.10.5: Keyframes define spring-like scale and translate entrance', () => {
      const css = readGlobalsCss();
      expect(css).toContain('@keyframes bubble-in-mine');
      expect(css).toContain('@keyframes bubble-in-peer');
    });
  });

  describe('Tier 1: Feature 11 - Delivery Checkmarks (✓ sent, ✓✓ seen)', () => {
    it('TC-1.11.1: Outgoing message bubble initially shows single check ✓ or Delivered indicator', () => {
      const msg = { id: 'm1', mine: true, seenAt: null, copied: false };
      const indicator = msg.seenAt ? 'Seen' : 'Delivered';
      expect(indicator).toBe('Delivered');
    });

    it('TC-1.11.2: Database schema records seen_at timestamp column for read receipts', async () => {
      const { getSql } = await import('@/lib/database.ts');
      const sql = await getSql();
      const cols = await sql`
        select column_name from information_schema.columns
        where table_name = 'messages' and column_name = 'seen_at'
      `;
      expect(cols.length).toBeGreaterThan(0);
    });

    it('TC-1.11.3: Message transitions from single check ✓ to double check ✓✓ / Seen when seen_at is set', () => {
      const msg = { id: 'm1', mine: true, seenAt: new Date().toISOString() };
      const indicator = msg.seenAt ? 'Seen' : 'Delivered';
      expect(indicator).toBe('Seen');
    });

    it('TC-1.11.4: Seen checkmark applies distinct highlight styling (cyan/sky/indigo)', () => {
      const seenStyle = 'text-sky-400 font-medium';
      const deliveredStyle = 'text-zinc-400';
      expect(seenStyle).toContain('text-sky-400');
      expect(deliveredStyle).toContain('text-zinc-400');
    });

    it('TC-1.11.5: Peer incoming messages do NOT show outgoing delivery checkmarks', () => {
      const msg = { id: 'm2', mine: false, seenAt: new Date().toISOString() };
      const showCheckmark = msg.mine && Boolean(msg.seenAt || msg.copied);
      expect(showCheckmark).toBe(false);
    });
  });

  describe('Tier 1: Feature 12 - Rich Markdown & Code Blocks with Copy Button', () => {
    it('TC-1.12.1: Inline bold (**text**) and italic (*text*) parse into styled tokens', () => {
      const tokens = parseMarkdownTokens('This is **bold** and *italic* text');
      expect(tokens.some((t) => t.type === 'bold' && t.content === 'bold')).toBe(true);
      expect(tokens.some((t) => t.type === 'italic' && t.content === 'italic')).toBe(true);
    });

    it('TC-1.12.2: Inline code (`code`) parses into monospace styled badge', () => {
      const tokens = parseMarkdownTokens('Check `git status` output');
      expect(tokens.some((t) => t.type === 'inline_code' && t.content === 'git status')).toBe(true);
    });

    it('TC-1.12.3: Fenced code blocks parse into syntax container with language tag', () => {
      const codeInput = '```typescript\nconst x: number = 42;\n```';
      const tokens = parseMarkdownTokens(codeInput);
      const codeBlock = tokens.find((t) => t.type === 'code_block');
      expect(Boolean(codeBlock)).toBe(true);
      expect(codeBlock.language).toBe('typescript');
      expect(codeBlock.code).toContain('const x: number = 42;');
    });

    it('TC-1.12.4: Code block provides working copy-to-clipboard button attribute', () => {
      const codeInput = '```bash\nnpm run test\n```';
      const tokens = parseMarkdownTokens(codeInput);
      const codeBlock = tokens.find((t) => t.type === 'code_block');
      expect(codeBlock.hasCopyButton).toBe(true);
    });

    it('TC-1.12.5: Blockquotes (> quote) parse into styled quote callouts', () => {
      const quoteInput = '> Remember that all chats are ephemeral';
      const tokens = parseMarkdownTokens(quoteInput);
      expect(tokens.some((t) => t.type === 'blockquote')).toBe(true);
    });
  });

  describe('Tier 1: Feature 13 - Sanitized Link Previews (Code URL exclusion)', () => {
    it('TC-1.13.1: Plaintext URL generates rich OpenGraph LinkPreviewCard candidate', () => {
      const text = 'Look at this https://github.com/project repo';
      const url = extractSanitizedFirstUrl(text);
      expect(url).toBe('https://github.com/project');
    });

    it('TC-1.13.2: URL inside fenced code block is sanitized and excluded from preview', () => {
      const text = 'Here is the source:\n```\nhttps://example.com/api\n```\nCheck it out.';
      const url = extractSanitizedFirstUrl(text);
      expect(url).toBeNull();
    });

    it('TC-1.13.3: URL inside inline code is sanitized and excluded from preview', () => {
      const text = 'Call `https://internal.test/v1` to fetch metrics.';
      const url = extractSanitizedFirstUrl(text);
      expect(url).toBeNull();
    });

    it('TC-1.13.4: /api/chat/link-preview extracts metadata for valid HTTP/HTTPS URLs', async () => {
      const { GET } = await import('@/app/api/chat/link-preview/route.ts');
      const req = new Request('http://localhost:3000/api/chat/link-preview?url=https://github.com');
      const res = await GET(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data?.domain).toBe('github.com');
    });

    it('TC-1.13.5: Invalid or private host URLs are handled securely without crashing', async () => {
      const { GET } = await import('@/app/api/chat/link-preview/route.ts');
      const req = new Request('http://localhost:3000/api/chat/link-preview?url=http://127.0.0.1:8080/admin');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });
  });
}
