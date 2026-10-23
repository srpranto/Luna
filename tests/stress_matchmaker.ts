// @ts-nocheck
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Register loader hook for '@/...' aliases
try {
  register(pathToFileURL(path.resolve('tests/e2e/loader.ts')).href, import.meta.url);
} catch {}

process.removeAllListeners('warning');

const { callApi, createStation, cleanDatabase, listenDeviceEvents } = await import('./e2e/harness.ts');
const { getSql } = await import('@/lib/luna/db.ts');

let ipCounter = 1;
function getUniqueIp() {
  const b3 = Math.floor(ipCounter / 250);
  const b4 = (ipCounter % 250) + 1;
  ipCounter++;
  return `10.99.${b3}.${b4}`;
}

async function api(action, payload) {
  return callApi(action, payload, getUniqueIp());
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runStressTests() {
  console.log('======================================================================');
  console.log('   🔥 Milestone 1 Matchmaker: Empirical Adversarial Stress Harness');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;
  const failures = [];

  async function testCase(name, fn) {
    process.stdout.write(`• ${name}... `);
    const start = performance.now();
    try {
      await fn();
      const dur = Math.round(performance.now() - start);
      console.log(`PASSED (${dur}ms)`);
      passed++;
    } catch (err) {
      const dur = Math.round(performance.now() - start);
      console.log(`FAILED (${dur}ms)`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(`   ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      failed++;
      failures.push({ name, error: err });
    }
  }

  // -------------------------------------------------------------------------
  // SUITE 1: Single-Tag Instant Matching (R2)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 1: Single-Tag Instant Matching (R2) ---');

  await testCase('1.1: Two users with 1 identical tag match immediately on joinQueue', async () => {
    await cleanDatabase();
    const u1 = await createStation('CodeFan1');
    const u2 = await createStation('CodeFan2');

    const q1 = await api('joinQueue', { deviceId: u1.deviceId, interests: ['coding'] });
    assert(q1.ok && q1.data.status === 'waiting', 'u1 should be waiting in queue');

    const q2 = await api('joinQueue', { deviceId: u2.deviceId, interests: ['coding'] });
    assert(q2.ok, 'u2 joinQueue should succeed');
    assert(q2.data.status === 'matched', `u2 should be matched immediately, got ${q2.data.status}`);
    assert(q2.data.desk.activeSession, 'u2 activeSession should exist');
    assert(q2.data.desk.activeSession.peerId === u1.deviceId, 'u2 peer must be u1');
    assert(q2.data.desk.activeSession.interests.includes('coding'), 'matched interests must contain coding');

    // u1 heartbeat should also report matched
    const hb1 = await api('heartbeatQueue', { deviceId: u1.deviceId });
    assert(hb1.ok && hb1.data.status === 'matched', 'u1 heartbeat should report matched');
    assert(hb1.data.desk.activeSession.peerId === u2.deviceId, 'u1 peer must be u2');
  });

  await testCase('1.2: Users with 3 tags sharing exactly 1 tag match immediately without timer', async () => {
    await cleanDatabase();
    const u1 = await createStation('DevRust');
    const u2 = await createStation('DevGo');

    const q1 = await api('joinQueue', { deviceId: u1.deviceId, interests: ['rust', 'systems', 'backend'] });
    assert(q1.data.status === 'waiting', 'u1 should be waiting');

    const q2 = await api('joinQueue', { deviceId: u2.deviceId, interests: ['go', 'backend', 'distributed'] });
    assert(q2.data.status === 'matched', `u2 should match immediately on shared "backend", got ${q2.data.status}`);
    assert(q2.data.desk.activeSession.interests.includes('backend'), 'shared topic must be backend');
    assert(!q2.data.desk.activeSession.interests.includes('rust'), 'unshared tag rust must not be in session interests');
  });

  await testCase('1.3: Tag normalization / case-insensitivity in matching', async () => {
    await cleanDatabase();
    const u1 = await createStation('CaseA');
    const u2 = await createStation('CaseB');

    await api('joinQueue', { deviceId: u1.deviceId, interests: ['TypeScript', ' React '] });
    const q2 = await api('joinQueue', { deviceId: u2.deviceId, interests: ['typescript', 'vue'] });

    assert(q2.data.status === 'matched', 'Normalized tags must match regardless of casing/whitespace');
    assert(q2.data.desk.activeSession.interests.includes('typescript'), 'Interests should contain lowercase typescript');
  });

  // -------------------------------------------------------------------------
  // SUITE 2: Untagged Isolation & Adversarial Tag Hijack Prevention
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Untagged Isolation & Adversarial Tag Hijack Prevention ---');

  await testCase('2.1: Untagged user waiting first CANNOT steal arriving tagged user', async () => {
    await cleanDatabase();
    const untagged = await createStation('UntaggedFirst');
    const tagged = await createStation('TaggedSecond');

    const q1 = await api('joinQueue', { deviceId: untagged.deviceId, interests: [] });
    assert(q1.data.status === 'waiting', 'Untagged user should be waiting');

    const q2 = await api('joinQueue', { deviceId: tagged.deviceId, interests: ['crypto'] });
    assert(q2.data.status === 'waiting', 'Tagged user must NOT match untagged user!');
    assert(!q2.data.desk.activeSession, 'Tagged user must NOT have an active session');

    const hb1 = await api('heartbeatQueue', { deviceId: untagged.deviceId });
    assert(hb1.data.status === 'waiting', 'Untagged user must STILL be waiting');
  });

  await testCase('2.2: Tagged user waiting first CANNOT be matched with arriving untagged user', async () => {
    await cleanDatabase();
    const tagged = await createStation('TaggedFirst');
    const untagged = await createStation('UntaggedSecond');

    await api('joinQueue', { deviceId: tagged.deviceId, interests: ['ai'] });
    const q2 = await api('joinQueue', { deviceId: untagged.deviceId, interests: [] });

    assert(q2.data.status === 'waiting', 'Untagged user arriving second must NOT match tagged user!');
    assert(!q2.data.desk.activeSession, 'Untagged user must NOT have an active session');

    const hbTagged = await api('heartbeatQueue', { deviceId: tagged.deviceId });
    assert(hbTagged.data.status === 'waiting', 'Tagged user must remain waiting in queue');
  });

  await testCase('2.3: Untagged user waiting > 4000ms does NOT broaden to steal tagged user', async () => {
    await cleanDatabase();
    const untagged = await createStation('OldUntagged');
    const tagged = await createStation('NewTagged');

    await api('joinQueue', { deviceId: untagged.deviceId, interests: [] });

    // Manually age the entered_at for the untagged user in database
    const sql = await getSql();
    await sql`update queue set entered_at = now() - interval '10 seconds' where device_id = ${untagged.deviceId}`;

    // Tagged user joins now
    const qTagged = await api('joinQueue', { deviceId: tagged.deviceId, interests: ['music'] });
    assert(qTagged.data.status === 'waiting', 'Aged untagged user must not broaden to steal tagged candidate');

    const hbUntagged = await api('heartbeatQueue', { deviceId: untagged.deviceId });
    assert(hbUntagged.data.status === 'waiting', 'Aged untagged user must remain waiting');
  });

  await testCase('2.4: Two untagged users DO match each other', async () => {
    await cleanDatabase();
    const u1 = await createStation('UntaggedA');
    const u2 = await createStation('UntaggedB');

    await api('joinQueue', { deviceId: u1.deviceId, interests: [] });
    const q2 = await api('joinQueue', { deviceId: u2.deviceId, interests: [] });

    assert(q2.data.status === 'matched', 'Two untagged users must match each other');
    assert(q2.data.desk.activeSession.peerId === u1.deviceId, 'u2 peer should be u1');
    assert(Array.isArray(q2.data.desk.activeSession.interests), 'Interests should be an array');
    assert(q2.data.desk.activeSession.interests.length === 0, 'Untagged session interests must be empty array');
  });

  await testCase('2.5: Tagged users match each other while untagged user is skipped', async () => {
    await cleanDatabase();
    const untagged = await createStation('UntaggedMiddle');
    const t1 = await createStation('T1');
    const t2 = await createStation('T2');

    await api('joinQueue', { deviceId: untagged.deviceId, interests: [] });
    await api('joinQueue', { deviceId: t1.deviceId, interests: ['chess'] });
    const q3 = await api('joinQueue', { deviceId: t2.deviceId, interests: ['chess'] });

    assert(q3.data.status === 'matched', 'T2 should match immediately');
    assert(q3.data.desk.activeSession.peerId === t1.deviceId, 'T2 must match T1, NOT untagged');
    assert(q3.data.desk.activeSession.interests.includes('chess'), 'Session interest must be chess');

    const hbUntagged = await api('heartbeatQueue', { deviceId: untagged.deviceId });
    assert(hbUntagged.data.status === 'waiting', 'Untagged user remains waiting undisturbed');
  });

  // -------------------------------------------------------------------------
  // SUITE 3: Non-Overlapping Tags & Blocklists
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Non-Overlapping Tags & Blocklists ---');

  await testCase('3.1: Disjoint tags never match', async () => {
    await cleanDatabase();
    const u1 = await createStation('Chef');
    const u2 = await createStation('Astronaut');

    await api('joinQueue', { deviceId: u1.deviceId, interests: ['cooking', 'baking'] });
    const q2 = await api('joinQueue', { deviceId: u2.deviceId, interests: ['space', 'physics'] });

    assert(q2.data.status === 'waiting', 'Disjoint tags must not match');
    assert(!q2.data.desk.activeSession, 'No active session should be created');
  });

  await testCase('3.2: Blocked user ID is excluded even if tags match', async () => {
    await cleanDatabase();
    const u1 = await createStation('BlockedUser');
    const u2 = await createStation('NormalUser');

    await api('joinQueue', { deviceId: u1.deviceId, interests: ['anime'] });
    const q2 = await api('joinQueue', {
      deviceId: u2.deviceId,
      interests: ['anime'],
      blockedIds: [u1.deviceId],
    });

    assert(q2.data.status === 'waiting', 'Blocked user must be ignored by matchmaker');
    assert(!q2.data.desk.activeSession, 'No session with blocked user');
  });

  // -------------------------------------------------------------------------
  // SUITE 4: Best-Match and Tie-Breaking Priority
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Best-Match and Tie-Breaking Priority ---');

  await testCase('4.1: Higher shared count prioritized over earlier arrival with fewer shared', async () => {
    await cleanDatabase();
    const uLow = await createStation('LowMatch');
    const uHigh = await createStation('HighMatch');
    const uSearcher = await createStation('Searcher');

    // uLow arrives first with 1 tag that overlaps with searcher
    await api('joinQueue', { deviceId: uLow.deviceId, interests: ['frontend'] });
    // uHigh arrives later with 2 tags that overlap with searcher, but disjoint from uLow
    await api('joinQueue', { deviceId: uHigh.deviceId, interests: ['backend', 'database'] });

    // uSearcher has ['frontend', 'backend', 'database']
    const qSearch = await api('joinQueue', {
      deviceId: uSearcher.deviceId,
      interests: ['frontend', 'backend', 'database'],
    });

    assert(qSearch.data.status === 'matched', 'Searcher should match');
    assert(
      qSearch.data.desk.activeSession.peerId === uHigh.deviceId,
      `Searcher should prefer uHigh (2 shared tags) over uLow (1 shared tag). Matched: ${qSearch.data.desk.activeSession.peerId}`,
    );
  });

  await testCase('4.2: Equal shared count tie-broken by FIFO (earliest entered_at)', async () => {
    await cleanDatabase();
    const uFirst = await createStation('FirstInQueue');
    const uSecond = await createStation('SecondInQueue');
    const uNew = await createStation('NewArrival');

    // uFirst arrives first with ['books']
    await api('joinQueue', { deviceId: uFirst.deviceId, interests: ['books'] });
    // Slight pause to ensure distinct entered_at
    await new Promise((r) => setTimeout(r, 50));
    // uSecond arrives later with ['movies'] (disjoint from uFirst so they don't match each other)
    await api('joinQueue', { deviceId: uSecond.deviceId, interests: ['movies'] });

    // uNew arrives with both ['books', 'movies']
    const qNew = await api('joinQueue', { deviceId: uNew.deviceId, interests: ['books', 'movies'] });
    assert(qNew.data.status === 'matched', `New arrival should match, got ${qNew.data.status}`);
    assert(
      qNew.data.desk.activeSession.peerId === uFirst.deviceId,
      `Should match earliest queued candidate (FIFO). Matched with: ${qNew.data.desk.activeSession.peerId}`,
    );
  });

  // -------------------------------------------------------------------------
  // SUITE 5: Postgres Persistence & Interface Contract Verification
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Postgres Persistence & Interface Contract Verification ---');

  await testCase('5.1: Database sessions.interests contains exact shared tags JSON', async () => {
    await cleanDatabase();
    const u1 = await createStation('Persist1');
    const u2 = await createStation('Persist2');

    await api('joinQueue', { deviceId: u1.deviceId, interests: ['gaming', 'retro', 'rpg'] });
    const q2 = await api('joinQueue', { deviceId: u2.deviceId, interests: ['retro', 'fps', 'gaming'] });

    const sessionId = q2.data.desk.activeSession.id;
    const sql = await getSql();
    const [row] = await sql`select id, kind, interests from sessions where id = ${sessionId}`;
    assert(row, 'Session row must exist in postgres');
    assert(row.kind === 'stranger', `Session kind must be stranger, got ${row.kind}`);

    let parsed = row.interests;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    assert(Array.isArray(parsed), 'sessions.interests must be an array');
    assert(parsed.includes('gaming') && parsed.includes('retro'), 'Must contain both gaming and retro');
    assert(!parsed.includes('rpg') && !parsed.includes('fps'), 'Must not contain non-shared tags');
  });

  // -------------------------------------------------------------------------
  // SUITE 6: High-Concurrency & Stress Scenarios
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 6: High-Concurrency & Stress Scenarios ---');

  await testCase('6.1: Simultaneous joinQueue race between 2 identical-tag candidates', async () => {
    await cleanDatabase();
    const uA = await createStation('RaceA');
    const uB = await createStation('RaceB');

    // Both join at the EXACT same millisecond via Promise.all
    const [rA, rB] = await Promise.all([
      api('joinQueue', { deviceId: uA.deviceId, interests: ['racing'] }),
      api('joinQueue', { deviceId: uB.deviceId, interests: ['racing'] }),
    ]);

    assert(rA.ok && rB.ok, 'Both API calls must succeed');

    // At least one must return 'matched'. What about the other?
    const aMatched = rA.data.status === 'matched' || rA.data.desk.activeSession !== null;
    const bMatched = rB.data.status === 'matched' || rB.data.desk.activeSession !== null;

    const sql = await getSql();
    const queuedImmediately = await sql`select device_id from queue where device_id in (${uA.deviceId}, ${uB.deviceId})`;
    console.log(`\n      [Detail] rA status: "${rA.data.status}" (hasSession: ${Boolean(rA.data.desk.activeSession)}), rB status: "${rB.data.status}" (hasSession: ${Boolean(rB.data.desk.activeSession)})`);
    console.log(`      [Detail] In queue immediately after join: ${queuedImmediately.length} (deviceIds: ${queuedImmediately.map(q => q.device_id).join(', ')})`);

    assert(rA.data.status === 'matched' && rB.data.status === 'matched', `Both candidates should receive status "matched", got rA=${rA.data.status}, rB=${rB.data.status}`);
    assert(aMatched && bMatched, 'Both participants must end up with an active session');
    assert(queuedImmediately.length === 0, `Matched users MUST NOT remain in queue immediately after matching! Found: ${queuedImmediately.length}`);

    // Heartbeat for both must report matched
    const hbA = await api('heartbeatQueue', { deviceId: uA.deviceId });
    const hbB = await api('heartbeatQueue', { deviceId: uB.deviceId });
    assert(hbA.data.status === 'matched', 'uA heartbeat must be matched');
    assert(hbB.data.status === 'matched', 'uB heartbeat must be matched');
    assert(hbA.data.desk.activeSession.id === hbB.data.desk.activeSession.id, 'Session IDs must match');

    // Check queue table: neither should remain in queue!
    const queuedRows = await sql`select device_id from queue where device_id in (${uA.deviceId}, ${uB.deviceId})`;
    assert(queuedRows.length === 0, `Matched users MUST NOT remain in queue! Found: ${queuedRows.length}`);
  });

  await testCase('6.2: Multi-Client Concurrency Burst (16 clients simultaneously entering)', async () => {
    await cleanDatabase();

    // 6 clients on 'cat' -> should form 3 pairs
    // 4 clients on 'dog' -> should form 2 pairs
    // 2 clients with disjoint tags ('bird', 'fish') -> 0 pairs, both waiting
    // 4 untagged clients -> should form 2 pairs
    const cats = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => createStation(`Cat_${i}`)));
    const dogs = await Promise.all([1, 2, 3, 4].map((i) => createStation(`Dog_${i}`)));
    const bird = await createStation('Bird_1');
    const fish = await createStation('Fish_1');
    const untagged = await Promise.all([1, 2, 3, 4].map((i) => createStation(`Untagged_${i}`)));

    // Fire all 16 joinQueue calls concurrently
    const joinPromises = [
      ...cats.map((c) => api('joinQueue', { deviceId: c.deviceId, interests: ['cat'] })),
      ...dogs.map((d) => api('joinQueue', { deviceId: d.deviceId, interests: ['dog'] })),
      api('joinQueue', { deviceId: bird.deviceId, interests: ['bird'] }),
      api('joinQueue', { deviceId: fish.deviceId, interests: ['fish'] }),
      ...untagged.map((u) => api('joinQueue', { deviceId: u.deviceId, interests: [] })),
    ];

    await Promise.all(joinPromises);

    // Heartbeat all 16 to settle any in-flight transitions
    const [catHbs, dogHbs, birdHb, fishHb, untaggedHbs] = await Promise.all([
      Promise.all(cats.map((c) => api('heartbeatQueue', { deviceId: c.deviceId }))),
      Promise.all(dogs.map((d) => api('heartbeatQueue', { deviceId: d.deviceId }))),
      api('heartbeatQueue', { deviceId: bird.deviceId }),
      api('heartbeatQueue', { deviceId: fish.deviceId }),
      Promise.all(untagged.map((u) => api('heartbeatQueue', { deviceId: u.deviceId }))),
    ]);

    // Check cats: all 6 should be matched with other cats
    console.log('\n      [Cat Heartbeat Results]:');
    for (let i = 0; i < 6; i++) {
      const hb = catHbs[i];
      console.log(`        Cat_${i + 1}: status=${hb.data?.status}, ok=${hb.ok}, error=${hb.error}, hasActiveSession=${Boolean(hb.data?.desk?.activeSession)}`);
    }
    const sqlDb = await getSql();
    const currentSessions = await sqlDb`select id, a_id, b_id, interests from sessions where closed_at is null`;
    const currentQueue = await sqlDb`select device_id, interests from queue`;
    console.log(`      [Current DB State] Sessions (${currentSessions.length}):`, currentSessions.map(s => `${s.a_id.slice(0, 6)} <-> ${s.b_id.slice(0, 6)}: ${s.interests}`));
    console.log(`      [Current DB State] Queue (${currentQueue.length}):`, currentQueue.map(q => `${q.device_id.slice(0, 6)}: ${q.interests}`));

    for (let i = 0; i < 6; i++) {
      const hb = catHbs[i];
      assert(hb.data && hb.data.status === 'matched', `Cat_${i + 1} must be matched, got ${hb.data?.status}`);
      assert(hb.data.desk && hb.data.desk.activeSession, `Cat_${i + 1} desk must have activeSession`);
      assert(hb.data.desk.activeSession.interests.includes('cat'), `Cat_${i + 1} session must have "cat" interest`);
      const peerId = hb.data.desk.activeSession.peerId;
      assert(cats.some((c) => c.deviceId === peerId), `Cat_${i + 1} peer must be another cat, got ${peerId}`);
    }

    // Check dogs: all 4 should be matched with other dogs
    for (let i = 0; i < 4; i++) {
      const hb = dogHbs[i];
      assert(hb.data.status === 'matched', `Dog_${i + 1} must be matched, got ${hb.data.status}`);
      assert(hb.data.desk.activeSession.interests.includes('dog'), `Dog_${i + 1} session must have "dog" interest`);
      const peerId = hb.data.desk.activeSession.peerId;
      assert(dogs.some((d) => d.deviceId === peerId), `Dog_${i + 1} peer must be another dog, got ${peerId}`);
    }

    // Check disjoint bird and fish: both must be waiting!
    assert(birdHb.data.status === 'waiting', `Bird must be waiting, got ${birdHb.data.status}`);
    assert(fishHb.data.status === 'waiting', `Fish must be waiting, got ${fishHb.data.status}`);
    assert(!birdHb.data.desk.activeSession, 'Bird must have no active session');
    assert(!fishHb.data.desk.activeSession, 'Fish must have no active session');

    // Check untagged: all 4 must be matched with other untagged users!
    for (let i = 0; i < 4; i++) {
      const hb = untaggedHbs[i];
      assert(hb.data.status === 'matched', `Untagged_${i + 1} must be matched, got ${hb.data.status}`);
      const peerId = hb.data.desk.activeSession.peerId;
      assert(untagged.some((u) => u.deviceId === peerId), `Untagged_${i + 1} peer must be untagged user, got ${peerId}`);
      assert(hb.data.desk.activeSession.interests.length === 0, 'Untagged session must have empty interests');
    }

    // Verify session uniqueness: each matched user belongs to exactly 1 session
    const sql = await getSql();
    const allSessions = await sql`
      select id, a_id, b_id, interests from sessions where closed_at is null
    `;
    console.log(`      [Detail] Total active sessions created: ${allSessions.length}`);
    assert(allSessions.length === 7, `Expected exactly 7 sessions (3 cat + 2 dog + 2 untagged), got ${allSessions.length}`);

    // Verify no user is in more than 1 session
    const seenParticipants = new Set();
    for (const s of allSessions) {
      assert(!seenParticipants.has(s.a_id), `User ${s.a_id} in multiple active sessions!`);
      assert(!seenParticipants.has(s.b_id), `User ${s.b_id} in multiple active sessions!`);
      seenParticipants.add(s.a_id);
      seenParticipants.add(s.b_id);
    }
  });

  await testCase('6.3: Staggered Arrivals & Rapid Leaves (Dynamic queue turnover)', async () => {
    await cleanDatabase();

    const u1 = await createStation('Stagger1');
    const u2 = await createStation('Stagger2');
    const u3 = await createStation('Stagger3');

    // u1 enters
    await api('joinQueue', { deviceId: u1.deviceId, interests: ['sports'] });
    // u1 leaves
    await api('leaveQueue', { deviceId: u1.deviceId });

    // u2 enters with 'sports'
    const q2 = await api('joinQueue', { deviceId: u2.deviceId, interests: ['sports'] });
    assert(q2.data.status === 'waiting', 'u2 should be waiting because u1 left');

    // u3 enters with 'sports'
    const q3 = await api('joinQueue', { deviceId: u3.deviceId, interests: ['sports'] });
    assert(q3.data.status === 'matched', 'u3 should match u2');
    assert(q3.data.desk.activeSession.peerId === u2.deviceId, 'u3 should be matched with u2');
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`   STRESS HARNESS RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    console.error('FAILURES SUMMARY:');
    for (const f of failures) {
      console.error(`- ${f.name}: ${f.error.message}`);
    }
    process.exit(1);
  } else {
    console.log('🎉 ALL ADVERSARIAL STRESS TESTS PASSED EMPIRICALLY!');
    process.exit(0);
  }
}

runStressTests().catch((err) => {
  console.error('Fatal stress harness failure:', err);
  process.exit(1);
});
