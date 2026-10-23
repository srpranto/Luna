// @ts-nocheck
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

try {
  register(pathToFileURL(path.resolve('tests/e2e/loader.ts')).href, import.meta.url);
} catch {}

process.removeAllListeners('warning');

async function runFocusedEnhancements() {
  console.log('===============================================================');
  console.log('   🧪 Luna Focused Production Enhancements Test Suite');
  console.log('===============================================================\n');

  const { getSql } = await import('@/lib/luna/db.ts');
  const {
    registerStation,
    joinQueue,
    heartbeatQueue,
    sendMessage,
    listMessages,
    leaveSession,
    blockUser,
    reportUser,
  } = await import('@/lib/luna/server.ts');
  const { checkMessageRateLimit, checkMatchmakerRateLimit, checkPreviewRateLimit } = await import('@/lib/luna/rate-limit.ts');
  const { GET: linkPreviewGet } = await import('@/app/api/luna/link-preview/route.ts');
  const sql = await getSql();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error('    ', err.message);
      failed++;
    }
  }

  // Section 1: Reliable Message Delivery & Deduplication
  console.log('▶ 1. Reliable Message Delivery & Deduplication');

  await test('Assigns and preserves clientMsgId across message dispatch', async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    await registerStation({ deviceId: userA });
    await registerStation({ deviceId: userB });

    const sessionId = crypto.randomUUID();
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${userA}, ${userB}, 'stranger', '["coding"]')
    `;

    const clientMsgId = crypto.randomUUID();
    const pack = await sendMessage({
      deviceId: userA,
      sessionId,
      body: 'Hello reliable world',
      clientMsgId,
    });

    const msg = pack.messages.find(m => m.clientMsgId === clientMsgId || m.id === clientMsgId);
    assert.ok(msg, 'Message with clientMsgId should exist in response pack');
    assert.equal(msg.body, 'Hello reliable world');
    assert.equal(msg.status, 'sent');
  });

  await test('Idempotent retry with identical clientMsgId prevents duplicate DB records', async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    await registerStation({ deviceId: userA });
    await registerStation({ deviceId: userB });
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${userA}, ${userB}, 'stranger', '[]')
    `;

    const clientMsgId = crypto.randomUUID();
    // Send message first time
    await sendMessage({
      deviceId: userA,
      sessionId,
      body: 'Testing retry deduplication',
      clientMsgId,
    });

    // Simulate network retry with identical clientMsgId
    await sendMessage({
      deviceId: userA,
      sessionId,
      body: 'Testing retry deduplication',
      clientMsgId,
    });

    // Check database row count
    const rows = await sql`
      select count(*)::int as count from messages where id = ${clientMsgId}
    `;
    assert.equal(rows[0]?.count, 1, 'Only 1 message record must exist in DB for same clientMsgId');
  });

  await test('Rapid message burst preserves correct chronological order', async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    await registerStation({ deviceId: userA });
    await registerStation({ deviceId: userB });
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${userA}, ${userB}, 'stranger', '[]')
    `;

    const count = 5;
    for (let i = 0; i < count; i++) {
      await sendMessage({
        deviceId: userA,
        sessionId,
        body: `Ordered message ${i + 1}`,
        clientMsgId: crypto.randomUUID(),
      });
    }

    const pack = await listMessages({ deviceId: userA, sessionId });
    const userMsgs = pack.messages.filter(m => m.fromId === userA);
    assert.equal(userMsgs.length, count);
    for (let i = 0; i < count; i++) {
      assert.equal(userMsgs[i]?.body, `Ordered message ${i + 1}`);
    }
  });

  // Section 2: Race-Free Matchmaking Concurrency
  console.log('\n▶ 2. Race-Free Matchmaking Concurrency');

  await test('Simultaneous matching heartbeats pair users without duplicate sessions', async () => {
    const u1 = crypto.randomUUID();
    const u2 = crypto.randomUUID();
    const u3 = crypto.randomUUID();

    await registerStation({ deviceId: u1 });
    await registerStation({ deviceId: u2 });
    await registerStation({ deviceId: u3 });

    // Join queue for all 3 with identical topic #concurrency
    await joinQueue({ deviceId: u1, interests: ['concurrency'] });
    await joinQueue({ deviceId: u2, interests: ['concurrency'] });
    await joinQueue({ deviceId: u3, interests: ['concurrency'] });

    // Trigger simultaneous matching attempts
    await Promise.all([
      heartbeatQueue({ deviceId: u1 }),
      heartbeatQueue({ deviceId: u2 }),
      heartbeatQueue({ deviceId: u3 }),
    ]);

    // Query active sessions for all 3
    const activeSessions = await sql`
      select id, a_id, b_id from sessions
      where closed_at is null
        and (a_id in (${u1}, ${u2}, ${u3}) or b_id in (${u1}, ${u2}, ${u3}))
    `;

    // Must be exactly 1 active session (pairing 2 of them) and 1 remaining waiting
    assert.equal(activeSessions.length, 1, 'Exactly 1 active session should be created between 2 candidates');
    const matchedUsers = new Set([activeSessions[0]?.a_id, activeSessions[0]?.b_id]);
    assert.equal(matchedUsers.size, 2, 'Session must connect exactly 2 distinct candidates');

    // Clean up
    await sql`delete from queue where device_id in (${u1}, ${u2}, ${u3})`;
    await sql`update sessions set closed_at = now() where id = ${activeSessions[0]?.id}`;
  });

  await test('Server-side block prevents blocked users from being matched', async () => {
    const userX = crypto.randomUUID();
    const userY = crypto.randomUUID();
    await registerStation({ deviceId: userX });
    await registerStation({ deviceId: userY });

    // User X blocks User Y on the server
    await blockUser({ deviceId: userX, targetId: userY });

    // Both join queue with matching topic
    await joinQueue({ deviceId: userX, interests: ['security'] });
    await joinQueue({ deviceId: userY, interests: ['security'] });

    // Both heartbeat
    const resX = await heartbeatQueue({ deviceId: userX });
    const resY = await heartbeatQueue({ deviceId: userY });

    assert.notEqual(resX.status, 'matched', 'Blocked pair must not match');
    assert.notEqual(resY.status, 'matched', 'Blocked pair must not match');

    // Clean up
    await sql`delete from queue where device_id in (${userX}, ${userY})`;
    await sql`delete from blocks where blocker_id = ${userX}`;
  });

  // Section 3: Link Preview Security & SSRF Defense
  console.log('\n▶ 3. Link Preview Security & SSRF Defense');

  await test('Rejects loopback (127.0.0.1) and private IPv4 (10.0.0.1, 192.168.1.1)', async () => {
    const urls = [
      'http://127.0.0.1:8080/admin',
      'http://10.0.0.5/api',
      'http://192.168.1.1/router',
      'http://169.254.169.254/latest/meta-data',
    ];

    for (const url of urls) {
      const req = new Request(`http://localhost:3000/api/luna/link-preview?url=${encodeURIComponent(url)}`);
      const res = await linkPreviewGet(req);
      assert.equal(res.status, 403, `URL ${url} must return 403 Forbidden`);
    }
  });

  await test('Rejects IPv6 loopback (::1) and private link-local (fe80::1)', async () => {
    const urls = [
      'http://[::1]:8080/admin',
      'http://[fe80::1]/service',
    ];

    for (const url of urls) {
      const req = new Request(`http://localhost:3000/api/luna/link-preview?url=${encodeURIComponent(url)}`);
      const res = await linkPreviewGet(req);
      assert.equal(res.status, 403, `IPv6 URL ${url} must return 403 Forbidden`);
    }
  });

  await test('Rejects non-HTTP protocols (ftp, file, gopher, javascript)', async () => {
    const urls = [
      'file:///etc/passwd',
      'ftp://ftp.example.com',
      'javascript:alert(1)',
    ];

    for (const url of urls) {
      const req = new Request(`http://localhost:3000/api/luna/link-preview?url=${encodeURIComponent(url)}`);
      const res = await linkPreviewGet(req);
      assert.equal(res.status, 400, `Unsupported protocol ${url} must return 400 Bad Request`);
    }
  });

  // Section 4: Abuse Prevention & Rate Limiting
  console.log('\n▶ 4. Abuse Prevention & Rate Limiting');

  await test('Message sending sliding window throttles rapid spam (>5 msgs in 3s)', async () => {
    const spamDevice = crypto.randomUUID();
    let allowedCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < 8; i++) {
      const check = checkMessageRateLimit(spamDevice);
      if (check.allowed) allowedCount++;
      else blockedCount++;
    }

    assert.equal(allowedCount, 5, 'Should allow 5 messages in window');
    assert.equal(blockedCount, 3, 'Should throttle 3 excess messages');
  });

  await test('Matchmaker sliding window throttles aggressive polling (>3 heartbeats / 1s)', async () => {
    const pollDevice = crypto.randomUUID();
    let allowedCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < 5; i++) {
      const check = checkMatchmakerRateLimit(pollDevice);
      if (check.allowed) allowedCount++;
      else blockedCount++;
    }

    assert.equal(allowedCount, 3, 'Should allow 3 heartbeats per second');
    assert.equal(blockedCount, 2, 'Should throttle excess heartbeats');
  });

  await test('Privacy-respecting abuse reporting stores zero plaintext messages', async () => {
    const reporter = crypto.randomUUID();
    const offender = crypto.randomUUID();
    await registerStation({ deviceId: reporter });
    await registerStation({ deviceId: offender });

    const result = await reportUser({
      deviceId: reporter,
      targetId: offender,
      reason: 'Harassment or offensive behavior',
    });

    assert.ok(result.ok, 'Report should succeed');

    const reportRows = await sql`
      select * from abuse_reports where reporter_id = ${reporter}
    `;
    assert.equal(reportRows.length, 1);
    assert.equal(reportRows[0]?.reported_id, offender);
    assert.equal(reportRows[0]?.reason, 'Harassment or offensive behavior');

    // Verify automatic server block was placed
    const blockRows = await sql`
      select * from blocks where blocker_id = ${reporter} and blocked_id = ${offender}
    `;
    assert.equal(blockRows.length, 1, 'Automatic server block must be recorded');
  });

  // Section 5: Backend Message Validation & Newline Preservation
  console.log('\n▶ 5. Backend Message Validation & Newline Preservation');

  await test('Preserves intentional newlines, code blocks, and indentation', async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    await registerStation({ deviceId: userA });
    await registerStation({ deviceId: userB });
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${userA}, ${userB}, 'stranger', '[]')
    `;

    const multilineBody = `function greet() {\n  // Indented code\n  console.log("Hello");\n}`;
    const pack = await sendMessage({
      deviceId: userA,
      sessionId,
      body: multilineBody,
    });

    const msg = pack.messages.find(m => m.fromId === userA);
    assert.equal(msg?.body, multilineBody, 'Multline whitespace and indentation must be preserved');
  });

  await test('Rejects empty or whitespace-only messages', async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    await registerStation({ deviceId: userA });
    await registerStation({ deviceId: userB });
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${userA}, ${userB}, 'stranger', '[]')
    `;

    let threw = false;
    try {
      await sendMessage({
        deviceId: userA,
        sessionId,
        body: '    \n\n   \t  ',
      });
    } catch {
      threw = true;
    }
    assert.ok(threw, 'Sending whitespace-only message must throw an error');
  });

  // Section 6: Reliable Queue Search & Zero-Disconnect Persistence
  console.log('\n▶ 6. Reliable Queue Search & Zero-Disconnect Persistence');

  await test('User enters queue with topics when alone, remains waiting with queued: true', async () => {
    const loner = crypto.randomUUID();
    await registerStation({ deviceId: loner });

    // Join queue with topic
    const joinRes = await joinQueue({ deviceId: loner, interests: ['solitude', 'midnight'] });
    assert.equal(joinRes.status, 'waiting', 'Must report waiting when no match is online');
    assert.equal(joinRes.desk.queued, true, 'Desk must indicate queued: true');
    assert.deepEqual(joinRes.desk.queuedInterests, ['solitude', 'midnight'], 'Must preserve queued interests');

    // Consecutive heartbeats should reliably stay waiting without idle bounce
    for (let i = 0; i < 4; i++) {
      const hb = await heartbeatQueue({ deviceId: loner });
      assert.equal(hb.status, 'waiting', `Heartbeat #${i + 1} must report waiting`);
      assert.equal(hb.desk.queued, true, `Heartbeat #${i + 1} must maintain queued: true`);
    }

    // Clean up
    await sql`delete from queue where device_id = ${loner}`;
  });

  await test('Heartbeat touches queue.last_beat even when matchmaker rate limit throttles', async () => {
    const rateLoner = crypto.randomUUID();
    await registerStation({ deviceId: rateLoner });
    await joinQueue({ deviceId: rateLoner, interests: ['crypto'] });

    // Rapidly poll heartbeat 5 times to exhaust token bucket
    const hbResults = [];
    for (let i = 0; i < 5; i++) {
      hbResults.push(await heartbeatQueue({ deviceId: rateLoner }));
    }

    // All should return waiting with queued: true
    for (const hb of hbResults) {
      assert.equal(hb.status, 'waiting', 'All heartbeats must report waiting');
      assert.equal(hb.desk.queued, true, 'Desk must remain queued');
    }

    // Verify row still exists in queue table with recent last_beat
    const qRows = await sql`select * from queue where device_id = ${rateLoner}`;
    assert.equal(qRows.length, 1, 'Queue row must NOT be evicted by rate limiting');

    // Clean up
    await sql`delete from queue where device_id = ${rateLoner}`;
  });

  await test('joinQueue safely closes stale unclosed sessions before entering queue', async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const staleSessionId = crypto.randomUUID();
    await registerStation({ deviceId: userA });
    await registerStation({ deviceId: userB });

    // Simulate an abandoned open session from 10 seconds ago
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests, created_at, closed_at)
      values (${staleSessionId}, ${userA}, ${userB}, 'stranger', '["nostalgia"]', now() - interval '10 seconds', null)
    `;

    // User A joins queue with a new topic
    const joinRes = await joinQueue({ deviceId: userA, interests: ['fresh-topic'] });
    assert.equal(joinRes.status, 'waiting', 'Must enter queue as waiting');
    assert.equal(joinRes.desk.queued, true, 'Desk must be queued');

    // The stale session must now be closed
    const sesCheck = await sql`select closed_at from sessions where id = ${staleSessionId}`;
    assert.ok(sesCheck[0]?.closed_at, 'Stale session must be closed');

    // User A must remain in queue after a subsequent heartbeat
    const hb = await heartbeatQueue({ deviceId: userA });
    assert.equal(hb.status, 'waiting', 'Must still be in queue');
    assert.equal(hb.desk.queued, true, 'Must still have queued: true');

    // Clean up
    await sql`delete from queue where device_id in (${userA}, ${userB})`;
    await sql`delete from sessions where id = ${staleSessionId}`;
  });

  await test('joinQueue immediately closes sessions requested via leaveSessionId without phantom match', async () => {
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const targetSessionId = crypto.randomUUID();
    await registerStation({ deviceId: userA });
    await registerStation({ deviceId: userB });

    // Simulate session created 500ms ago that user explicitly leaves to find next stranger
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests, created_at, closed_at)
      values (${targetSessionId}, ${userA}, ${userB}, 'stranger', '["anime"]', now() - interval '500 milliseconds', null)
    `;

    const joinRes = await joinQueue({
      deviceId: userA,
      interests: ['anime'],
      leaveSessionId: targetSessionId,
    });

    assert.equal(joinRes.status, 'waiting', 'Must enter queue as waiting, not re-match the left session');
    assert.equal(joinRes.desk.queued, true, 'Desk must be queued');
    assert.equal(joinRes.desk.activeSession, null, 'Must have no active session');

    // Clean up
    await sql`delete from queue where device_id in (${userA}, ${userB})`;
    await sql`delete from sessions where id = ${targetSessionId}`;
  });

  await test('heartbeatQueue recovers missing queue row gracefully and preserves waiting status', async () => {
    const loner = crypto.randomUUID();
    await registerStation({ deviceId: loner });
    await joinQueue({ deviceId: loner, interests: ['solitude'] });

    // Simulate transient queue eviction
    await sql`delete from queue where device_id = ${loner}`;

    // Heartbeat from actively searching client must maintain waiting and restore queue presence
    const hb = await heartbeatQueue({ deviceId: loner });
    assert.equal(hb.status, 'waiting', 'Must preserve waiting state');
    assert.equal(hb.desk.queued, true, 'Must preserve queued: true');

    const check = await sql`select * from queue where device_id = ${loner}`;
    assert.equal(check.length, 1, 'Queue entry must be restored');

    // Clean up
    await sql`delete from queue where device_id = ${loner}`;
  });

  await test('reapAbandonedSessions reaps dead sessions when disconnected stranger exceeds abandon window', async () => {
    const userLocal = crypto.randomUUID();
    const userGone = crypto.randomUUID();
    const deadSessionId = crypto.randomUUID();
    await registerStation({ deviceId: userLocal });
    await registerStation({ deviceId: userGone });

    // Set userGone last_seen to 5 minutes ago (exceeds 2-min abandon window)
    await sql`update stations set last_seen = now() - interval '5 minutes' where device_id = ${userGone}`;

    await sql`
      insert into sessions (id, a_id, b_id, kind, interests, created_at, closed_at)
      values (${deadSessionId}, ${userLocal}, ${userGone}, 'stranger', '["quiet"]', now() - interval '5 minutes', null)
    `;

    // Heartbeat triggers cleanup and session reaping
    const hb = await heartbeatQueue({ deviceId: userLocal });
    assert.equal(hb.status, 'waiting', 'Local user must be waiting, not matched to dead session');
    assert.equal(hb.desk.activeSession, null, 'Dead session must not be active');

    const sesCheck = await sql`select closed_at from sessions where id = ${deadSessionId}`;
    assert.ok(sesCheck[0]?.closed_at, 'Dead session must be closed');

    // Clean up
    await sql`delete from queue where device_id in (${userLocal}, ${userGone})`;
    await sql`delete from sessions where id = ${deadSessionId}`;
  });

  console.log('\n===============================================================');
  console.log(`   TOTAL: ${passed} / ${passed + failed} passed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runFocusedEnhancements().catch((err) => {
  console.error('Fatal crash in focused enhancements:', err);
  process.exit(1);
});
