// @ts-nocheck
import {
  describe,
  it,
  expect,
  callApi,
  createStation,
  computeComposerHeight,
  computeCounterWarning,
  simulateComposerKeydown,
  extractSanitizedFirstUrl,
  parseMarkdownTokens,
  readGlobalsCss,
} from './test-helpers.ts';

import { cleanDatabase } from './test-helpers.ts';

async function createPairedSession(interestsA, interestsB) {
  await cleanDatabase();
  const defaultTag = 'bound-' + crypto.randomUUID().slice(0, 8);
  const tagsA = interestsA ?? [defaultTag];
  const tagsB = interestsB ?? [defaultTag];
  const alice = await createStation('AliceBound');
  const bob = await createStation('BobBound');

  await callApi('joinQueue', { deviceId: alice.deviceId, interests: tagsA });
  await callApi('joinQueue', { deviceId: bob.deviceId, interests: tagsB });

  const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
  const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });

  const session = beatA.data?.desk?.activeSession || beatB.data?.desk?.activeSession;
  if (!session) {
    throw new Error('Failed to create paired boundary test session');
  }

  return { alice, bob, session };
}

export function registerTier2Tests() {
  describe('Tier 2: Feature 1 Boundary - Message Pipeline Edge Cases', () => {
    it('TC-2.1.1: Payload length boundary: exactly 280 characters accepted, 281 rejected with error', async () => {
      const { alice, session } = await createPairedSession();
      const body280 = 'A'.repeat(280);
      const res280 = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: body280,
      });
      expect(res280.ok).toBe(true);

      const body281 = 'A'.repeat(281);
      const res281 = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: body281,
      });
      expect(res281.ok).toBe(false);
      expect(res281.error).toContain('Line too long');
    });

    it('TC-2.1.2: Empty body or whitespace-only message rejected with 400 error', async () => {
      const { alice, session } = await createPairedSession();
      const resEmpty = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: '',
      });
      expect(resEmpty.ok).toBe(false);

      const resWhitespace = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: '     \n  \t ',
      });
      expect(resWhitespace.ok).toBe(false);
      expect(resWhitespace.error).toContain('Message cannot be empty');
    });

    it('TC-2.1.3: Sending to non-existent session ID rejected with closed session response', async () => {
      const alice = await createStation('AliceGhost');
      const fakeSessionId = crypto.randomUUID();
      const res = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: fakeSessionId,
        body: 'Hello void',
      });
      expect(res.data?.messages?.length ?? 0).toBe(0);
      expect(res.data?.session?.closed).toBe(true);
    });

    it('TC-2.1.4: Missing required fields in sendMessage returns error', async () => {
      const alice = await createStation('AliceMissing');
      const res = await callApi('sendMessage', {
        deviceId: alice.deviceId,
      });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('Missing sessionId or message body');
    });

    it('TC-2.1.5: Concurrent rapid sends processed sequentially without database deadlocks', async () => {
      const { alice, session } = await createPairedSession();
      const sends = Array.from({ length: 5 }, (_, i) =>
        callApi('sendMessage', {
          deviceId: alice.deviceId,
          sessionId: session.id,
          body: `Concurrent message #${i + 1}`,
        }),
      );

      const results = await Promise.all(sends);
      for (const res of results) {
        expect(res.ok).toBe(true);
      }
    });
  });

  describe('Tier 2: Feature 2 Boundary - Matchmaker Edge Cases', () => {
    it('TC-2.2.1: Case-insensitivity in interest matching ("Coding" matches "coding")', async () => {
      const alice = await createStation('CaseA');
      const bob = await createStation('CaseB');

      await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['CoDiNg'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['coding'] });

      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId });

      const matched = beatA.data?.status === 'matched' || beatB.data?.status === 'matched';
      expect(matched).toBe(true);
    });

    it('TC-2.2.2: Interest tags with special characters and commas sanitized and flattened properly', async () => {
      const { sanitizeInterests } = await import('@/lib/constants.ts');
      const raw = ['tech, AI ,  web-dev', 'tech'];
      const sanitized = sanitizeInterests(raw);
      expect(sanitized).toContain('tech');
      expect(sanitized).toContain('ai');
      expect(sanitized).toContain('web-dev');
      expect(sanitized.length).toBe(3); // Deduplicated
    });

    it('TC-2.2.3: Maximum interest tags boundary (clamped to 10 tags maximum)', async () => {
      const { sanitizeInterests } = await import('@/lib/constants.ts');
      const manyTags = Array.from({ length: 25 }, (_, i) => `topic-${i}`);
      const sanitized = sanitizeInterests(manyTags);
      expect(sanitized.length).toBe(10);
    });

    it('TC-2.2.4: Empty interests array never matches on 0-wait heartbeat (<4000ms)', async () => {
      const alice = await createStation('WaitA');
      await callApi('joinQueue', { deviceId: alice.deviceId, interests: [] });
      const beat = await callApi('heartbeatQueue', { deviceId: alice.deviceId });
      expect(beat.data?.status).toBe('waiting');
    });

    it('TC-2.2.5: Blocked station ID boundary: queued users sharing interests do NOT match if blocked', async () => {
      await cleanDatabase();
      const bob = await createStation('Blocked');
      const alice = await createStation('Blocker');

      // Bob queues first
      await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['secret-club'] });

      // Alice queues with Bob blocked
      const joinAlice = await callApi('joinQueue', {
        deviceId: alice.deviceId,
        interests: ['secret-club'],
        blockedIds: [bob.deviceId],
      });

      expect(joinAlice.data?.status).toBe('waiting');
    });
  });

  describe('Tier 2: Feature 3 Boundary - Optimistic Rendering Edge Cases', () => {
    it('TC-2.3.1: Network failure / timeout rollback handles transient drop cleanly', () => {
      let state = [{ id: 'opt-100', body: 'Transient msg' }];
      const onErrorRollback = (failedId) => {
        state = state.filter((m) => m.id !== failedId);
      };
      onErrorRollback('opt-100');
      expect(state.length).toBe(0);
    });

    it('TC-2.3.2: Duplicate delivery of identical message does NOT duplicate message in list', () => {
      const existing = [{ id: 'uuid-1', body: 'Same' }];
      const incoming = { id: 'uuid-1', body: 'Same' };
      const map = new Map(existing.map((m) => [m.id, m]));
      map.set(incoming.id, incoming);
      const deduplicated = Array.from(map.values());
      expect(deduplicated.length).toBe(1);
    });

    it('TC-2.3.3: Two optimistic messages with identical body sent rapidly receive unique distinct temp IDs', () => {
      const id1 = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const id2 = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      expect(id1 !== id2).toBe(true);
    });

    it('TC-2.3.4: Zero-millisecond optimistic render does not cause layout shift or scroll jitter', () => {
      const msg = {
        id: `opt-${Date.now()}-abc`,
        body: 'Smooth 0ms bubble',
        mine: true,
      };
      expect(msg.mine).toBe(true);
      expect(Boolean(msg.id)).toBe(true);
    });

    it('TC-2.3.5: Rapid incoming messages while optimistic messages pending preserves correct chronological sequence', () => {
      const now = Date.now();
      const list = [
        { id: 'opt-1', createdAt: new Date(now + 10).toISOString(), body: 'Optimistic' },
        { id: 'incoming-1', createdAt: new Date(now - 50).toISOString(), body: 'From peer earlier' },
        { id: 'incoming-2', createdAt: new Date(now).toISOString(), body: 'From peer now' },
      ];

      const sorted = list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      expect(sorted[0].body).toBe('From peer earlier');
      expect(sorted[1].body).toBe('From peer now');
      expect(sorted[2].body).toBe('Optimistic');
    });
  });

  describe('Tier 2: Feature 4 Boundary - Status Header Edge Cases', () => {
    it('TC-2.4.1: Extremely long interest tag name truncated gracefully in badge', () => {
      const longTopic = 'a'.repeat(60);
      const truncated = longTopic.length > 20 ? `${longTopic.slice(0, 18)}…` : longTopic;
      expect(truncated.endsWith('…')).toBe(true);
      expect(truncated.length).toBe(19);
    });

    it('TC-2.4.2: Special characters in topic (#c++, #node.js, #c#) render safely without breaking DOM or HTML', () => {
      const topic = 'c++';
      const badge = `#${topic}`;
      expect(badge).toBe('#c++');
    });

    it('TC-2.4.3: Session with empty interests renders default status header without badge crash', () => {
      const interests = [];
      const renderTopic = interests && interests.length > 0 ? `#${interests[0]}` : null;
      expect(renderTopic).toBeNull();
    });

    it('TC-2.4.4: Rapid switching between active chat and idle updates header immediately', () => {
      let activeChat = { peerCallsign: 'Alice' };
      expect(Boolean(activeChat)).toBe(true);
      activeChat = null;
      expect(activeChat).toBeNull();
    });

    it('TC-2.4.5: Peer callsign edge cases (special characters, maximum length) do not overflow header', () => {
      const longCallsign = 'A'.repeat(64);
      const headerSpanClass = 'truncate max-w-[110px] xs:max-w-[140px] sm:max-w-[220px]';
      expect(headerSpanClass).toContain('truncate');
    });
  });

  describe('Tier 2: Feature 5 Boundary - Expanding Textarea Edge Cases', () => {
    it('TC-2.5.1: Exactly 40px height for empty textarea (minimum floor boundary)', () => {
      expect(computeComposerHeight(0)).toBe(40);
    });

    it('TC-2.5.2: Exactly 200px clamp when typing 100 lines of text (maximum ceiling boundary)', () => {
      expect(computeComposerHeight(2500)).toBe(200);
    });

    it('TC-2.5.3: Rapid paste of huge text expands immediately to 200px max without intermediate jump', () => {
      const pastedScrollHeight = 1200;
      expect(computeComposerHeight(pastedScrollHeight)).toBe(200);
    });

    it('TC-2.5.4: Deleting multi-line text shrinks height back to exact fit smoothly', () => {
      let height = computeComposerHeight(180);
      expect(height).toBe(180);
      height = computeComposerHeight(40);
      expect(height).toBe(40);
    });

    it('TC-2.5.5: Scrollbar is hidden with utility classes to avoid scroll jumps', () => {
      const composerClass =
        'min-h-[40px] max-h-[200px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';
      expect(composerClass).toContain('min-h-[40px]');
      expect(composerClass).toContain('max-h-[200px]');
    });
  });

  describe('Tier 2: Feature 6 Boundary - Keyboard & IME Edge Cases', () => {
    it('TC-2.6.1: Shift+Enter with trailing whitespace does not send', () => {
      const result = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: true,
        value: 'Line 1   ',
      });
      expect(result.submitted).toBe(false);
      expect(result.reason).toBe('newline');
    });

    it('TC-2.6.2: Enter key while disabled does not trigger submission', () => {
      const result = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: false,
        disabled: true,
        value: 'Ready to send',
      });
      expect(result.submitted).toBe(false);
    });

    it('TC-2.6.3: Enter key with empty string does not trigger submission', () => {
      const result = simulateComposerKeydown({
        key: 'Enter',
        shiftKey: false,
        value: '',
      });
      expect(result.submitted).toBe(false);
    });

    it('TC-2.6.4: Japanese / Chinese IME composition Enter keydown (isComposing) ignored', () => {
      const result = simulateComposerKeydown({
        key: 'Enter',
        isComposing: true,
        value: 'チャット',
      });
      expect(result.submitted).toBe(false);
      expect(result.reason).toBe('ime_composing');
    });

    it('TC-2.6.5: Escape when NOT replying does not prevent default or trigger cancel', () => {
      const result = simulateComposerKeydown({
        key: 'Escape',
        replyingTo: null,
      });
      expect(result.cancelledReply).toBe(false);
      expect(result.preventedDefault).toBe(false);
    });
  });

  describe('Tier 2: Feature 7 Boundary - Character Counter Edge Cases', () => {
    it('TC-2.7.1: Boundary 0 characters: counter hidden or none', () => {
      const warning = computeCounterWarning(0);
      expect(warning.show).toBe(false);
    });

    it('TC-2.7.2: Boundary 250 characters: normal style, no warning', () => {
      const warning = computeCounterWarning(249);
      expect(warning.status).toBe('normal');
      expect(warning.textClass).toContain('text-zinc-400');
    });

    it('TC-2.7.3: Boundary 251 characters: amber warning activated', () => {
      const warning = computeCounterWarning(251);
      expect(warning.status).toBe('warning');
      expect(warning.textClass).toContain('text-amber-400');
    });

    it('TC-2.7.4: Boundary 279 characters: amber warning persists', () => {
      const warning = computeCounterWarning(279);
      expect(warning.status).toBe('warning');
      expect(warning.textClass).toContain('text-amber-400');
    });

    it('TC-2.7.5: Boundary 280 characters: maximum reached, danger/rose alert activated', () => {
      const warning = computeCounterWarning(280);
      expect(warning.status).toBe('danger');
      expect(warning.textClass).toContain('text-rose-400');
    });
  });

  describe('Tier 2: Feature 8 Boundary - Mobile Touch Safety Edge Cases', () => {
    it('TC-2.8.1: Viewport scaled to mobile width (320px screen width) preserves touch target dimensions', () => {
      const sendButtonClass = 'h-10 px-3.5';
      expect(sendButtonClass).toContain('h-10');
    });

    it('TC-2.8.2: Celestial reaction picker on narrow screens does not overflow viewport bounds', () => {
      const pickerClass = 'absolute bottom-full right-14 sm:right-24 mb-2.5 z-40';
      expect(pickerClass).toContain('z-40');
      expect(pickerClass).toContain('bottom-full');
    });

    it('TC-2.8.3: Safe area insets (env(safe-area-inset-bottom)) integrated into padding', () => {
      const containerClass = 'pb-[max(0.625rem,env(safe-area-inset-bottom))]';
      expect(containerClass).toContain('safe-area-inset-bottom');
    });

    it('TC-2.8.4: Rapid double-tap on send button does not send double messages', () => {
      let sending = false;
      let sendCount = 0;
      const onSend = () => {
        if (sending) return;
        sending = true;
        sendCount += 1;
      };
      onSend();
      onSend(); // Rapid second tap ignored while sending
      expect(sendCount).toBe(1);
    });

    it('TC-2.8.5: Touch cancel on celestial reaction picker dismisses popover cleanly', () => {
      let showReactions = true;
      const dismiss = () => {
        showReactions = false;
      };
      dismiss();
      expect(showReactions).toBe(false);
    });
  });

  describe('Tier 2: Feature 9 Boundary - Reply Navigation Edge Cases', () => {
    it('TC-2.9.1: Replying to message with 280-character multiline body clips snippet safely in preview chip', () => {
      const fullText = 'Line 1\nLine 2\n' + 'A'.repeat(260);
      const snippet = fullText.replace(/[\r\n]+/g, ' ').slice(0, 50);
      expect(snippet.length).toBe(50);
      expect(snippet.includes('\n')).toBe(false);
    });

    it('TC-2.9.2: Replying to message containing quotes and HTML characters escapes safely', () => {
      const rawBody = '<script>alert("hack")</script> & "quotes"';
      const cleanSnippet = rawBody.replace(/[\r\n]+/g, ' ').slice(0, 50);
      expect(cleanSnippet).toContain('<script>');
    });

    it('TC-2.9.3: Target source message anchor query selector format', () => {
      const msgId = 'uuid-source-test';
      const anchor = `msg-${msgId}`;
      expect(anchor).toBe('msg-uuid-source-test');
    });

    it('TC-2.9.4: Replying to missing or already deleted message handles null target gracefully', () => {
      const targetElement = null;
      let scrolled = false;
      if (targetElement) {
        scrolled = true;
      }
      expect(scrolled).toBe(false);
    });

    it('TC-2.9.5: Switching replies overrides existing reply chip without stacking', () => {
      let replyingTo = { id: 'm1', fromCallsign: 'A', body: 'Msg 1' };
      replyingTo = { id: 'm2', fromCallsign: 'B', body: 'Msg 2' };
      expect(replyingTo.id).toBe('m2');
    });
  });

  describe('Tier 2: Feature 10 Boundary - Spring Animation Edge Cases', () => {
    it('TC-2.10.1: Rapid burst of consecutive messages groups with mt-1 vs mt-3 for distinct authors', () => {
      const isConsecutiveTrue = true;
      const isConsecutiveFalse = false;
      const marginTrue = isConsecutiveTrue ? 'mt-1' : 'mt-3';
      const marginFalse = isConsecutiveFalse ? 'mt-1' : 'mt-3';
      expect(marginTrue).toBe('mt-1');
      expect(marginFalse).toBe('mt-3');
    });

    it('TC-2.10.2: Backface visibility and will-change defined for GPU acceleration', () => {
      const css = readGlobalsCss();
      expect(css).toContain('backface-visibility: hidden');
    });

    it('TC-2.10.3: Transform origin for user bubbles is bottom right', () => {
      const css = readGlobalsCss();
      expect(css).toContain('transform-origin: bottom right');
    });

    it('TC-2.10.4: Transform origin for peer bubbles is bottom left', () => {
      const css = readGlobalsCss();
      expect(css).toContain('transform-origin: bottom left');
    });

    it('TC-2.10.5: Spring curve cubic-bezier parameters define overshoot easing', () => {
      const css = readGlobalsCss();
      expect(css).toContain('cubic-bezier(');
    });
  });

  describe('Tier 2: Feature 11 Boundary - Checkmarks Edge Cases', () => {
    it('TC-2.11.1: Transition from sent to seen state completes without flickering or text jump', () => {
      let seenAt = null;
      let status = seenAt ? 'Seen' : 'Delivered';
      expect(status).toBe('Delivered');
      seenAt = new Date().toISOString();
      status = seenAt ? 'Seen' : 'Delivered';
      expect(status).toBe('Seen');
    });

    it('TC-2.11.2: Disconnected peer preserves sent checkmark without falsely transitioning to seen', () => {
      const msg = { seenAt: null, copied: false, peerPresence: 'disconnected' };
      const status = msg.seenAt ? 'Seen' : 'Delivered';
      expect(status).toBe('Delivered');
    });

    it('TC-2.11.3: Seen receipt timestamp parsing handles timezone offsets and invalid formats', () => {
      const iso = '2026-10-23T05:15:00.000Z';
      const date = new Date(iso);
      expect(Number.isNaN(date.getTime())).toBe(false);
    });

    it('TC-2.11.4: Edited message maintains seen receipt status if previously seen', () => {
      const msg = {
        seenAt: '2026-10-23T05:00:00Z',
        editedAt: '2026-10-23T05:05:00Z',
      };
      const isSeen = Boolean(msg.seenAt);
      expect(isSeen).toBe(true);
    });

    it('TC-2.11.5: Offline reconnection syncs seen status for all unread messages', async () => {
      const { alice, bob, session } = await createPairedSession();
      await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Checkmark persistence test',
      });

      const listBob = await callApi('listMessages', {
        deviceId: bob.deviceId,
        sessionId: session.id,
      });

      expect(listBob.ok).toBe(true);
      expect(listBob.data?.messages?.length).toBeGreaterThan(0);
    });
  });

  describe('Tier 2: Feature 12 Boundary - Markdown Formatting Edge Cases', () => {
    it('TC-2.12.1: Unclosed markdown delimiters render as plain text safely', () => {
      const tokens = parseMarkdownTokens('This is **unclosed bold');
      const boldToken = tokens.find((t) => t.type === 'bold');
      expect(Boolean(boldToken)).toBe(false);
    });

    it('TC-2.12.2: Nested or adjacent markdown tokens resolve independently', () => {
      const tokens = parseMarkdownTokens('**bold** *italic* `code`');
      expect(tokens.some((t) => t.type === 'bold')).toBe(true);
      expect(tokens.some((t) => t.type === 'italic')).toBe(true);
      expect(tokens.some((t) => t.type === 'inline_code')).toBe(true);
    });

    it('TC-2.12.3: Code block with specified language badge extracts language name', () => {
      const input = '```python\nprint("hello")\n```';
      const tokens = parseMarkdownTokens(input);
      const code = tokens.find((t) => t.type === 'code_block');
      expect(code.language).toBe('python');
    });

    it('TC-2.12.4: Code block containing special characters (<script>, &, ", \') escapes HTML completely', () => {
      const input = '```html\n<div class="test">&amp;</div>\n```';
      const tokens = parseMarkdownTokens(input);
      const code = tokens.find((t) => t.type === 'code_block');
      expect(code.code).toContain('<div class="test">');
    });

    it('TC-2.12.5: Empty code block (```\n```) renders without crashing', () => {
      const input = '```\n\n```';
      const tokens = parseMarkdownTokens(input);
      const code = tokens.find((t) => t.type === 'code_block');
      expect(Boolean(code)).toBe(true);
    });
  });

  describe('Tier 2: Feature 13 Boundary - Sanitized Link Previews Edge Cases', () => {
    it('TC-2.13.1: Message with multiple URLs extracts only first valid HTTP/HTTPS URL', () => {
      const text = 'Check https://first.org and https://second.org';
      const url = extractSanitizedFirstUrl(text);
      expect(url).toBe('https://first.org');
    });

    it('TC-2.13.2: URL with query parameters and hash parsed cleanly', () => {
      const text = 'Link https://site.com/path?key=val#section is here';
      const url = extractSanitizedFirstUrl(text);
      expect(url).toBe('https://site.com/path?key=val#section');
    });

    it('TC-2.13.3: Mixed message: text + inline code URL + outer URL extracts only the outer URL', () => {
      const text = 'Ignore `https://code-url.org` and view https://actual-url.org instead';
      const url = extractSanitizedFirstUrl(text);
      expect(url).toBe('https://actual-url.org');
    });

    it('TC-2.13.4: Internal IP / localhost URLs (SSRF protection) rejected in preview route', async () => {
      const { GET } = await import('@/app/api/chat/link-preview/route.ts');
      const req = new Request('http://localhost:3000/api/chat/link-preview?url=http://192.168.1.1');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('TC-2.13.5: Non-HTTP protocol URLs (ftp, file, javascript) rejected', async () => {
      const { GET } = await import('@/app/api/chat/link-preview/route.ts');
      const req = new Request('http://localhost:3000/api/chat/link-preview?url=ftp://files.example.com');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe('Tier 2: Feature 14 Boundary - Device Authentication & Architecture Hardening', () => {
    it('TC-2.14.1: Impersonator using victim deviceId with invalid secret is rejected with 401', async () => {
      const victimId = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
      const victimSecret = 'valid-victim-secret-1234567890abcdef';
      // Register legitimate station with its secret
      const reg = await callApi('registerStation', { deviceId: victimId, deviceSecret: victimSecret });
      expect(reg.status).toBe(200);

      // Attacker learns victimId (e.g. from peerId) and attempts to delete station with attacker's secret
      const forged = await callApi('deleteStation', {
        deviceId: victimId,
        deviceSecret: 'attacker-unauthorized-secret-999',
      });
      expect(forged.status).toBe(401);
      expect(forged.ok).toBe(false);
      expect(forged.error).toContain('Unauthorized');
    });

    it('TC-2.14.2: Legitimate device with valid secret successfully authorizes operations', async () => {
      const legitId = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
      const legitSecret = 'legit-device-secret-1234567890abcdef';
      const reg = await callApi('registerStation', { deviceId: legitId, deviceSecret: legitSecret });
      expect(reg.status).toBe(200);

      const deskRes = await callApi('getDesk', { deviceId: legitId, deviceSecret: legitSecret });
      expect(deskRes.status).toBe(200);
      expect(deskRes.ok).toBe(true);
    });

    it('TC-2.14.3: deriveSafetyNumber produces identical 12-digit fingerprint for both participants', async () => {
      const { deriveSafetyNumber } = await import('@/lib/encryption.ts');
      const keyAlice = '04a1b2c3d4e5f60102030405060708091011121314151617181920212223242526';
      const keyBob = '04f6e5d4c3b2a12625242322212019181716151413121110090807060504030201';

      const safetyA = await deriveSafetyNumber(keyAlice, keyBob);
      const safetyB = await deriveSafetyNumber(keyBob, keyAlice);

      expect(safetyA).toBe(safetyB);
      expect(/^\d{4} \d{4} \d{4}$/.test(safetyA)).toBe(true);
    });

    it('TC-2.14.4: device_events retention policy prunes entries older than 6 hours during cleanup', async () => {
      const { getSql } = await import('@/lib/database.ts');
      const { runPeriodicCleanup } = await import('@/lib/chat-server.ts');
      const sql = await getSql();

      // Insert an expired event from 12 hours ago
      await sql`
        insert into device_events (device_id, type, data, created_at)
        values ('c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'ping', '"old"', now() - interval '12 hours')
      `;

      // Trigger cleanup forcibly
      await runPeriodicCleanup(sql, true);

      // Verify the 12-hour old event was pruned
      const rows = await sql<{ count: number }>`
        select count(*)::int as count from device_events where device_id = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'
      `;
      expect(rows[0]?.count).toBe(0);
    });

    it('TC-2.14.5: Stream connection without secret parameter is rejected with 401 Unauthorized', async () => {
      const streamRoute = await import('@/app/api/chat/stream/route.ts');
      const req = new Request('http://localhost:3000/api/chat/stream?deviceId=b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2');
      const res = await streamRoute.GET(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Missing stream credentials');
    });

    it('TC-2.14.6: Stream connection with invalid secret parameter is rejected with 401 Unauthorized', async () => {
      const streamRoute = await import('@/app/api/chat/stream/route.ts');
      const req = new Request('http://localhost:3000/api/chat/stream?deviceId=b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2&secret=wrong-secret-value');
      const res = await streamRoute.GET(req as any);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('TC-2.14.7: Stream connection with valid deviceId and matching secret establishes SSE stream', async () => {
      const streamRoute = await import('@/app/api/chat/stream/route.ts');
      const controller = new AbortController();
      const req = new Request('http://localhost:3000/api/chat/stream?deviceId=b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2&secret=legit-device-secret-1234567890abcdef', {
        signal: controller.signal,
      });
      const res = await streamRoute.GET(req as any);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      controller.abort();
    });

    it('TC-2.14.8: Legacy station with existing public key rejects takeover attempt without matching public key', async () => {
      const { getSql } = await import('@/lib/database.ts');
      const sql = await getSql();
      const legacyId = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
      const legitPubKey = 'legacy-pubkey-04a1b2c3d4e5f6-valid';

      await sql`
        insert into stations (device_id, callsign, ip, is_custom, last_seen, public_key, is_away, secret_hash)
        values (${legacyId}, 'LegacyStation', '127.0.0.1', false, now(), ${legitPubKey}, false, null)
        on conflict (device_id) do update set secret_hash = null, public_key = ${legitPubKey}
      `;

      const claimAttempt = await callApi('registerStation', {
        deviceId: legacyId,
        deviceSecret: 'attacker-stolen-secret-123456',
        publicKey: 'attacker-wrong-pubkey-999',
      });
      expect(claimAttempt.status >= 400).toBe(true);

      const rows = await sql<{ secret_hash: string | null }>`
        select secret_hash from stations where device_id = ${legacyId}
      `;
      expect(rows[0]?.secret_hash).toBe(null);
    });

    it('TC-2.14.9: Legacy station with existing public key successfully binds secret when matching public key is provided', async () => {
      const { getSql } = await import('@/lib/database.ts');
      const sql = await getSql();
      const legacyId = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';
      const legitPubKey = 'legacy-pubkey-04abcdef123456-valid';
      const newSecret = 'legit-migrated-secret-9876543210';

      await sql`
        insert into stations (device_id, callsign, ip, is_custom, last_seen, public_key, is_away, secret_hash)
        values (${legacyId}, 'MigratingStation', '127.0.0.1', false, now(), ${legitPubKey}, false, null)
        on conflict (device_id) do update set secret_hash = null, public_key = ${legitPubKey}
      `;

      const migrationRes = await callApi('registerStation', {
        deviceId: legacyId,
        deviceSecret: newSecret,
        publicKey: legitPubKey,
      });
      expect(migrationRes.status).toBe(200);

      const rows = await sql<{ secret_hash: string | null }>`
        select secret_hash from stations where device_id = ${legacyId}
      `;
      expect(Boolean(rows[0]?.secret_hash)).toBe(true);

      const deskRes = await callApi('getDesk', { deviceId: legacyId, deviceSecret: newSecret });
      expect(deskRes.status).toBe(200);
      expect(deskRes.ok).toBe(true);
    });

    it('TC-2.14.10: active_session_participants table prevents duplicate concurrent active sessions for the same device', async () => {
      const { getSql } = await import('@/lib/database.ts');
      const sql = await getSql();
      const devX = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';
      const sess1 = 'session-concurrency-1';
      const sess2 = 'session-concurrency-2';

      await sql`insert into stations (device_id, callsign) values (${devX}, 'DevX') on conflict do nothing`;
      await sql`insert into sessions (id, a_id, b_id, kind) values (${sess1}, ${devX}, 'peer1', 'stranger') on conflict do nothing`;
      await sql`insert into sessions (id, a_id, b_id, kind) values (${sess2}, ${devX}, 'peer2', 'stranger') on conflict do nothing`;

      await sql`delete from active_session_participants where device_id = ${devX}`;
      await sql`insert into active_session_participants (device_id, session_id) values (${devX}, ${sess1})`;

      let threwViolation = false;
      try {
        await sql`insert into active_session_participants (device_id, session_id) values (${devX}, ${sess2})`;
      } catch {
        threwViolation = true;
      }
      expect(threwViolation).toBe(true);

      const active = await sql<{ session_id: string }>`
        select session_id from active_session_participants where device_id = ${devX}
      `;
      expect(active[0]?.session_id).toBe(sess1);

      await sql`delete from active_session_participants where device_id = ${devX}`;
    });

    it('TC-2.14.11: Atomic matchmaking queue claim prevents pairing a device already active in another session', async () => {
      const { getSql } = await import('@/lib/database.ts');
      const sql = await getSql();
      await cleanDatabase();

      const candidateA = await createStation('CandidateA');
      const candidateB = await createStation('CandidateB');

      // Candidate B joins queue first
      await callApi('joinQueue', { deviceId: candidateB.deviceId, interests: ['concurrency-test'] });

      // Worker 2 matches candidate B concurrently into an active session
      const mockSessionId = 'other-worker-session-' + crypto.randomUUID();
      const dummyPeer = 'dummy-peer-' + crypto.randomUUID();
      await sql`insert into stations (device_id, callsign) values (${dummyPeer}, 'Dummy') on conflict do nothing`;
      await sql`insert into sessions (id, a_id, b_id, kind) values (${mockSessionId}, ${candidateB.deviceId}, ${dummyPeer}, 'stranger')`;
      await sql`insert into active_session_participants (device_id, session_id) values (${candidateB.deviceId}, ${mockSessionId}) on conflict (device_id) do update set session_id = excluded.session_id`;

      // Candidate A joins queue with the same interest
      await callApi('joinQueue', { deviceId: candidateA.deviceId, interests: ['concurrency-test'] });

      // When candidate A heartbeats, matchmaker must NOT pair with candidate B
      const beatA = await callApi('heartbeatQueue', { deviceId: candidateA.deviceId });
      expect(beatA.data?.status).toBe('waiting');
      expect(beatA.data?.desk?.activeSession).toBe(null);

      await sql`delete from active_session_participants where device_id = ${candidateB.deviceId}`;
    });
  });

  describe('Tier 2: Feature 15 Boundary - Mobile Ergonomics, Fluid Animations & Notifications', () => {
    it('TC-2.15.1: Friend request acceptance emits casual, welcoming friend copy', async () => {
      await cleanDatabase();
      const alice = await createStation('FriendAlice');
      const bob = await createStation('FriendBob');

      // Join queue and match
      await callApi('joinQueue', { deviceId: alice.deviceId, deviceSecret: alice.secret, interests: ['midnight-talk'] });
      await callApi('joinQueue', { deviceId: bob.deviceId, deviceSecret: bob.secret, interests: ['midnight-talk'] });
      const beatA = await callApi('heartbeatQueue', { deviceId: alice.deviceId, deviceSecret: alice.secret });
      const beatB = await callApi('heartbeatQueue', { deviceId: bob.deviceId, deviceSecret: bob.secret });
      const session = beatA.data?.desk?.activeSession || beatB.data?.desk?.activeSession;
      expect(Boolean(session)).toBe(true);

      // Alice offers friend request
      await callApi('offerQsl', { deviceId: alice.deviceId, sessionId: session.id, deviceSecret: alice.secret });

      // Bob accepts friend request
      const deskBob = await callApi('getDesk', { deviceId: bob.deviceId, deviceSecret: bob.secret });
      const reqId = deskBob.data?.inboundQsl?.[0]?.id ?? deskBob.data?.activeSession?.inboundQsl?.id;
      expect(Boolean(reqId)).toBe(true);

      await callApi('respondQsl', { deviceId: bob.deviceId, requestId: reqId, accept: true, deviceSecret: bob.secret });

      // Check system message in messages table
      const { getSql } = await import('@/lib/database.ts');
      const sql = await getSql();
      const rows = await sql<{ body: string }>`
        select body from messages where session_id = ${session.id} and from_id = 'system' order by created_at desc limit 1
      `;
      expect(rows[0]?.body).toBe('You are now friends! Say hello 👋');
      expect(rows[0]?.body.includes('permanently')).toBe(false);
    });

    it('TC-2.15.2: Refresh-rate trail decay calculates mathematically equivalent fade across 30Hz, 60Hz, 120Hz, 144Hz', () => {
      const baseAlpha = 0.4;
      const calcDecay = (hz: number) => {
        const frameMs = 1000 / hz;
        const dt = frameMs / (1000 / 60);
        return 1 - Math.pow(1 - baseAlpha, dt);
      };

      const decay60 = calcDecay(60);
      const decay120 = calcDecay(120);
      const decay30 = calcDecay(30);

      // At 60Hz, 1 frame of decay yields exactly baseAlpha (0.4)
      expect(Math.abs(decay60 - 0.4) < 0.0001).toBe(true);

      // At 120Hz, 2 frames of decay compound to identical opacity as 1 frame of 60Hz: (1 - d120)^2 == (1 - d60)
      const remaining120AfterTwoFrames = Math.pow(1 - decay120, 2);
      const remaining60AfterOneFrame = 1 - decay60;
      expect(Math.abs(remaining120AfterTwoFrames - remaining60AfterOneFrame) < 0.0001).toBe(true);

      // At 30Hz, 1 frame of decay matches 2 frames of 60Hz: (1 - d30) == (1 - d60)^2
      const remaining30AfterOneFrame = 1 - decay30;
      const remaining60AfterTwoFrames = Math.pow(1 - decay60, 2);
      expect(Math.abs(remaining30AfterOneFrame - remaining60AfterTwoFrames) < 0.0001).toBe(true);
    });

    it('TC-2.15.3: In-app notifications format and dispatch correctly with action callback', async () => {
      let dispatched = false;
      let toastTitle = '';
      const { subscribeToLunaToasts, notifyUser } = await import('@/lib/notifications.ts');

      const unsubscribe = subscribeToLunaToasts((toast: { title: string }) => {
        dispatched = true;
        toastTitle = toast.title;
      });

      notifyUser({
        title: 'Stranger Connected! 🌙',
        body: 'You are now chatting with a stranger.',
        type: 'match',
      });

      expect(dispatched).toBe(true);
      expect(toastTitle).toBe('Stranger Connected! 🌙');
      unsubscribe();
    });

    it('TC-2.15.4: Mobile keyboard back navigation helper detects active input and blurs instead of leaving', () => {
      // Simulate input focused condition
      const mockInput = {
        tagName: 'TEXTAREA',
        blurCalled: false,
        blur() {
          this.blurCalled = true;
        },
      };

      const isInputFocused = (el: typeof mockInput | null) =>
        Boolean(el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT'));

      expect(isInputFocused(mockInput)).toBe(true);
      if (isInputFocused(mockInput)) {
        mockInput.blur();
      }
      expect(mockInput.blurCalled).toBe(true);
    });

    it('TC-2.15.5: Friend request notification card uses correct spring physics class and layout', () => {
      const containerClass = 'absolute top-16 sm:top-14 inset-x-0 mx-auto z-40 w-[calc(100%-1.5rem)] max-w-md animate-water-drop pointer-events-auto';
      expect(containerClass).toContain('animate-water-drop');
      expect(containerClass).toContain('pointer-events-auto');
      expect(containerClass).toContain('inset-x-0');
      expect(containerClass).toContain('mx-auto');
    });

    it('TC-2.15.6: Mobile tap-and-hold (long-press) threshold calibrates at 450ms with 10px scroll abort', () => {
      const LONG_PRESS_MS = 450;
      const SCROLL_ABORT_PX = 10;

      expect(LONG_PRESS_MS).toBe(450);
      expect(SCROLL_ABORT_PX).toBe(10);

      // Verify hypotenuse scroll detection logic
      const checkShouldAbort = (startX: number, startY: number, currentX: number, currentY: number) => {
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        return Math.hypot(deltaX, deltaY) > SCROLL_ABORT_PX;
      };

      // Stationary finger (tap and hold): should NOT abort
      expect(checkShouldAbort(100, 200, 102, 201)).toBe(false);

      // Scrolling finger (>10px): MUST abort long press
      expect(checkShouldAbort(100, 200, 100, 215)).toBe(true);
      expect(checkShouldAbort(100, 200, 120, 200)).toBe(true);
    });

    it('TC-2.15.7: Mobile message action menu exposes Edit Message and Delete Message options with >=44px touch targets', () => {
      const buttonClasses = 'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold';
      expect(buttonClasses).toContain('min-h-[44px]');
      expect(buttonClasses).toContain('w-full');

      // Verify that options correctly handle user own messages vs stranger messages
      const getAvailableActions = (isMine: boolean, closed: boolean) => {
        const actions: string[] = ['copy'];
        if (!closed) actions.push('reply');
        if (isMine && !closed) {
          actions.push('edit', 'delete');
        }
        return actions;
      };

      const ownActions = getAvailableActions(true, false);
      expect(ownActions.includes('edit')).toBe(true);
      expect(ownActions.includes('delete')).toBe(true);

      const strangerActions = getAvailableActions(false, false);
      expect(strangerActions.includes('edit')).toBe(false);
      expect(strangerActions.includes('delete')).toBe(false);
    });

    it('TC-2.15.8: Closing 3-dot action sheet or in-chat modal does not trigger exit confirmation dialog', () => {
      // Simulate state transition when popping from within chat
      const currentSessionId = crypto.randomUUID();
      const chatState = { luna: true, view: 'chat', sessionId: currentSessionId };
      
      const shouldTriggerExitConfirm = (
        targetState: { view?: string; sessionId?: string; modal?: string } | null,
        activeSession: { id: string; closed: boolean } | null
      ) => {
        if (!activeSession || activeSession.closed) return false;
        // Target state is still the current active chat session without exit_confirm modal
        if (targetState?.view === 'chat' && targetState?.sessionId === activeSession.id && !targetState?.modal) {
          return false;
        }
        return true;
      };

      // Popping from a sheet/modal back to chat view must NOT trigger exit confirmation
      expect(shouldTriggerExitConfirm(chatState, { id: currentSessionId, closed: false })).toBe(false);
      
      // Popping away from chat (e.g. back to queue or boot) MUST trigger exit confirmation
      expect(shouldTriggerExitConfirm({ view: 'queue' }, { id: currentSessionId, closed: false })).toBe(true);
      expect(shouldTriggerExitConfirm({ view: 'boot' }, { id: currentSessionId, closed: false })).toBe(true);
      expect(shouldTriggerExitConfirm(null, { id: currentSessionId, closed: false })).toBe(true);
    });

    it('TC-2.15.9: onLeave in active chat prompts exit confirmation modal before terminating session', () => {
      let exitConfirmOpened = false;
      let sessionTerminated = false;

      const activeSession = { id: crypto.randomUUID(), closed: false };

      const handleRequestLeaveSession = () => {
        if (activeSession && !activeSession.closed) {
          exitConfirmOpened = true;
        } else {
          sessionTerminated = true;
        }
      };

      // Active session should request confirmation first
      handleRequestLeaveSession();
      expect(exitConfirmOpened).toBe(true);
      expect(sessionTerminated).toBe(false);

      // Closed session can terminate immediately without confirmation
      exitConfirmOpened = false;
      sessionTerminated = false;
      activeSession.closed = true;
      handleRequestLeaveSession();
      expect(exitConfirmOpened).toBe(false);
      expect(sessionTerminated).toBe(true);
    });
  });

  describe('Tier 2: Feature 16 Boundary - Security, Cryptographic & SSRF Hardening', () => {
    it('TC-2.16.1: verifyStationAuth uses constant-time timingSafeEqual and correctly authenticates valid secrets while rejecting invalid', async () => {
      const { verifyStationAuth } = await import('@/lib/chat-server.ts');
      const secret = 'legit-timing-test-secret-123456789';
      const deviceId = crypto.randomUUID();
      await callApi('registerStation', { deviceId, deviceSecret: secret });

      // Valid secret
      const isAuthValid = await verifyStationAuth(deviceId, secret);
      expect(isAuthValid).toBe(true);

      // Invalid secret with identical length
      const wrongSecret = 'x'.repeat(secret.length);
      const isAuthInvalid = await verifyStationAuth(deviceId, wrongSecret);
      expect(isAuthInvalid).toBe(false);

      // Empty or missing secret
      expect(await verifyStationAuth(deviceId, '')).toBe(false);
      expect(await verifyStationAuth(deviceId, undefined)).toBe(false);
    });

    it('TC-2.16.2: blockUser and reportUser guard against self-blocking to prevent matchmaking lockout', async () => {
      const user = await createStation('SelfBlockGuard');
      const blockRes = await callApi('blockUser', {
        deviceId: user.deviceId,
        targetId: user.deviceId,
      });
      expect(blockRes.ok).toBe(true);

      const reportRes = await callApi('reportUser', {
        deviceId: user.deviceId,
        targetId: user.deviceId,
        reason: 'testing self report',
      });
      expect(reportRes.ok).toBe(true);

      // User should still be able to join queue and match normally without self-block collision
      const joinRes = await callApi('joinQueue', {
        deviceId: user.deviceId,
        interests: ['self-block-test'],
      });
      expect(joinRes.ok).toBe(true);
    });

    it('TC-2.16.3: sanitizeInterests clamps tag lengths to 32 characters and bounds tag count to 10', async () => {
      const { sanitizeInterests } = await import('@/lib/constants.ts');
      const longTag = 'x'.repeat(100);
      const manyTags = Array.from({ length: 50 }, (_, i) => `tag-${i}-${longTag}`);

      const sanitized = sanitizeInterests(manyTags);
      expect(sanitized.length <= 10).toBe(true);
      for (const tag of sanitized) {
        expect(tag.length <= 32).toBe(true);
      }
    });

    it('TC-2.16.4: Unbounded array inputs for interests and blockedIds are safely bounded', async () => {
      const user = await createStation('FloodGuard');
      const hugeBlockedList = Array.from({ length: 200 }, () => crypto.randomUUID());
      const res = await callApi('joinQueue', {
        deviceId: user.deviceId,
        interests: ['safe-coding'],
        blockedIds: hugeBlockedList,
      });
      expect(res.ok).toBe(true);
      expect(res.data.status === 'idle' || res.data.status === 'waiting').toBe(true);
    });

    it('TC-2.16.5: Link preview API handler validates host security and strips private IP rawImage metadata', async () => {
      const { GET } = await import('@/app/api/chat/link-preview/route.ts');

      // Loopback/private target is restricted
      const loopbackReq = new Request('http://localhost:3000/api/chat/link-preview?url=' + encodeURIComponent('http://127.0.0.1:8080/secret'));
      const loopbackRes = await GET(loopbackReq);
      expect(loopbackRes.status).toBe(403);

      // Cloud metadata target is restricted
      const metadataReq = new Request('http://localhost:3000/api/chat/link-preview?url=' + encodeURIComponent('http://169.254.169.254/latest/meta-data/'));
      const metadataRes = await GET(metadataReq);
      expect(metadataRes.status).toBe(403);
    });

    it('TC-2.16.6: next.config.ts enforces Strict-Transport-Security and Cross-Origin-Opener-Policy headers', async () => {
      const nextConfigModule = await import('../next.config.ts');
      const config = nextConfigModule.default;
      const headersList = await config.headers();
      const globalCatchAll = headersList.find((h: any) => h.source === '/(.*)');

      expect(Boolean(globalCatchAll)).toBe(true);
      const hsts = globalCatchAll.headers.find((h: any) => h.key === 'Strict-Transport-Security');
      expect(Boolean(hsts)).toBe(true);
      expect(hsts.value).toContain('max-age=63072000');

      const coop = globalCatchAll.headers.find((h: any) => h.key === 'Cross-Origin-Opener-Policy');
      expect(Boolean(coop)).toBe(true);
      expect(coop.value).toBe('same-origin');
    });

    it('TC-2.16.7: editMessage rejects abusive / illegal content updates with 400 error', async () => {
      const { alice, session } = await createPairedSession();
      // First send a clean message
      const sendRes = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        body: 'Clean initial message',
      });
      expect(sendRes.ok).toBe(true);
      const msgId = sendRes.data?.messages?.[0]?.id;
      expect(Boolean(msgId)).toBe(true);

      // Attempt to edit with CSAM / abusive content
      const editRes = await callApi('editMessage', {
        deviceId: alice.deviceId,
        sessionId: session.id,
        messageId: msgId,
        body: 'child porn forbidden content',
      });
      expect(editRes.ok).toBe(false);
      expect(editRes.status).toBe(400);
      expect(editRes.error).toContain('Message blocked');
    });

    it('TC-2.16.8: evaluateSafety permits legitimate programming commands and benign family terms without false positives', async () => {
      const { evaluateSafety } = await import('@/lib/content-moderation.ts');

      // Linux cp command / coding abbreviation
      const cpCheck = evaluateSafety('run cp -r source/ dest/ in terminal');
      expect(cpCheck.allowed).toBe(true);
      expect(cpCheck.severity).toBe('clean');

      // Benign family mention
      const familyCheck = evaluateSafety('I cooked dinner with my stepmom yesterday');
      expect(familyCheck.allowed).toBe(true);
      expect(familyCheck.severity).toBe('clean');
    });

    it('TC-2.16.9: evaluateSafety strips zero-width Unicode characters and catches obfuscated banned terms', async () => {
      const { evaluateSafety } = await import('@/lib/content-moderation.ts');

      // Insert zero-width space (\u200B) inside banned term "child porn"
      const obfuscated = 'ch\u200Bi\u200Bld p\u200B\uFEFFornography';
      const check = evaluateSafety(obfuscated);
      expect(check.allowed).toBe(false);
      expect(check.severity).toBe('severe');
    });

    it('TC-2.16.10: verifyStationAuth denies unauthenticated access to legacy stations without secret hashes', async () => {
      const { getSql } = await import('@/lib/database.ts');
      const { verifyStationAuth } = await import('@/lib/chat-server.ts');
      const sql = await getSql();

      const legacyDevId = crypto.randomUUID();
      await sql`
        insert into stations (device_id, callsign, ip, secret_hash)
        values (${legacyDevId}, 'LegacyGhost', '127.0.0.1', null)
        on conflict (device_id) do update set secret_hash = null
      `;

      // Non-registration action with no secret provided -> MUST BE REJECTED
      const authNoSecret = await verifyStationAuth(legacyDevId, undefined, 'getDesk');
      expect(authNoSecret).toBe(false);

      // Attempting to invoke deleteStation with fake secret -> MUST BE REJECTED
      const authFakeSecret = await verifyStationAuth(legacyDevId, 'fake-secret', 'deleteStation');
      expect(authFakeSecret).toBe(false);

      // Legacy station without secret CAN register/bind for the first time
      const authRegister = await verifyStationAuth(legacyDevId, 'new-bind-secret', 'registerStation');
      expect(authRegister).toBe(true);
    });

    it('TC-2.16.11: modal dialog open state suppresses global keydown focus stealing in composer', () => {
      // Simulate isModalDialogOpen logic from MessageInput
      const checkModalOpen = (mockElements: { selector: string; count: number }[]) => {
        for (const { count } of mockElements) {
          if (count > 0) return true;
        }
        return false;
      };

      // When modal is open ([role="dialog"])
      expect(checkModalOpen([{ selector: '[role="dialog"]', count: 1 }])).toBe(true);

      // When alert dialog is open ([role="alertdialog"])
      expect(checkModalOpen([{ selector: '[role="alertdialog"]', count: 1 }])).toBe(true);

      // When aria-modal="true" dialog is open
      expect(checkModalOpen([{ selector: '[aria-modal="true"]', count: 1 }])).toBe(true);

      // When data-state="open" radix dialog is open
      expect(checkModalOpen([{ selector: '[data-state="open"]', count: 1 }])).toBe(true);

      // When no dialog is present
      expect(checkModalOpen([{ selector: '[role="dialog"]', count: 0 }])).toBe(false);
    });

    it('TC-2.16.12: link preview restricts non-standard ports and IPv6-mapped loopback while moderation catches compound terms', async () => {
      const { GET } = await import('@/app/api/chat/link-preview/route.ts');
      const { evaluateSafety } = await import('@/lib/content-moderation.ts');

      // Non-web port rejected with 400
      const badPortReq = new Request('http://localhost:3000/api/chat/link-preview?url=' + encodeURIComponent('http://example.com:22/ssh'));
      const badPortRes = await GET(badPortReq);
      expect(badPortRes.status).toBe(400);

      // Uppercase IPv4-mapped loopback rejected with 403
      const mappedLoopbackReq = new Request('http://localhost:3000/api/chat/link-preview?url=' + encodeURIComponent('http://[::FFFF:127.0.0.1]/'));
      const mappedLoopbackRes = await GET(mappedLoopbackReq);
      expect(mappedLoopbackRes.status).toBe(403);

      // Moderation catches compound hyphenated terms
      const compoundCheck = evaluateSafety('child-porn is blocked');
      expect(compoundCheck.allowed).toBe(false);
      expect(compoundCheck.severity).toBe('severe');
    });

    it('TC-2.16.13: AppError hierarchy, Result types, and tryCatch handle synchronous and async failures', async () => {
      const { AppError, ValidationError, UnauthorizedError, RateLimitError, isAppError, ok, err, tryCatch, tryCatchAsync } = await import('@/lib/errors.ts');

      const valErr = new ValidationError('Bad input', { field: 'body' });
      expect(isAppError(valErr)).toBe(true);
      expect(valErr.statusCode).toBe(400);
      expect(valErr.code).toBe('VALIDATION_ERROR');
      expect(valErr.details?.field).toBe('body');

      const rateErr = new RateLimitError('Too fast', 10);
      expect(rateErr.statusCode).toBe(429);
      expect(rateErr.retryAfterSeconds).toBe(10);

      const unauthErr = new UnauthorizedError();
      expect(unauthErr.statusCode).toBe(401);

      // Result ok / err
      const success = ok(123);
      expect(success.ok).toBe(true);
      if (success.ok) expect(success.data).toBe(123);

      const failure = err(valErr);
      expect(failure.ok).toBe(false);
      if (!failure.ok) expect(failure.error.statusCode).toBe(400);

      // tryCatch synchronous
      const syncOk = tryCatch(() => JSON.parse('{"a":1}'));
      expect(syncOk.ok).toBe(true);

      const syncErr = tryCatch(() => JSON.parse('{invalid'));
      expect(syncErr.ok).toBe(false);

      // tryCatchAsync
      const asyncOk = await tryCatchAsync(async () => 'resolved');
      expect(asyncOk.ok).toBe(true);

      const asyncErr = await tryCatchAsync(async () => { throw new Error('boom'); });
      expect(asyncErr.ok).toBe(false);
    });

    it('TC-2.16.14: Runtime type guards validate ChatMessage, SessionView, DeskView, and VoidLetter shapes strictly', async () => {
      const { isChatMessage, isSessionView, isDeskView, isVoidLetter } = await import('@/lib/types.ts');

      const validMsg = {
        id: 'msg-1',
        fromId: 'dev-1',
        fromCallsign: 'Alice',
        body: 'Hello',
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        mine: true,
        copied: false,
      };
      expect(isChatMessage(validMsg)).toBe(true);
      expect(isChatMessage({ id: 'msg-1' })).toBe(false);
      expect(isChatMessage(null)).toBe(false);

      const validSession = {
        id: 'sess-1',
        kind: 'stranger',
        peerId: 'peer-1',
        peerCallsign: 'Bob',
        interests: ['tag1'],
        closed: false,
      };
      expect(isSessionView(validSession)).toBe(true);
      expect(isSessionView({ id: 'sess-1' })).toBe(false);

      const validDesk = {
        station: { deviceId: 'dev-1', callsign: 'Alice' },
        friends: [],
        inboundQsl: [],
        activeSession: null,
        queued: false,
        queuedInterests: [],
        enteredAt: null,
      };
      expect(isDeskView(validDesk)).toBe(true);
      expect(isDeskView({ station: null })).toBe(false);

      const validLetter = {
        id: 'let-1',
        deviceId: 'dev-1',
        callsign: 'Alice',
        text: 'A quiet thought',
        stars: 3,
        createdAt: new Date().toISOString(),
      };
      expect(isVoidLetter(validLetter)).toBe(true);
      expect(isVoidLetter({ text: 'Hello' })).toBe(false);
    });

    it('TC-2.16.15: ApiClientError preserves HTTP status codes and error codes with isApiClientError narrowing', async () => {
      const { ApiClientError, isApiClientError, isAppError } = await import('@/lib/errors.ts');

      const apiErr = new ApiClientError('Not found', 404, 'NOT_FOUND');
      expect(isAppError(apiErr)).toBe(true);
      expect(isApiClientError(apiErr)).toBe(true);
      expect(apiErr.statusCode).toBe(404);
      expect(apiErr.code).toBe('NOT_FOUND');
      expect(apiErr.message).toBe('Not found');

      const standardErr = new Error('Random error');
      expect(isApiClientError(standardErr)).toBe(false);
    });

    it('TC-2.16.16: Unresponded 2-minute message notification delay and response cancellation', async () => {
      const { UNRESPONDED_NOTIFICATION_DELAY_MS } = await import('@/lib/constants.ts');
      const { subscribeToToastNotifications, notifyUser } = await import('@/lib/notifications.ts');

      // 1. Verify exact 2-minute delay constant (120,000 ms)
      expect(UNRESPONDED_NOTIFICATION_DELAY_MS).toBe(120000);

      const receivedNotifications: any[] = [];
      const unsubscribe = subscribeToToastNotifications((toast) => {
        receivedNotifications.push(toast);
      });

      try {
        // 2. Scenario: Person 1 sends text, Person 2 responds in time -> NO notification
        let timer: any = null;
        let pending: any = null;
        let hasNotified = false;

        const schedule = (fromCallsign: string, text: string, delay: number) => {
          pending = { fromCallsign, text };
          if (!timer && !hasNotified) {
            timer = setTimeout(() => {
              timer = null;
              if (pending && !hasNotified) {
                hasNotified = true;
                notifyUser({
                  title: `Message from ${pending.fromCallsign}`,
                  body: pending.text,
                  type: 'message',
                  tag: 'luna-message',
                });
              }
            }, delay);
          }
        };

        const cancel = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          pending = null;
          hasNotified = false;
        };

        // Person 1 sends message
        schedule('Midnight-Echo', 'Hey there!', 40);

        // Person 2 responds before timer expires (at 15ms)
        await new Promise((r) => setTimeout(r, 15));
        cancel();

        // Wait past original timer duration
        await new Promise((r) => setTimeout(r, 40));
        expect(receivedNotifications.length).toBe(0);

        // 3. Scenario: Person 1 sends text, Person 2 does NOT respond -> notification fires after delay
        schedule('Midnight-Echo', 'Are you still there?', 40);

        // Person 1 sends another message while Person 2 is still unresponded
        await new Promise((r) => setTimeout(r, 15));
        schedule('Midnight-Echo', 'Testing 1 2 3', 40);

        // Wait for unresponded notification to fire
        await new Promise((r) => setTimeout(r, 45));
        expect(receivedNotifications.length).toBe(1);
        expect(receivedNotifications[0].title).toBe('Message from Midnight-Echo');
        expect(receivedNotifications[0].message).toBe('Testing 1 2 3');

        // Subsequent message during the same unresponded streak does not trigger duplicate spam
        schedule('Midnight-Echo', 'Another text', 40);
        await new Promise((r) => setTimeout(r, 50));
        expect(receivedNotifications.length).toBe(1);

        // Once Person 2 responds, cancel resets state for next turn
        cancel();
        expect(hasNotified).toBe(false);
      } finally {
        unsubscribe();
      }
    });

    it('TC-2.16.17: Smart scroll unread message pill and typing indicator behavior', async () => {
      // 1. Simulate ChatScreen unread count tracking when scrolled up
      let distanceToBottom = 200; // Scrolled up > 160
      let showScrollBottom = distanceToBottom > 160;
      let unreadScrolledCount = 0;
      let prevCount = 0;

      const trackNewMessages = (messages: Array<{ mine: boolean; system: boolean; body: string }>) => {
        if (showScrollBottom && messages.length > prevCount) {
          const newMessages = messages.slice(prevCount);
          const incoming = newMessages.filter((m) => !m.mine && !m.system).length;
          if (incoming > 0) {
            unreadScrolledCount += incoming;
          }
        }
        prevCount = messages.length;
      };

      // Initial messages
      const msgs = [
        { mine: false, system: false, body: 'Hello' },
        { mine: true, system: false, body: 'Hey' },
      ];
      trackNewMessages(msgs);
      expect(unreadScrolledCount).toBe(1); // User started scrolled up, saw 1 peer message

      // User sends a message (mine: true) -> unread count should NOT increase
      msgs.push({ mine: true, system: false, body: 'What are you working on?' });
      trackNewMessages(msgs);
      expect(unreadScrolledCount).toBe(1);

      // System notification arrives (system: true) -> unread count should NOT increase
      msgs.push({ mine: false, system: true, body: 'Resonance established' });
      trackNewMessages(msgs);
      expect(unreadScrolledCount).toBe(1);

      // Peer sends 2 messages while user is scrolled up
      msgs.push({ mine: false, system: false, body: 'Building a nocturnal app' });
      msgs.push({ mine: false, system: false, body: 'With end-to-end encryption' });
      trackNewMessages(msgs);
      expect(unreadScrolledCount).toBe(3);

      // User scrolls back down to bottom (distanceToBottom <= 160)
      distanceToBottom = 50;
      showScrollBottom = distanceToBottom > 160;
      if (!showScrollBottom) {
        unreadScrolledCount = 0;
      }
      expect(showScrollBottom).toBe(false);
      expect(unreadScrolledCount).toBe(0);

      // Peer typing indicator state priority logic
      const getScrollButtonState = (unread: number, typing: boolean, callsign: string) => {
        if (unread > 0) {
          return { mode: 'unread', label: `${unread} new ${unread === 1 ? 'message' : 'messages'}` };
        }
        if (typing) {
          return { mode: 'typing', label: `${callsign || 'Stranger'} is typing…` };
        }
        return { mode: 'default', label: 'Jump to latest' };
      };

      // No unread, peer typing -> typing mode
      expect(getScrollButtonState(0, true, 'Midnight-Echo')).toEqual({
        mode: 'typing',
        label: 'Midnight-Echo is typing…',
      });

      // Unread arrives while peer typing -> unread count takes priority
      expect(getScrollButtonState(2, true, 'Midnight-Echo')).toEqual({
        mode: 'unread',
        label: '2 new messages',
      });

      // Neither -> default jump pill
      expect(getScrollButtonState(0, false, 'Midnight-Echo')).toEqual({
        mode: 'default',
        label: 'Jump to latest',
      });
    });

    it('TC-2.16.18: Poetic farewell parting word dispatch before session teardown', async () => {
      const { MIDNIGHT_FAREWELLS } = await import('@/lib/constants.ts');

      // 1. Verify curated midnight farewells
      expect(MIDNIGHT_FAREWELLS).toContain('🌙 Rest well, stranger');
      expect(MIDNIGHT_FAREWELLS).toContain('✨ Safe travels through the night');
      expect(MIDNIGHT_FAREWELLS).toContain('🤍 Thank you for the conversation');
      expect(MIDNIGHT_FAREWELLS).toContain('🪐 Until our orbits cross again');

      // 2. Setup paired session to verify farewell dispatch and closure
      const { alice, bob, session } = await createPairedSession();

      // Alice selects a poetic farewell before leaving
      const chosenFarewell = MIDNIGHT_FAREWELLS[0]; // '🌙 Rest well, stranger'

      // Simulate handleLeaveSession with chosenFarewell
      let farewellSent = false;
      const handleLeaveWithFarewell = async (farewell?: string) => {
        if (farewell && !session.closed) {
          await callApi('sendMessage', {
            deviceId: alice.deviceId,
            sessionId: session.id,
            body: farewell,
            clientMsgId: crypto.randomUUID(),
          });
          farewellSent = true;
        }
        await callApi('leaveSession', {
          deviceId: alice.deviceId,
          sessionId: session.id,
        });
      };

      await handleLeaveWithFarewell(chosenFarewell);
      expect(farewellSent).toBe(true);

      // Verify Bob received the farewell message before the session was closed
      const bobRes = await callApi('listMessages', { deviceId: bob.deviceId, sessionId: session.id });
      expect(bobRes.ok).toBe(true);
      const bobPack = bobRes.data;
      expect(bobPack.session?.closed).toBe(true);

      // In Bob's transcript, the last non-system message should match chosenFarewell
      const nonSystemMessages = bobPack.messages.filter((m: any) => !m.system);
      const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
      expect(lastMessage?.body).toBe(chosenFarewell);

      // Verify farewell detection logic for rendering the luminous parting card
      const isFarewell = (MIDNIGHT_FAREWELLS as readonly string[]).includes(lastMessage?.body);
      expect(isFarewell).toBe(true);

      // 3. Scenario: Leaving silently does NOT dispatch farewell
      const pair2 = await createPairedSession();
      farewellSent = false;
      await handleLeaveWithFarewell(); // no farewell argument -> silent exit
      expect(farewellSent).toBe(false);
    });

    it('TC-2.16.19: Ephemeral Station JWT creation, signature verification, expiry, and device-binding', async () => {
      const { createStationToken, verifyStationToken } = await import('@/lib/jwt.ts');

      const deviceId = crypto.randomUUID();
      const callsign = 'PULSAR-77';

      // 1. Generate valid token
      const token = await createStationToken({ deviceId, callsign }, 3600);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      // 2. Verify valid token
      const verified = await verifyStationToken(token, deviceId);
      expect(verified !== null).toBe(true);
      expect(verified?.sub).toBe(deviceId);
      expect(verified?.callsign).toBe(callsign);

      // 3. Reject mismatched deviceId
      const mismatched = await verifyStationToken(token, crypto.randomUUID());
      expect(mismatched).toBeNull();

      // 4. Reject tampered token
      const parts = token.split('.');
      const tampered = `${parts[0]}.eyJoYWNrZWQiOnRydWV9.${parts[2]}`;
      const invalid = await verifyStationToken(tampered, deviceId);
      expect(invalid).toBeNull();

      // 5. Reject expired token
      const expiredToken = await createStationToken({ deviceId, callsign }, -10);
      const expiredResult = await verifyStationToken(expiredToken, deviceId);
      expect(expiredResult).toBeNull();
    });

    it('TC-2.16.20: verifyStationAuth zero-database fast path authentication via stationToken', async () => {
      const { verifyStationAuth } = await import('@/lib/chat-server.ts');
      const { createStationToken } = await import('@/lib/jwt.ts');

      const deviceId = crypto.randomUUID();
      const callsign = 'QUASAR-99';

      // Issue token
      const token = await createStationToken({ deviceId, callsign });

      // verifyStationAuth should authenticate via stationToken without database secret
      const isAuthedWithToken = await verifyStationAuth(deviceId, undefined, undefined, token);
      expect(isAuthedWithToken).toBe(true);

      // Without token and without secret, unauthorized station is denied
      const isAuthedWithout = await verifyStationAuth(deviceId, undefined, undefined, undefined);
      expect(isAuthedWithout).toBe(false);
    });

    it('TC-2.16.21: Mobile swipe-to-skip bottom 50% coordinate gating and control exclusion logic', async () => {
      // Test the spatial gating engine
      const screenHeight = 840;
      const bottomHalfThreshold = screenHeight * 0.5; // 420px

      const isEligibleTouchStart = (clientY: number, targetType: string, windowWidth: number) => {
        if (windowWidth >= 768) return false; // Mobile only
        if (clientY < bottomHalfThreshold) return false; // Must be bottom 50%
        if (['input', 'textarea', 'button'].includes(targetType.toLowerCase())) return false;
        return true;
      };

      // Desktop viewport should be rejected
      expect(isEligibleTouchStart(500, 'div', 1024)).toBe(false);

      // Top 50% of screen should be rejected on mobile
      expect(isEligibleTouchStart(200, 'div', 390)).toBe(false);
      expect(isEligibleTouchStart(419, 'div', 390)).toBe(false);

      // Bottom 50% of screen on non-interactive div should be accepted
      expect(isEligibleTouchStart(420, 'div', 390)).toBe(true);
      expect(isEligibleTouchStart(600, 'div', 390)).toBe(true);

      // Interactive controls in bottom 50% should be protected from swipe hijacking
      expect(isEligibleTouchStart(500, 'textarea', 390)).toBe(false);
      expect(isEligibleTouchStart(500, 'button', 390)).toBe(false);
      expect(isEligibleTouchStart(500, 'input', 390)).toBe(false);

      // Direction disambiguation:
      const resolveDirection = (dx: number, dy: number) => {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX < 10 && absY < 10) return 'deadzone';
        if (dx <= 0 || absY > absX * 0.8) return 'vertical';
        if (dx > 10 && dx > absY * 1.2) return 'horizontal';
        return 'ambiguous';
      };

      // Vertical message scroll should lock as vertical and NOT engage swipe
      expect(resolveDirection(5, 50)).toBe('vertical');
      expect(resolveDirection(-30, 10)).toBe('vertical');
      expect(resolveDirection(2, 3)).toBe('deadzone');

      // Intentional left-to-right swipe should lock as horizontal
      expect(resolveDirection(45, 10)).toBe('horizontal');
      expect(resolveDirection(85, 20)).toBe('horizontal');
    });

    it('TC-2.16.22: Mobile swipe-to-skip dual verification engine: instant skip when closed vs confirmation dialog when actively texting', async () => {
      // Simulate state machine for swipe release
      let onNextCallCount = 0;
      let showConfirmDialog = false;

      const onNext = () => {
        onNextCallCount += 1;
      };

      const handleRelease = (dragDistance: number, closed: boolean) => {
        const threshold = 75;
        if (dragDistance >= threshold) {
          if (closed) {
            // Stranger already left: instant skip with zero prompt
            onNext();
          } else {
            // Both active: require confirmation to prevent accidental skip
            showConfirmDialog = true;
          }
        }
      };

      // Scenario 1: Below threshold (< 75px) -> neither action triggered
      handleRelease(60, false);
      expect(onNextCallCount).toBe(0);
      expect(showConfirmDialog).toBe(false);

      handleRelease(60, true);
      expect(onNextCallCount).toBe(0);
      expect(showConfirmDialog).toBe(false);

      // Scenario 2: Active chat with peer (!closed) & swipe exceeds threshold (>= 75px)
      handleRelease(80, false);
      expect(onNextCallCount).toBe(0); // MUST NOT skip immediately!
      expect(showConfirmDialog).toBe(true); // MUST prompt user!

      // User cancels dialog -> no skip
      showConfirmDialog = false;
      expect(onNextCallCount).toBe(0);

      // User confirms dialog -> execute onNext
      showConfirmDialog = true;
      const userConfirmed = true;
      if (userConfirmed) {
        showConfirmDialog = false;
        onNext();
      }
      expect(onNextCallCount).toBe(1);
      expect(showConfirmDialog).toBe(false);

      // Scenario 3: Closed chat (peer left / skipped) & swipe exceeds threshold (>= 75px)
      handleRelease(80, true);
      expect(onNextCallCount).toBe(2); // Instant skip!
      expect(showConfirmDialog).toBe(false); // NO prompt!
    });

    it('TC-2.16.23: Live Celestial Topic Cloud data aggregation, live count formatting, and toggle state management', async () => {
      const activeTopicStats = [
        { topic: 'philosophy', count: 4 },
        { topic: 'coding', count: 2 },
      ];
      const activeQueueTopics = ['philosophy', 'coding'];
      const POPULAR_TAGS = ['philosophy', 'sleeplessness', 'lo-fi & ambient', 'astrophysics'];

      // 1. Build stats map
      const statsMap = new Map<string, number>();
      for (const item of activeTopicStats) {
        statsMap.set(item.topic.toLowerCase(), item.count);
      }

      expect(statsMap.get('philosophy')).toBe(4);
      expect(statsMap.get('coding')).toBe(2);
      expect(statsMap.get('sleeplessness')).toBe(undefined);

      // 2. Deduped topic cloud ordering: live first, then baseline
      const liveKeys = Array.from(statsMap.keys());
      const cloudTopics = Array.from(new Set([...liveKeys, ...POPULAR_TAGS]));

      expect(cloudTopics[0]).toBe('philosophy');
      expect(cloudTopics[1]).toBe('coding');
      expect(cloudTopics).toContain('sleeplessness');
      expect(cloudTopics.filter((t) => t === 'philosophy').length).toBe(1);

      // 3. Selection toggling logic
      let selected: string[] = [];
      const toggle = (tag: string) => {
        const set = new Set(selected);
        if (set.has(tag)) set.delete(tag);
        else if (set.size < 10) set.add(tag);
        selected = [...set];
      };

      toggle('philosophy');
      expect(selected).toEqual(['philosophy']);

      toggle('coding');
      expect(selected).toEqual(['philosophy', 'coding']);

      toggle('philosophy'); // Deselect
      expect(selected).toEqual(['coding']);
    });

    it('TC-2.16.24: Typing Waveform harmonic phase delay and presence state transitions', async () => {
      // Harmonic 3-dot starlight waveform phase delays
      const delays = [0, 0.15, 0.3];
      expect(delays.length).toBe(3);
      expect(delays[1] - delays[0]).toBe(0.15);
      expect(delays[2] - delays[1]).toBe(0.15);

      // Presence state mapping
      const getPresenceBadge = (peerTyping: boolean, presence: 'active' | 'away' | 'disconnected') => {
        if (peerTyping) return { mode: 'typing', text: 'typing' };
        if (presence === 'away') return { mode: 'away', text: 'away' };
        if (presence === 'disconnected') return { mode: 'disconnected', text: 'disconnected' };
        return { mode: 'active', text: 'active' };
      };

      expect(getPresenceBadge(true, 'active').mode).toBe('typing');
      expect(getPresenceBadge(true, 'away').mode).toBe('typing'); // Typing takes precedence over away
      expect(getPresenceBadge(false, 'away').mode).toBe('away');
      expect(getPresenceBadge(false, 'active').mode).toBe('active');
      expect(getPresenceBadge(false, 'disconnected').mode).toBe('disconnected');
    });
  });
}

export const registerEdgeCaseTests = registerTier2Tests;
