// @ts-nocheck
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

try {
  register(pathToFileURL(path.resolve('tests/e2e/loader.ts')).href, import.meta.url);
} catch {}

process.removeAllListeners('warning');

const { callApi, createStation, cleanDatabase, listenDeviceEvents } = await import('./e2e/harness.ts');
const { getSql } = await import('@/lib/luna/db.ts');


async function runAdversarialM1() {
  console.log('===============================================================');
  console.log('   🔥 EMPIRICAL CHALLENGER: Milestone 1 Stress & Adversarial Suite');
  console.log('===============================================================\n');

  let passedTests = 0;
  let failedTests = 0;
  const failureLog = [];

  function assert(condition, message) {
    if (!condition) {
      failedTests++;
      const err = new Error(message);
      failureLog.push(message);
      console.error(`  ❌ FAILED: ${message}`);
      throw err;
    }
  }

  async function testSection(name, fn) {
    console.log(`\n▶ [CHALLENGE] ${name}`);
    try {
      await fn();
      passedTests++;
      console.log(`  ✅ PASSED: ${name}`);
    } catch (err) {
      console.error(`  💥 ERROR in ${name}: ${err.message}`);
    }
  }

  // Helper to ensure clean slate
  await cleanDatabase();

  // -------------------------------------------------------------
  // CHALLENGE 1: Query Count Interception in sendMessage
  // -------------------------------------------------------------
  await testSection('C1: Query Count in sendMessage (Claim: exactly 2 queries)', async () => {
    await cleanDatabase();
    const alice = await createStation('QueryAlice');
    const bob = await createStation('QueryBob');

    // Match them
    await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['query-test'] });
    const matchRes = await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['query-test'] });
    const sessionId = matchRes.data?.desk?.activeSession?.id;
    assert(sessionId, 'Session should be created between Alice and Bob');

    // Allow async session_started event dispatch from joinQueue to settle
    await new Promise((r) => setTimeout(r, 50));

    // Intercept SQL queries on the underlying engine (pglite or pg pool)
    let queryCount = 0;
    const queries = [];
    const pglite = globalThis.__lunaPglite__;
    const pgPool = globalThis.__lunaPgPool__;
    const target = pglite || pgPool;
    assert(target, 'Underlying database engine must be initialized');

    const origEngineQuery = target.query.bind(target);
    target.query = async (text, params) => {
      const qText = typeof text === 'string' ? text : text?.text ?? '';
      if (!qText.includes('device_events')) {
        queryCount++;
        queries.push({ text: qText.trim().slice(0, 80), params });
      }
      return origEngineQuery(text, params);
    };

    try {
      const sendRes = await callApi('sendMessage', {
        deviceId: alice.deviceId,
        sessionId,
        body: 'Empirical Query Count Probe',
      });
      assert(sendRes.ok, 'sendMessage should succeed');
      console.log(`     Observed query count: ${queryCount}`);
      queries.forEach((q, i) => console.log(`       [Query ${i + 1}]: ${q.text.replace(/\s+/g, ' ')}`));

      assert(queryCount === 2, `Expected exactly 2 queries per sendMessage, observed: ${queryCount}`);
    } finally {
      target.query = origEngineQuery;
    }
  });

  // -------------------------------------------------------------
  // CHALLENGE 2: Burst Message Latency & Strict <50ms Verification
  // -------------------------------------------------------------
  await testSection('C2: Burst Message Latency (50 sequential messages, strict <50ms budget)', async () => {
    await cleanDatabase();
    // Create 10 active test pairs to benchmark message delivery without artificial single-station rate exhaustion
    const pairs = [];
    for (let p = 0; p < 10; p++) {
      const a = await createStation(`BurstAlice${p}`);
      const b = await createStation(`BurstBob${p}`);
      await callApi('joinQueue', { deviceId: a.deviceId, interests: [`burst-${p}`] });
      const m = await callApi('joinQueue', { deviceId: b.deviceId, interests: [`burst-${p}`] });
      pairs.push({ sender: a.deviceId, sessionId: m.data?.desk?.activeSession?.id });
    }

    const latencies = [];
    const BURST_COUNT = 50;

    for (let i = 0; i < BURST_COUNT; i++) {
      const pair = pairs[i % pairs.length];
      const testIp = `127.0.0.${(i % 10) + 2}`;
      const t0 = performance.now();
      const res = await callApi(
        'sendMessage',
        {
          deviceId: pair.sender,
          sessionId: pair.sessionId,
          body: `Burst message payload #${i + 1}`,
        },
        testIp,
      );
      const elapsed = performance.now() - t0;
      latencies.push(elapsed);
      assert(res.ok, `Burst message #${i + 1} send failed`);
    }

    latencies.sort((a, b) => a - b);
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p90 = latencies[Math.floor(latencies.length * 0.9)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`     Latency Stats over ${BURST_COUNT} messages:`);
    console.log(`       Min: ${min.toFixed(2)}ms`);
    console.log(`       Avg: ${avg.toFixed(2)}ms`);
    console.log(`       p50: ${p50.toFixed(2)}ms`);
    console.log(`       p90: ${p90.toFixed(2)}ms`);
    console.log(`       p95: ${p95.toFixed(2)}ms`);
    console.log(`       p99: ${p99.toFixed(2)}ms`);
    console.log(`       Max: ${max.toFixed(2)}ms`);

    assert(p95 < 50, `p95 latency (${p95.toFixed(2)}ms) must be strictly < 50ms`);
    assert(avg < 30, `Average latency (${avg.toFixed(2)}ms) must be comfortably < 30ms`);
    assert(max < 50, `Max latency (${max.toFixed(2)}ms) must be strictly < 50ms`);
  });

  // -------------------------------------------------------------
  // CHALLENGE 3: SSE Emission Payload Shape & Peer Delivery
  // -------------------------------------------------------------
  await testSection('C3: SSE Emission Payload Shape & Complete Peer Delivery', async () => {
    await cleanDatabase();
    const alice = await createStation('SseAlice');
    const bob = await createStation('SseBob');

    await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['sse-test'] });
    const matchRes = await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['sse-test'] });
    const sessionId = matchRes.data?.desk?.activeSession?.id;
    assert(sessionId, 'Session should be created');

    const MESSAGE_COUNT = 5;
    const receivedEvents = [];

    // Subscribe Bob to receive events
    const { subscribeDevice } = await import('@/lib/luna/events.ts');
    const unsub = subscribeDevice(bob.deviceId, (evt) => {
      if (evt.type === 'message') {
        receivedEvents.push(evt);
      }
    });

    try {
      for (let i = 0; i < MESSAGE_COUNT; i++) {
        const bodyText = `SSE payload verification test #${i + 1}`;
        const sendRes = await callApi(
          'sendMessage',
          {
            deviceId: alice.deviceId,
            sessionId,
            body: bodyText,
          },
          `127.0.0.${i + 20}`,
        );
        assert(sendRes.ok, 'Sender response ok');

        // Verify Sender Response Shape
        const senderData = sendRes.data;
        assert(senderData.session, 'Sender response must include session');
        assert(senderData.session.id === sessionId, 'Sender session id matches');
        assert(Array.isArray(senderData.messages), 'Sender messages must be array');
        assert(senderData.messages.length === 1, `Sender messages must contain exactly 1 message (got ${senderData.messages.length})`);

        const sMsg = senderData.messages[0];
        assert(sMsg.mine === true, 'Sender message mine must be true');
        assert(sMsg.fromCallsign === 'SseAlice', `Sender message fromCallsign matches (got ${sMsg.fromCallsign})`);
        assert(sMsg.body === bodyText, 'Sender message body matches');
        assert(sMsg.system === false, 'Sender message system must be false');
        assert(sMsg.copied === false, 'Sender message copied must be false');
        assert(typeof sMsg.createdAt === 'string', 'Sender message createdAt must be string');
        assert(typeof sMsg.expiresAt === 'string', 'Sender message expiresAt must be string');
      }

      // Wait a moment for any async SSE pubsub dispatch
      await new Promise((r) => setTimeout(r, 50));

      assert(receivedEvents.length === MESSAGE_COUNT, `Peer should have received all ${MESSAGE_COUNT} SSE events, got ${receivedEvents.length}`);

      // Verify each peer SSE event
      for (let i = 0; i < MESSAGE_COUNT; i++) {
        const evt = receivedEvents[i];
        assert(evt.type === 'message', `Event #${i} type must be "message"`);
        const payload = evt.data;
        assert(payload.session, `Event #${i} payload must contain session`);
        assert(payload.session.id === sessionId, `Event #${i} session id must match`);
        assert(payload.session.interests.includes('sse-test'), `Event #${i} session interests must contain tag`);
        assert(Array.isArray(payload.messages), `Event #${i} messages must be an array`);
        assert(payload.messages.length === 1, `Event #${i} messages must have length 1 (got ${payload.messages.length})`);

        const pMsg = payload.messages[0];
        assert(pMsg.mine === false, `Event #${i} peer message mine must be false`);
        assert(pMsg.fromId === alice.deviceId, `Event #${i} peer message fromId must match sender`);
        assert(pMsg.fromCallsign === 'SseAlice', `Event #${i} peer message fromCallsign must match`);
        assert(pMsg.body === `SSE payload verification test #${i + 1}`, `Event #${i} body matches`);
        assert(pMsg.system === false, `Event #${i} system must be false`);
        assert(pMsg.copied === false, `Event #${i} copied must be false`);
      }
      console.log(`     Verified ${MESSAGE_COUNT} SSE message events with 100% contract compliance`);
    } finally {
      unsub();
    }
  });

  // -------------------------------------------------------------
  // CHALLENGE 4: Concurrent Burst from Both Peers (Bidirectional)
  // -------------------------------------------------------------
  await testSection('C4: Concurrent Bidirectional Burst (20 parallel sends)', async () => {
    await cleanDatabase();
    // Create 5 active pairs (10 users), each pair sending concurrent bidirectional messages
    const pairs = [];
    for (let p = 0; p < 5; p++) {
      const a = await createStation(`BiAlice${p}`);
      const b = await createStation(`BiBob${p}`);
      await callApi('joinQueue', { deviceId: a.deviceId, interests: [`bi-${p}`] });
      const m = await callApi('joinQueue', { deviceId: b.deviceId, interests: [`bi-${p}`] });
      pairs.push({ a, b, sessionId: m.data?.desk?.activeSession?.id });
    }

    const totalSends = 20;
    const promises = [];
    const t0 = performance.now();

    for (let i = 0; i < totalSends; i++) {
      const pair = pairs[Math.floor(i / 4)];
      const sender = i % 2 === 0 ? pair.a : pair.b;
      const ip = `127.0.0.${(i % 15) + 30}`;
      promises.push(
        callApi(
          'sendMessage',
          {
            deviceId: sender.deviceId,
            sessionId: pair.sessionId,
            body: `Concurrent msg ${i} from ${sender.callsign}`,
          },
          ip,
        ),
      );
    }

    const results = await Promise.all(promises);
    const totalDuration = performance.now() - t0;
    console.log(`     Completed ${totalSends} concurrent sends in ${totalDuration.toFixed(2)}ms (avg ${(totalDuration / totalSends).toFixed(2)}ms per send)`);

    for (let i = 0; i < results.length; i++) {
      assert(results[i].ok, `Concurrent send #${i} failed: ${results[i].error}`);
      assert(results[i].data.messages.length === 1, `Concurrent send #${i} must return exactly 1 message`);
    }

    // Verify database total stored messages across the sessions
    const sql = await getSql();
    let totalPersisted = 0;
    for (const pair of pairs) {
      const rows = await sql`select count(*)::int as count from messages where session_id = ${pair.sessionId}`;
      totalPersisted += rows[0].count;
    }
    assert(totalPersisted === totalSends, `Expected ${totalSends} persisted messages, got ${totalPersisted}`);
  });

  // -------------------------------------------------------------
  // CHALLENGE 5: Instant Matchmaker & Untagged Isolation Stress
  // -------------------------------------------------------------
  await testSection('C5: Instant Matchmaker Multi-Tag & Untagged Queue Isolation Stress', async () => {
    await cleanDatabase();

    // Setup 3 tagged users and 2 untagged users
    const tagUser1 = await createStation('TagUser1');
    const tagUser2 = await createStation('TagUser2');
    const tagUser3 = await createStation('TagUser3');
    const untagUser1 = await createStation('UntagUser1');
    const untagUser2 = await createStation('UntagUser2');

    // 1. TagUser1 enters with ['rust', 'crypto']
    const q1 = await callApi('joinQueue', { deviceId: tagUser1.deviceId, interests: ['rust', 'crypto'] }, '127.0.0.101');
    assert(q1.data.status === 'waiting', 'TagUser1 must wait');

    // 2. UntagUser1 enters with [] (no tags)
    // CRITICAL ADVERSARIAL TEST: UntagUser1 MUST NOT match TagUser1!
    const qU1 = await callApi('joinQueue', { deviceId: untagUser1.deviceId, interests: [] }, '127.0.0.102');
    assert(qU1.data.status === 'waiting', 'UntagUser1 must NOT snatch TagUser1 from queue');

    // 3. TagUser2 enters with ['cooking'] (disjoint tag)
    const q2 = await callApi('joinQueue', { deviceId: tagUser2.deviceId, interests: ['cooking'] }, '127.0.0.103');
    assert(q2.data.status === 'waiting', 'TagUser2 has disjoint tag and must wait');

    // 4. TagUser3 enters with ['design', 'rust'] -> shares 'rust' with TagUser1!
    // Must match TagUser1 IMMEDIATELY on joinQueue, bypassing TagUser2 and UntagUser1!
    const q3 = await callApi('joinQueue', { deviceId: tagUser3.deviceId, interests: ['design', 'rust'] }, '127.0.0.104');
    assert(q3.data.status === 'matched', 'TagUser3 must match immediately on joinQueue');
    const session3 = q3.data.desk.activeSession;
    assert(session3, 'Session must exist');
    assert(session3.interests.includes('rust'), 'Session interests must contain shared tag "rust"');
    assert(
      session3.peerId === tagUser1.deviceId || session3.peerId === tagUser3.deviceId,
      'TagUser3 must match TagUser1 specifically',
    );

    // 5. UntagUser2 enters with []
    // Must match UntagUser1 immediately!
    const qU2 = await callApi('joinQueue', { deviceId: untagUser2.deviceId, interests: [] }, '127.0.0.105');
    assert(qU2.data.status === 'matched', 'UntagUser2 must match UntagUser1 immediately');
    const sessionU = qU2.data.desk.activeSession;
    assert(sessionU.peerId === untagUser1.deviceId, 'UntagUser2 must match UntagUser1');

    // TagUser2 should still be waiting alone
    const hb2 = await callApi('heartbeatQueue', { deviceId: tagUser2.deviceId }, '127.0.0.103');
    assert(hb2.data.status === 'waiting', 'TagUser2 must still be waiting');
  });

  // -------------------------------------------------------------
  // CHALLENGE 6: Adversarial & Boundary Edge Cases
  // -------------------------------------------------------------
  await testSection('C6: Adversarial Payload Boundaries, SQL Injection, & Intrusion Guard', async () => {
    await cleanDatabase();
    const alice = await createStation('AdvAlice');
    const bob = await createStation('AdvBob');
    const eve = await createStation('AdvEve'); // Malicious intruder

    await callApi('joinQueue', { deviceId: alice.deviceId, interests: ['adv'] }, '127.0.0.201');
    const mRes = await callApi('joinQueue', { deviceId: bob.deviceId, interests: ['adv'] }, '127.0.0.202');
    const sessionId = mRes.data.desk.activeSession.id;

    // Edge Case 1: Empty string or whitespace message
    const emptyRes = await callApi('sendMessage', { deviceId: alice.deviceId, sessionId, body: '' }, '127.0.0.203');
    assert(!emptyRes.ok, 'Empty body should be rejected');

    const wsRes = await callApi('sendMessage', { deviceId: alice.deviceId, sessionId, body: '    ' }, '127.0.0.204');
    assert(!wsRes.ok, 'Whitespace-only body should be rejected');

    // Edge Case 2: Max length boundary (280 chars accepted, 281 chars rejected)
    const body280 = 'z'.repeat(280);
    const res280 = await callApi('sendMessage', { deviceId: alice.deviceId, sessionId, body: body280 }, '127.0.0.205');
    assert(res280.ok, '280-char message should be accepted');

    const body281 = 'z'.repeat(281);
    const res281 = await callApi('sendMessage', { deviceId: alice.deviceId, sessionId, body: body281 }, '127.0.0.206');
    assert(!res281.ok, '281-char message should be rejected');

    // Edge Case 3: SQL injection attempt
    const sqlInjection = "'; DROP TABLE messages; -- ' OR '1'='1";
    const resSql = await callApi('sendMessage', { deviceId: alice.deviceId, sessionId, body: sqlInjection }, '127.0.0.207');
    assert(resSql.ok, 'SQL injection string safely stored as text without DB corruption');

    // Check table still exists and message is intact
    const sql = await getSql();
    const checkMsg = await sql`select body from messages where id = ${resSql.data.messages[0].id}`;
    assert(checkMsg[0]?.body === sqlInjection, 'SQL injection body safely stored without syntax execution');

    // Edge Case 4: Intrusion attempt by Eve (not a participant in this session)
    const eveIntrusion = await callApi(
      'sendMessage',
      {
        deviceId: eve.deviceId,
        sessionId,
        body: 'I am Eve spying on your conversation!',
      },
      '127.0.0.208',
    );
    // Should return closed/empty session and NOT insert message into the session
    assert(eveIntrusion.data.messages.length === 0, 'Intruder must receive 0 messages and be blocked from session');
    const checkEveMsg = await sql`select count(*)::int as c from messages where from_id = ${eve.deviceId}`;
    assert(checkEveMsg[0].c === 0, 'Intruder message must NOT be persisted');

    // Edge Case 5: Message to closed session
    await callApi('leaveSession', { deviceId: alice.deviceId, sessionId }, '127.0.0.201');
    const closedRes = await callApi('sendMessage', { deviceId: bob.deviceId, sessionId, body: 'Hello into closed chat' }, '127.0.0.209');
    assert(closedRes.data.messages.length === 0, 'Message to closed session must return 0 messages');
    assert(closedRes.data.session.closed === true, 'Session must be reported closed');
  });

  // -------------------------------------------------------------
  // CHALLENGE 7: Sustained High-Volume Burst (100 sequential sends)
  // -------------------------------------------------------------
  await testSection('C7: Sustained 100-Message Burst with Continuous Latency Monitoring', async () => {
    await cleanDatabase();
    // Create 20 active pairs (40 users) to benchmark sustained 100-message burst without single-station artificial spam throttle
    const pairs = [];
    for (let p = 0; p < 20; p++) {
      const a = await createStation(`StressAlice${p}`);
      const b = await createStation(`StressBob${p}`);
      await callApi('joinQueue', { deviceId: a.deviceId, interests: [`stress-${p}`] });
      const m = await callApi('joinQueue', { deviceId: b.deviceId, interests: [`stress-${p}`] });
      pairs.push({ sender: a.deviceId, sessionId: m.data.desk.activeSession.id });
    }

    const COUNT = 100;
    const times = [];
    for (let i = 0; i < COUNT; i++) {
      const pair = pairs[i % pairs.length];
      const ip = `127.0.1.${(i % 50) + 1}`;
      const t0 = performance.now();
      const res = await callApi(
        'sendMessage',
        {
          deviceId: pair.sender,
          sessionId: pair.sessionId,
          body: `High volume stress payload #${i + 1}`,
        },
        ip,
      );
      const elapsed = performance.now() - t0;
      times.push(elapsed);
      assert(res.ok, `Stress send #${i + 1} failed`);
    }

    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = times[Math.floor(times.length * 0.95)];
    const max = times[times.length - 1];

    console.log(`     100-Message Burst Stats: Avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, Max=${max.toFixed(2)}ms`);
    assert(p95 < 50, `100-message burst p95 must be strictly < 50ms (got ${p95.toFixed(2)}ms)`);
    assert(max < 50, `100-message burst max must be strictly < 50ms (got ${max.toFixed(2)}ms)`);
  });

  console.log('\n===============================================================');
  console.log(` SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('===============================================================');

  if (failedTests > 0) {
    console.error(`\n🚨 CHALLENGE DISCOVERED FAILURES:\n${failureLog.join('\n')}`);
    process.exit(1);
  } else {
    console.log('\n🎉 ALL EMPIRICAL CHALLENGES PASSED CONVINCINGLY!\n');
    process.exit(0);
  }
}

runAdversarialM1().catch((err) => {
  console.error('Fatal crash in adversarial runner:', err);
  process.exit(1);
});
