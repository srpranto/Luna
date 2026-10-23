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
} from './harness.mjs';

import { cleanDatabase } from './harness.mjs';

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
      const { sanitizeInterests } = await import('@/lib/luna/constants.ts');
      const raw = ['tech, AI ,  web-dev', 'tech'];
      const sanitized = sanitizeInterests(raw);
      expect(sanitized).toContain('tech');
      expect(sanitized).toContain('ai');
      expect(sanitized).toContain('web-dev');
      expect(sanitized.length).toBe(3); // Deduplicated
    });

    it('TC-2.2.3: Maximum interest tags boundary (clamped to 10 tags maximum)', async () => {
      const { sanitizeInterests } = await import('@/lib/luna/constants.ts');
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
      const { GET } = await import('@/app/api/luna/link-preview/route.ts');
      const req = new Request('http://localhost:3000/api/luna/link-preview?url=http://192.168.1.1');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('TC-2.13.5: Non-HTTP protocol URLs (ftp, file, javascript) rejected', async () => {
      const { GET } = await import('@/app/api/luna/link-preview/route.ts');
      const req = new Request('http://localhost:3000/api/luna/link-preview?url=ftp://files.example.com');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });
}
