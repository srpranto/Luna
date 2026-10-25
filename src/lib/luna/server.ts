import { createHash } from "node:crypto";
import { getSql, type Sql } from "./db";
import {
  ABANDON_AFTER_MINUTES,
  FRIEND_TTL_DAYS,
  MAX_LINE_CHARS,
  QUEUE_STALE_SECONDS,
  STRANGER_NAMES,
  type StrangerName,
  STRANGER_TTL_MINUTES,
  friendSessionId,
  hashIp,
  isDeviceId,
  newId,
  pairKey,
  parseInterests,
  sanitizeInterests,
  sharedInterests,
} from "./constants";
import type {
  ChatMessage,
  DeskView,
  FriendRow,
  MessagesPack,
  QslRow,
  QslStatus,
  QueueHeartbeatResult,
  SessionKind,
  SessionView,
  Station,
  VoidLetter,
} from "./types";
import { emitToDevice, isDeviceConnected } from "./events";
import { evaluateSafety } from "./safety";
import { checkMessageRateLimit, checkMatchmakerRateLimit } from "./rate-limit";

interface StationRow {
  device_id: string;
  callsign: string;
  created_at?: Date | string;
  last_seen?: Date | string;
  typing_until?: Date | string | null;
  ip?: string | null;
  is_custom?: boolean | null;
  public_key?: string | null;
  is_away?: boolean | null;
  secret_hash?: string | null;
}

interface QueueRow {
  device_id: string;
  interests: unknown;
  entered_at: Date | string;
  last_beat: Date | string;
}

interface SessionRow {
  id: string;
  a_id: string;
  b_id: string;
  kind: SessionKind;
  interests: unknown;
  created_at: Date | string;
  closed_at: Date | string | null;
  reconnect_a?: boolean | null;
  reconnect_b?: boolean | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  from_id: string;
  body: string;
  created_at: Date | string;
  expires_at: Date | string;
  copied_at: Date | string | null;
  edited_at?: Date | string | null;
  seen_at?: Date | string | null;
}

interface RequestRow {
  id: string;
  from_id: string;
  to_id: string;
  session_id: string | null;
  status: QslStatus;
  created_at?: Date | string;
}

function requireDeviceId(value: unknown): string {
  if (!isDeviceId(value)) {
    throw new Error("Unknown guest.");
  }
  return value;
}

export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function verifyStationAuth(deviceId: string, deviceSecret?: string): Promise<boolean> {
  if (!isDeviceId(deviceId)) return false;
  const sql = await getSql();
  const rows = await sql<{ secret_hash: string | null }>`
    select secret_hash from stations where device_id = ${deviceId}
  `;
  if (rows.length === 0) {
    return true;
  }
  const storedHash = rows[0]?.secret_hash;
  if (!storedHash) {
    if (deviceSecret && typeof deviceSecret === "string" && deviceSecret.length >= 16) {
      const hash = hashDeviceSecret(deviceSecret);
      await sql`update stations set secret_hash = ${hash} where device_id = ${deviceId} and secret_hash is null`;
    }
    return true;
  }
  if (!deviceSecret || typeof deviceSecret !== "string") {
    return false;
  }
  return hashDeviceSecret(deviceSecret) === storedHash;
}

function requireText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    throw new Error("Message cannot be empty.");
  }
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty.");
  }
  if (trimmed.length > max) {
    throw new Error(`Line too long (${max} max).`);
  }
  return trimmed.replace(/\n{4,}/g, "\n\n\n");
}

function asIso(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function peerOf(session: SessionRow, deviceId: string): string {
  return session.a_id === deviceId ? session.b_id : session.a_id;
}

function ttlInterval(kind: SessionKind): string {
  if (kind === "friend") {
    return `${FRIEND_TTL_DAYS} days`;
  }
  return `${STRANGER_TTL_MINUTES} minutes`;
}

async function callsignOf(deviceId: string): Promise<string> {
  const sql = await getSql();
  const rows = await sql<StationRow>`
    select device_id, callsign from stations where device_id = ${deviceId}
  `;
  return rows[0]?.callsign ?? "----";
}

async function callsignsOf(deviceIds: string[]): Promise<Map<string, string>> {
  if (deviceIds.length === 0) return new Map();
  const sql = await getSql();
  const rows = await sql<{ device_id: string; callsign: string }>`
    select device_id, callsign from stations where device_id = any(${deviceIds})
  `;
  return new Map(rows.map((r) => [r.device_id, r.callsign]));
}

async function findAvailableStrangerName(
  sql: Sql,
  clientIp: string,
  excludeDeviceId?: string,
): Promise<string> {
  const activeRows = await sql<{ callsign: string; device_id: string }>`
    select callsign, device_id from stations
    where last_seen > now() - interval '15 minutes'
  `;

  const occupied = new Set(
    activeRows.filter((r) => r.device_id !== excludeDeviceId).map((r) => r.callsign.toLowerCase()),
  );

  const baseIndex = hashIp(clientIp) % STRANGER_NAMES.length;

  for (let offset = 0; offset < STRANGER_NAMES.length; offset += 1) {
    const candidate = STRANGER_NAMES[(baseIndex + offset) % STRANGER_NAMES.length];
    if (candidate && !occupied.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return STRANGER_NAMES[baseIndex] ?? "Rainy-Soul";
}

async function touchStation(
  deviceId: string,
  clientIp?: string,
  publicKey?: string,
  deviceSecret?: string,
): Promise<Station> {
  const ip = clientIp?.trim() || "127.0.0.1";
  const sql = await getSql();
  const secretHash =
    deviceSecret && typeof deviceSecret === "string" && deviceSecret.length >= 16
      ? hashDeviceSecret(deviceSecret)
      : null;

  const existing = await sql<StationRow>`
    select device_id, callsign, ip, is_custom, public_key, is_away, secret_hash from stations where device_id = ${deviceId}
  `;

  if (existing[0]) {
    const row = existing[0];
    const keyToSave = publicKey ?? row.public_key ?? null;
    const hashToSave = row.secret_hash ?? secretHash;
    if (row.is_custom) {
      await sql`update stations set last_seen = now(), ip = ${ip}, public_key = ${keyToSave}, secret_hash = coalesce(stations.secret_hash, ${hashToSave}) where device_id = ${deviceId}`;
      return { deviceId: row.device_id, callsign: row.callsign, publicKey: keyToSave ?? undefined };
    }

    const ipChanged = Boolean(row.ip && row.ip !== ip);
    const isKnownPool = STRANGER_NAMES.includes(row.callsign as StrangerName);

    if (ipChanged || !isKnownPool) {
      const nextCallsign = await findAvailableStrangerName(sql, ip, deviceId);
      await sql`
        update stations
        set callsign = ${nextCallsign}, ip = ${ip}, last_seen = now(), is_custom = false, public_key = ${keyToSave}, secret_hash = coalesce(stations.secret_hash, ${hashToSave})
        where device_id = ${deviceId}
      `;
      return { deviceId: row.device_id, callsign: nextCallsign, publicKey: keyToSave ?? undefined };
    }

    await sql`update stations set last_seen = now(), ip = ${ip}, public_key = ${keyToSave}, secret_hash = coalesce(stations.secret_hash, ${hashToSave}) where device_id = ${deviceId}`;
    return { deviceId: row.device_id, callsign: row.callsign, publicKey: keyToSave ?? undefined };
  }

  const callsign = await findAvailableStrangerName(sql, ip);
  const keyToSave = publicKey ?? null;
  await sql`
    insert into stations (device_id, callsign, ip, is_custom, last_seen, public_key, is_away, secret_hash)
    values (${deviceId}, ${callsign}, ${ip}, false, now(), ${keyToSave}, false, ${secretHash})
    on conflict (device_id) do update set
      last_seen = now(),
      ip = ${ip},
      public_key = coalesce(${keyToSave}, stations.public_key),
      secret_hash = coalesce(stations.secret_hash, ${secretHash})
  `;
  return { deviceId, callsign, publicKey: keyToSave ?? undefined };
}

let lastCleanupAt = 0;

export async function runPeriodicCleanup(sql?: Sql, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCleanupAt < 10_000) {
    return;
  }
  lastCleanupAt = now;

  if (!sql) {
    sql = await getSql();
  }
  const stale = `${QUEUE_STALE_SECONDS} seconds`;
  await sql`delete from queue where last_beat < now() - ${stale}::interval`;
  await sql`
    delete from queue
    where device_id in (
      select a_id from sessions where closed_at is null
      union
      select b_id from sessions where closed_at is null
    )
  `;
  await sql`delete from messages where expires_at < now()`;
  await sql`delete from device_events where created_at < now() - interval '6 hours'`;
  await reapAbandonedSessions(sql);
}

async function cleanup(sql?: Sql): Promise<void> {
  return runPeriodicCleanup(sql, false);
}

export async function touchLastSeen(deviceId: string): Promise<void> {
  if (!isDeviceId(deviceId)) {
    return;
  }
  const sql = await getSql();
  await sql`update stations set last_seen = now() where device_id = ${deviceId}`;
}

async function endSessionOnce(sql: Sql, session: SessionRow): Promise<boolean> {
  const closed = await sql<{ id: string }>`
    update sessions set closed_at = now()
    where id = ${session.id} and closed_at is null
    returning id
  `;
  if (closed.length === 0) {
    return false;
  }
  const ttl = ttlInterval(session.kind);
  await sql`
    insert into messages (id, session_id, from_id, body, expires_at)
    values (${newId()}, ${session.id}, 'system', 'Stranger disconnected. User is no longer available right now.', now() + ${ttl}::interval)
  `;
  return true;
}

async function reapAbandonedSessions(sql: Sql): Promise<void> {
  const abandonWindow = `${ABANDON_AFTER_MINUTES} minutes`;
  const rows = await sql<SessionRow & { a_stale: boolean; b_stale: boolean }>`
    select ses.id, ses.a_id, ses.b_id, ses.kind, ses.interests, ses.created_at, ses.closed_at,
      (sa.last_seen is not null and sa.last_seen < now() - ${abandonWindow}::interval) as a_stale,
      (sb.last_seen is not null and sb.last_seen < now() - ${abandonWindow}::interval) as b_stale
    from sessions ses
    left join stations sa on sa.device_id = ses.a_id
    left join stations sb on sb.device_id = ses.b_id
    where ses.closed_at is null
      and ses.kind = 'stranger'
      and (
        (sa.last_seen is not null and sa.last_seen < now() - ${abandonWindow}::interval)
        or (sb.last_seen is not null and sb.last_seen < now() - ${abandonWindow}::interval)
      )
  `;
  for (const row of rows) {
    if (row.a_stale || row.b_stale) {
      const ended = await endSessionOnce(sql, row);
      if (!ended) {
        continue;
      }
      const payload = {
        sessionId: row.id,
        reason: "Stranger disconnected. User is no longer available right now.",
      };
      emitToDevice(row.a_id, "session_ended", {
        ...payload,
        desk: await loadDesk(row.a_id),
      });
      emitToDevice(row.b_id, "session_ended", {
        ...payload,
        desk: await loadDesk(row.b_id),
      });
    }
  }
}

async function loadSessionView(session: SessionRow, deviceId: string): Promise<SessionView> {
  const peerId = peerOf(session, deviceId);
  const [left, right] = pairKey(deviceId, peerId);
  const sql = await getSql();
  const [friendReqs, friends, peerStationRows] = await Promise.all([
    sql<RequestRow>`
      select id, from_id, to_id, session_id, status
      from friend_requests
      where (from_id = ${deviceId} and to_id = ${peerId})
         or (from_id = ${peerId} and to_id = ${deviceId})
      order by created_at desc
    `,
    sql<{ n: number }>`
      select count(*)::int as n from friendships
      where user_a = ${left} and user_b = ${right}
    `,
    sql<{
      callsign: string;
      last_seen: string | null;
      typing_until: string | null;
      public_key: string | null;
      is_away: boolean | null;
    }>`
      select callsign, last_seen, typing_until, public_key, is_away from stations where device_id = ${peerId}
    `,
  ]);

  const peerStation = peerStationRows[0];
  const peerCallsign = peerStation?.callsign ?? "----";
  const outbound = friendReqs.find((r) => r.from_id === deviceId);
  const inbound = friendReqs.find((r) => r.to_id === deviceId);

  const nowMs = Date.now();
  const sessionAgeMs = nowMs - new Date(session.created_at).getTime();
  const isFreshSession = sessionAgeMs < 20000;
  const peerLastSeenMs = peerStation?.last_seen ? new Date(peerStation.last_seen).getTime() : 0;
  const peerLastSeen = peerStation?.last_seen ? asIso(peerStation.last_seen) : undefined;
  const peerTyping = Boolean(
    peerStation?.typing_until && new Date(peerStation.typing_until).getTime() > nowMs,
  );
  const recentlySeen = peerLastSeenMs > 0 && nowMs - peerLastSeenMs < 60000;
  const peerOnline = isDeviceConnected(peerId) || recentlySeen || isFreshSession;
  const peerIsAway = !session.closed_at && Boolean(peerStation?.is_away);
  const peerPresence: "active" | "away" | "disconnected" = session.closed_at
    ? "disconnected"
    : peerIsAway
      ? "away"
      : peerOnline
        ? "active"
        : "disconnected";

  let reconnectA = session.reconnect_a;
  let reconnectB = session.reconnect_b;
  if (reconnectA === undefined || reconnectB === undefined) {
    const sRows = await sql<{ reconnect_a: boolean | null; reconnect_b: boolean | null }>`
      select reconnect_a, reconnect_b from sessions where id = ${session.id}
    `;
    if (sRows[0]) {
      reconnectA = sRows[0].reconnect_a;
      reconnectB = sRows[0].reconnect_b;
    }
  }

  const outboundReconnect = session.a_id === deviceId ? Boolean(reconnectA) : Boolean(reconnectB);
  const inboundReconnect = session.a_id === deviceId ? Boolean(reconnectB) : Boolean(reconnectA);

  return {
    id: session.id,
    kind: session.kind,
    peerId,
    peerCallsign,
    peerPublicKey: peerStation?.public_key ?? undefined,
    interests: parseInterests(session.interests),
    createdAt: asIso(session.created_at),
    closed: Boolean(session.closed_at),
    outboundQsl: outbound?.status ?? null,
    inboundQsl: inbound ? { id: inbound.id, status: inbound.status } : null,
    alreadyFriends: (friends[0]?.n ?? 0) > 0,
    peerTyping,
    peerLastSeen,
    peerPresence,
    peerIsAway,
    outboundReconnect,
    inboundReconnect,
  };
}

async function openSessionFor(deviceId: string): Promise<SessionRow | undefined> {
  const sql = await getSql();
  const rows = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at, reconnect_a, reconnect_b
    from sessions
    where closed_at is null
      and (a_id = ${deviceId} or b_id = ${deviceId})
    order by created_at desc
    limit 1
  `;
  return rows[0];
}

async function loadMessagesPack(
  deviceId: string,
  sessionId: string,
  skipEmit = false,
  markSeen = true,
): Promise<MessagesPack> {
  const sql = await getSql();
  await sql`update stations set last_seen = now() where device_id = ${deviceId}`;

  const sessions = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at, reconnect_a, reconnect_b
    from sessions
    where id = ${sessionId}
      and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const session = sessions[0];
  if (!session) {
    return {
      session: {
        id: sessionId,
        kind: "stranger",
        peerId: "",
        peerCallsign: "Stranger",
        interests: [],
        createdAt: new Date().toISOString(),
        closed: true,
        outboundQsl: null,
        inboundQsl: null,
        alreadyFriends: false,
        peerTyping: false,
        peerPresence: "disconnected",
      },
      messages: [],
    };
  }

  const stationRows = await sql<{ is_away: boolean | null }>`
    select is_away from stations where device_id = ${deviceId}
  `;
  const isAway = Boolean(stationRows[0]?.is_away);

  await sql`
    update messages
    set copied_at = coalesce(copied_at, now())
    where session_id = ${session.id}
      and from_id <> ${deviceId}
      and copied_at is null
  `;

  let markedSeen = false;
  if (!isAway && markSeen) {
    try {
      const updated = await sql<{ id: string }>`
        update messages
        set seen_at = coalesce(seen_at, now())
        where session_id = ${session.id}
          and from_id <> ${deviceId}
          and seen_at is null
        returning id
      `;
      if (updated.length > 0) {
        markedSeen = true;
      }
    } catch {}
  }

  const rows = await sql<MessageRow>`
    select id, session_id, from_id, body, created_at, expires_at, copied_at, edited_at, seen_at
    from messages
    where session_id = ${session.id}
      and expires_at > now()
    order by created_at asc
    limit 200
  `;

  const peerId = peerOf(session, deviceId);
  const [mine, theirs] = await Promise.all([callsignOf(deviceId), callsignOf(peerId)]);

  const messages: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    fromId: row.from_id,
    fromCallsign:
      row.from_id === "system"
        ? "SYS"
        : row.from_id === deviceId
          ? mine
          : row.from_id === peerId
            ? theirs
            : "----",
    body: row.body,
    createdAt: asIso(row.created_at),
    expiresAt: asIso(row.expires_at),
    mine: row.from_id === deviceId,
    system: row.from_id === "system",
    copied: Boolean(row.copied_at),
    editedAt: row.edited_at ? asIso(row.edited_at) : undefined,
    seenAt: row.seen_at ? asIso(row.seen_at) : undefined,
  }));

  if (markedSeen && !skipEmit) {
    emitToDevice(peerId, "messages_seen", {
      sessionId: session.id,
      seenAt: new Date().toISOString(),
    });
  }

  return {
    session: await loadSessionView(session, deviceId),
    messages,
  };
}

async function loadDesk(
  deviceId: string,
  clientIp?: string,
  publicKey?: string,
  deviceSecret?: string,
): Promise<DeskView> {
  const station = await touchStation(deviceId, clientIp, publicKey, deviceSecret);
  const sql = await getSql();
  const [friendRows, inboundRows, activeSessionRow, queueRows, onlineCountRows, activeQueueRows] = await Promise.all([
    sql<{ user_a: string; user_b: string }>`
        select user_a, user_b from friendships
        where user_a = ${deviceId} or user_b = ${deviceId}
      `,
    sql<RequestRow>`
        select id, from_id, to_id, session_id, status
        from friend_requests
        where to_id = ${deviceId} and status = 'pending'
        order by created_at desc
      `,
    openSessionFor(deviceId),
    sql<QueueRow>`
        select device_id, interests, entered_at, last_beat
        from queue where device_id = ${deviceId}
      `,
    sql<{ n: number }>`
        select count(*)::int as n from stations where last_seen > now() - interval '60 seconds'
      `,
    sql<{ interests: string }>`
        select interests from queue where last_beat > now() - interval '15 seconds' and device_id <> ${deviceId} limit 50
      `,
  ]);

  const onlineCount = onlineCountRows[0]?.n ?? 0;
  const topicCounts = new Map<string, number>();
  for (const r of activeQueueRows) {
    const tags = parseInterests(r.interests);
    for (const tag of tags) {
      topicCounts.set(tag, (topicCounts.get(tag) ?? 0) + 1);
    }
  }
  const activeQueueTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => tag);

  const friendIds = friendRows.map((row) => (row.user_a === deviceId ? row.user_b : row.user_a));
  const neededIds = [...new Set([...friendIds, ...inboundRows.map((r) => r.from_id)])];
  const stationLookup = await callsignsOf(neededIds);

  const friends: FriendRow[] = friendIds.map((fid) => ({
    deviceId: fid,
    callsign: stationLookup.get(fid) ?? "----",
  }));

  const inboundQsl: QslRow[] = inboundRows.map((row) => ({
    id: row.id,
    fromId: row.from_id,
    fromCallsign: stationLookup.get(row.from_id) ?? "----",
    toId: row.to_id,
    toCallsign: station.callsign,
    status: row.status,
  }));

  const activeSession = activeSessionRow ? await loadSessionView(activeSessionRow, deviceId) : null;

  if (activeSession) {
    await sql`delete from queue where device_id = ${deviceId}`;
  }

  const queuedRow = activeSession ? undefined : queueRows[0];

  return {
    station,
    friends,
    inboundQsl,
    activeSession,
    queued: Boolean(queuedRow),
    queuedInterests: parseInterests(queuedRow?.interests),
    enteredAt: queuedRow ? asIso(queuedRow.entered_at) : null,
    onlineCount,
    activeQueueTopics,
  };
}

let matchmakerQueueLock: Promise<void> = Promise.resolve();

async function runWithMatchmakerQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = matchmakerQueueLock;
  matchmakerQueueLock = gate;
  try {
    await prev;
    return await fn();
  } finally {
    release();
  }
}

async function heartbeatQueueHandler(
  deviceId: string,
  blockedIds: string[] = [],
  clientIp?: string,
  recentPeerIds: string[] = [],
): Promise<QueueHeartbeatResult> {
  return runWithMatchmakerQueueLock(async () => {
    const sql = await getSql();

    await sql`update queue set last_beat = now() where device_id = ${deviceId}`;
    await sql`update stations set last_seen = now() where device_id = ${deviceId}`;

    await cleanup(sql);

    const openExisting = await openSessionFor(deviceId);
    if (openExisting) {
      await sql`delete from queue where device_id = ${deviceId}`;
      return { status: "matched", desk: await loadDesk(deviceId, clientIp) };
    }

    const rateCheck = checkMatchmakerRateLimit(deviceId);
    if (!rateCheck.allowed) {
      return {
        status: "waiting",
        desk: await loadDesk(deviceId, clientIp),
      };
    }

    const serverBlocks = await sql<{ peer_id: string }>`
      select blocked_id as peer_id from blocks where blocker_id = ${deviceId}
      union
      select blocker_id as peer_id from blocks where blocked_id = ${deviceId}
    `;
    const blockedSet = new Set([...blockedIds, ...serverBlocks.map((b) => b.peer_id)]);
    const recentSet = new Set(recentPeerIds);

    const meRows = await sql<QueueRow>`
      select device_id, interests, entered_at, last_beat
      from queue where device_id = ${deviceId}
    `;
    const me = meRows[0];
    if (!me) {
      const openAfterMe = await openSessionFor(deviceId);
      if (openAfterMe) {
        await sql`delete from queue where device_id = ${deviceId}`;
        return { status: "matched", desk: await loadDesk(deviceId, clientIp) };
      }
      return { status: "idle", desk: await loadDesk(deviceId, clientIp) };
    }

    const myInterests = parseInterests(me.interests);
    const stale = `${QUEUE_STALE_SECONDS} seconds`;
    const myWaitMs = Date.now() - new Date(me.entered_at).getTime();

    const others = await sql<QueueRow>`
      select q.device_id, q.interests, q.entered_at, q.last_beat
      from queue q
      inner join stations s on s.device_id = q.device_id
      where q.device_id <> ${deviceId}
        and q.last_beat > now() - ${stale}::interval
        and s.last_seen > now() - ${stale}::interval
        and not exists (
          select 1 from sessions ses
          where ses.closed_at is null
            and (ses.a_id = q.device_id or ses.b_id = q.device_id)
        )
      order by q.entered_at asc
    `;

    let best: { row: QueueRow; shared: string[] } | null = null;

    // 1. First pass: look for candidate with highest shared interests.
    // If myInterests.length === 0, match with earliest candidate with theirInterests.length === 0.
    for (const row of others) {
      if (blockedSet.has(row.device_id)) {
        continue;
      }
      if (recentSet.has(row.device_id) && myWaitMs < 15000) {
        continue;
      }
      const theirInterests = parseInterests(row.interests);

      if (myInterests.length === 0) {
        if (theirInterests.length === 0) {
          best = { row, shared: [] };
          break;
        }
      } else {
        const shared = sharedInterests(myInterests, theirInterests);
        if (shared.length > 0) {
          if (!best || shared.length > best.shared.length) {
            best = { row, shared };
          }
        }
      }
    }

    // 2. Fallback pass: if no exact topic match is found and user has waited >= 5000ms
    if (!best && myWaitMs >= 5000) {
      for (const row of others) {
        if (blockedSet.has(row.device_id)) {
          continue;
        }
        if (recentSet.has(row.device_id) && myWaitMs < 15000) {
          continue;
        }
        const theirInterests = parseInterests(row.interests);
        const theirWaitMs = Date.now() - new Date(row.entered_at).getTime();
        if (theirInterests.length === 0 || theirWaitMs >= 5000) {
          best = { row, shared: sharedInterests(myInterests, theirInterests) };
          break;
        }
      }
    }

    if (!best) {
      return {
        status: "waiting",
        desk: await loadDesk(deviceId, clientIp),
      };
    }

    const claimed = await sql<{ device_id: string }>`
      delete from queue
      where device_id = ${best.row.device_id}
        and exists (select 1 from queue where device_id = ${deviceId})
      returning device_id
    `;
    if (claimed.length === 0) {
      const openAfterFailedClaim = await openSessionFor(deviceId);
      if (openAfterFailedClaim) {
        await sql`delete from queue where device_id = ${deviceId}`;
        return { status: "matched", desk: await loadDesk(deviceId, clientIp) };
      }
      return { status: "waiting", desk: await loadDesk(deviceId, clientIp) };
    }

    await sql`delete from queue where device_id = ${deviceId}`;

    const sessionId = newId();
    const shared = JSON.stringify(best.shared);
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${deviceId}, ${best.row.device_id}, 'stranger', ${shared})
    `;

    const deskA = await loadDesk(deviceId, clientIp);
    const deskB = await loadDesk(best.row.device_id);
    emitToDevice(deviceId, "session_started", { sessionId, desk: deskA });
    emitToDevice(best.row.device_id, "session_started", { sessionId, desk: deskB });

    return { status: "matched", desk: deskA };
  });
}

async function acceptQslPair(fromId: string, toId: string, requestId: string): Promise<void> {
  const sql = await getSql();
  const [a, b] = pairKey(fromId, toId);

  await sql`
    insert into friendships (user_a, user_b)
    values (${a}, ${b})
    on conflict (user_a, user_b) do nothing
  `;
  await sql`update friend_requests set status = 'accepted' where id = ${requestId}`;
  await sql`
    update friend_requests
    set status = 'accepted'
    where ((from_id = ${fromId} and to_id = ${toId})
        or (from_id = ${toId} and to_id = ${fromId}))
      and status = 'pending'
  `;
}

export async function registerStation(input: {
  deviceId: string;
  clientIp?: string;
  publicKey?: string;
  deviceSecret?: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  return loadDesk(deviceId, input.clientIp, input.publicKey, input.deviceSecret);
}

export async function getDesk(input: {
  deviceId: string;
  clientIp?: string;
  publicKey?: string;
  deviceSecret?: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  return loadDesk(deviceId, input.clientIp, input.publicKey, input.deviceSecret);
}

export async function joinQueue(input: {
  deviceId: string;
  interests: string[];
  blockedIds?: string[];
  clientIp?: string;
  publicKey?: string;
  leaveSessionId?: string;
  recentPeerIds?: string[];
}): Promise<QueueHeartbeatResult> {
  const deviceId = requireDeviceId(input.deviceId);
  const interests = sanitizeInterests(input.interests);
  const sql = await getSql();

  if (input.leaveSessionId) {
    const targetRows = await sql<SessionRow>`
      select id, a_id, b_id, kind, interests, created_at, closed_at
      from sessions
      where id = ${input.leaveSessionId} and (a_id = ${deviceId} or b_id = ${deviceId})
    `;
    if (targetRows[0] && !targetRows[0].closed_at) {
      const ended = await endSessionOnce(sql, targetRows[0]);
      if (ended) {
        const peerId = peerOf(targetRows[0], deviceId);
        emitToDevice(peerId, "session_ended", {
          sessionId: targetRows[0].id,
          desk: await loadDesk(peerId),
        });
      }
    }
  }

  const existing = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
    from sessions
    where closed_at is null
      and (a_id = ${deviceId} or b_id = ${deviceId})
    order by created_at desc
  `;

  if (existing.length > 0) {
    const active = existing[0]!;
    const ageMs = Date.now() - new Date(active.created_at).getTime();
    if (active.id !== input.leaveSessionId && ageMs < 3000) {
      await sql`delete from queue where device_id = ${deviceId}`;
      return { status: "matched", desk: await loadDesk(deviceId, input.clientIp) };
    }

    for (const session of existing) {
      const ended = await endSessionOnce(sql, session);
      if (ended) {
        const pId = peerOf(session, deviceId);
        emitToDevice(pId, "session_ended", {
          sessionId: session.id,
          desk: await loadDesk(pId),
        });
      }
    }
  }

  await cleanup(sql);
  await touchStation(deviceId, input.clientIp, input.publicKey);

  const payload = JSON.stringify(interests);
  await sql`
    insert into queue (device_id, interests, entered_at, last_beat)
    values (${deviceId}, ${payload}, now(), now())
    on conflict (device_id) do update
    set interests = ${payload}, entered_at = now(), last_beat = now()
  `;

  return heartbeatQueueHandler(deviceId, input.blockedIds ?? [], input.clientIp, input.recentPeerIds ?? []);
}

export async function leaveQueue(input: { deviceId: string }): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();
  await sql`delete from queue where device_id = ${deviceId}`;
  return loadDesk(deviceId);
}

export async function heartbeatQueue(input: {
  deviceId: string;
  blockedIds?: string[];
  clientIp?: string;
  recentPeerIds?: string[];
}): Promise<QueueHeartbeatResult> {
  const deviceId = requireDeviceId(input.deviceId);
  return heartbeatQueueHandler(deviceId, input.blockedIds ?? [], input.clientIp, input.recentPeerIds ?? []);
}

export async function reportTyping(input: {
  deviceId: string;
  sessionId: string;
  isTyping: boolean;
}): Promise<{ ok: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();
  await sql`update stations set last_seen = now() where device_id = ${deviceId}`;
  if (input.isTyping) {
    await sql`update stations set typing_until = now() + interval '3 seconds' where device_id = ${deviceId}`;
  } else {
    await sql`update stations set typing_until = null where device_id = ${deviceId}`;
  }
  const sessions = await sql<SessionRow>`
    select a_id, b_id from sessions where id = ${input.sessionId} and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  if (sessions[0]) {
    const peerId = peerOf(sessions[0], deviceId);
    emitToDevice(peerId, "typing", { sessionId: input.sessionId, isTyping: input.isTyping });
  }
  return { ok: true };
}

export async function openFriendLine(input: {
  deviceId: string;
  friendId: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const friendId = requireDeviceId(input.friendId);
  const sql = await getSql();

  const [a, b] = pairKey(deviceId, friendId);
  const check = await sql<{ n: number }>`
    select count(*)::int as n from friendships where user_a = ${a} and user_b = ${b}
  `;
  if (!check[0] || check[0].n === 0) {
    throw new Error("You are not connected with this stranger yet.");
  }

  const sessionId = friendSessionId(deviceId, friendId);
  const existing = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
    from sessions where id = ${sessionId}
  `;

  if (existing.length === 0) {
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${a}, ${b}, 'friend', '[]')
    `;
  } else if (existing[0]?.closed_at) {
    await sql`
      update sessions set closed_at = null, created_at = now() where id = ${sessionId}
    `;
  }

  emitToDevice(friendId, "desk_update", await loadDesk(friendId));
  return loadDesk(deviceId);
}

export async function leaveSession(input: {
  deviceId: string;
  sessionId: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();

  const sessions = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
    from sessions
    where id = ${input.sessionId}
      and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const session = sessions[0];
  if (!session) {
    return loadDesk(deviceId);
  }

  const ended = await endSessionOnce(sql, session);
  if (ended) {
    const peerId = peerOf(session, deviceId);
    const peerDesk = await loadDesk(peerId);
    emitToDevice(peerId, "session_ended", { sessionId: session.id, desk: peerDesk });
  }

  return loadDesk(deviceId);
}

export async function requestReconnect(input: {
  deviceId: string;
  sessionId: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();
  const rows = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at, reconnect_a, reconnect_b
    from sessions where id = ${input.sessionId} and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const session = rows[0];
  if (!session || session.kind !== "stranger") {
    throw new Error("Chat session not found or ineligible for reconnect.");
  }
  const peerId = peerOf(session, deviceId);
  const blocks = await sql<{ n: number }>`
    select count(*)::int as n from blocks
    where (blocker_id = ${deviceId} and blocked_id = ${peerId})
       or (blocker_id = ${peerId} and blocked_id = ${deviceId})
  `;
  if (blocks[0] && blocks[0].n > 0) {
    throw new Error("Cannot reconnect with this stranger.");
  }
  const peerOpen = await openSessionFor(peerId);
  if (peerOpen && peerOpen.id !== session.id) {
    throw new Error("Stranger is already in another conversation.");
  }
  const isA = session.a_id === deviceId;
  const updated = await sql<SessionRow>`
    update sessions
    set ${isA ? sql`reconnect_a = true` : sql`reconnect_b = true`}
    where id = ${session.id}
    returning id, a_id, b_id, kind, interests, created_at, closed_at, reconnect_a, reconnect_b
  `;
  const current = updated[0] ?? session;
  if (current.reconnect_a && current.reconnect_b) {
    await sql`
      update sessions
      set closed_at = null, reconnect_a = false, reconnect_b = false
      where id = ${session.id}
    `;
    await sql`delete from queue where device_id in (${session.a_id}, ${session.b_id})`;
    const ttl = ttlInterval(session.kind);
    await sql`
      insert into messages (id, session_id, from_id, body, expires_at)
      values (${newId()}, ${session.id}, 'system', 'Reconnected! Conversation resumed.', now() + ${ttl}::interval)
    `;
    const deskA = await loadDesk(session.a_id);
    const deskB = await loadDesk(session.b_id);
    emitToDevice(session.a_id, "session_started", { sessionId: session.id, desk: deskA });
    emitToDevice(session.b_id, "session_started", { sessionId: session.id, desk: deskB });
    return isA ? deskA : deskB;
  } else {
    const senderCallsign = await callsignOf(deviceId);
    emitToDevice(peerId, "reconnect_requested", {
      sessionId: session.id,
      fromCallsign: senderCallsign,
      session: await loadSessionView(current, peerId),
    });
    return loadDesk(deviceId);
  }
}

export async function listMessages(input: {
  deviceId: string;
  sessionId: string;
  markSeen?: boolean;
}): Promise<MessagesPack> {
  const deviceId = requireDeviceId(input.deviceId);
  return loadMessagesPack(deviceId, input.sessionId, false, input.markSeen !== false);
}

export async function sendMessage(input: {
  deviceId: string;
  sessionId: string;
  body: string;
  clientMsgId?: string;
  isReaction?: boolean;
}): Promise<MessagesPack> {
  const deviceId = requireDeviceId(input.deviceId);
  if (!input.isReaction && !input.body.startsWith("[reaction:")) {
    const rateCheck = checkMessageRateLimit(deviceId);
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.`);
    }
  }

  const body = requireText(input.body, MAX_LINE_CHARS);
  const sql = await getSql();
  await sql`update stations set last_seen = now() where device_id = ${deviceId}`;

  if (!body.startsWith("e2e:")) {
    const safety = evaluateSafety(body);
    if (!safety.allowed) {
      throw new Error(`Message blocked: ${safety.reason}`);
    }
  }

  const rows = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at, reconnect_a, reconnect_b
    from sessions
    where id = ${input.sessionId}
      and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const row = rows[0];
  if (!row || row.closed_at) {
    return {
      session: {
        id: input.sessionId,
        kind: row?.kind ?? "stranger",
        peerId: "",
        peerCallsign: "Stranger",
        interests: row ? parseInterests(row.interests) : [],
        createdAt: row ? asIso(row.created_at) : new Date().toISOString(),
        closed: true,
        outboundQsl: null,
        inboundQsl: null,
        alreadyFriends: row?.kind === "friend",
        peerTyping: false,
        peerPresence: "disconnected",
        peerIsAway: true,
      },
      messages: [],
    };
  }

  const peerId = peerOf(row, deviceId);
  const ttl = ttlInterval(row.kind);
  const messageId = input.clientMsgId || newId();
  const insertedRows = await sql<{
    id: string;
    created_at: Date | string;
    expires_at: Date | string;
  }>`
    insert into messages (id, session_id, from_id, body, expires_at)
    values (${messageId}, ${row.id}, ${deviceId}, ${body}, now() + ${ttl}::interval)
    on conflict (id) do update set id = messages.id
    returning id, created_at, expires_at
  `;
  const inserted = insertedRows[0] ?? {
    id: messageId,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 86400000),
  };

  const [mySessionView, peerSessionView, senderCallsign] = await Promise.all([
    loadSessionView(row, deviceId),
    loadSessionView(row, peerId),
    callsignOf(deviceId),
  ]);

  const messageCreatedAt = asIso(inserted.created_at);
  const messageExpiresAt = asIso(inserted.expires_at);

  const peerMessage: ChatMessage = {
    id: inserted.id,
    clientMsgId: input.clientMsgId,
    fromId: deviceId,
    fromCallsign: senderCallsign,
    body,
    createdAt: messageCreatedAt,
    expiresAt: messageExpiresAt,
    mine: false,
    system: false,
    copied: false,
    status: "delivered",
  };

  const myMessage: ChatMessage = {
    id: inserted.id,
    clientMsgId: input.clientMsgId,
    fromId: deviceId,
    fromCallsign: senderCallsign,
    body,
    createdAt: messageCreatedAt,
    expiresAt: messageExpiresAt,
    mine: true,
    system: false,
    copied: false,
    status: "sent",
  };

  emitToDevice(peerId, "message", {
    session: peerSessionView,
    messages: [peerMessage],
  });

  return {
    session: mySessionView,
    messages: [myMessage],
  };
}

export async function editMessage(input: {
  deviceId: string;
  sessionId: string;
  messageId: string;
  body: string;
}): Promise<MessagesPack> {
  const deviceId = requireDeviceId(input.deviceId);
  const body = requireText(input.body, MAX_LINE_CHARS);
  const sql = await getSql();

  const sessions = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
    from sessions
    where id = ${input.sessionId}
      and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const session = sessions[0];
  if (!session || session.closed_at) {
    throw new Error("Chat session not found or conversation has ended.");
  }

  const updated = await sql<MessageRow>`
    update messages
    set body = ${body}, edited_at = now()
    where id = ${input.messageId}
      and session_id = ${session.id}
      and from_id = ${deviceId}
    returning id, session_id, from_id, body, created_at, expires_at, copied_at, edited_at, seen_at
  `;

  if (updated.length === 0) {
    throw new Error("Message not found or unauthorized to edit.");
  }

  const peerId = peerOf(session, deviceId);
  const pack = await loadMessagesPack(deviceId, session.id, true);

  emitToDevice(peerId, "message_edited", {
    sessionId: session.id,
    messageId: input.messageId,
    body,
    editedAt: asIso(updated[0]?.edited_at ?? new Date()),
  });

  return pack;
}

export async function deleteMessage(input: {
  deviceId: string;
  sessionId: string;
  messageId: string;
}): Promise<{ ok: boolean; messageId: string }> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();

  const sessions = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
    from sessions
    where id = ${input.sessionId}
      and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const session = sessions[0];
  if (!session) {
    throw new Error("Chat session not found.");
  }

  const deleted = await sql<{ id: string }>`
    delete from messages
    where id = ${input.messageId}
      and session_id = ${session.id}
      and from_id = ${deviceId}
    returning id
  `;

  if (deleted.length === 0) {
    throw new Error("Message not found or unauthorized to delete.");
  }

  const peerId = peerOf(session, deviceId);
  emitToDevice(peerId, "message_deleted", {
    sessionId: session.id,
    messageId: input.messageId,
  });

  return { ok: true, messageId: input.messageId };
}

export async function reportPresence(input: {
  deviceId: string;
  sessionId?: string;
  isAway: boolean;
}): Promise<{ ok: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();
  await sql`
    update stations
    set last_seen = now(), is_away = ${input.isAway}
    where device_id = ${deviceId}
  `;

  if (input.sessionId) {
    const sessions = await sql<SessionRow>`
      select id, a_id, b_id, kind, interests, created_at, closed_at
      from sessions
      where id = ${input.sessionId}
        and (a_id = ${deviceId} or b_id = ${deviceId})
    `;
    const session = sessions[0];
    if (session) {
      const peerId = peerOf(session, deviceId);
      emitToDevice(peerId, "presence_update", {
        sessionId: session.id,
        peerId: deviceId,
        isAway: input.isAway,
      });
      if (!input.isAway) {
        try {
          const updated = await sql<{ id: string }>`
            update messages
            set seen_at = coalesce(seen_at, now())
            where session_id = ${session.id}
              and from_id = ${peerId}
              and seen_at is null
            returning id
          `;
          if (updated.length > 0) {
            emitToDevice(peerId, "messages_seen", {
              sessionId: session.id,
              seenAt: new Date().toISOString(),
            });
          }
        } catch {}
      }
    }
  }

  return { ok: true };
}

export async function markMessagesSeen(input: {
  deviceId: string;
  sessionId: string;
}): Promise<{ ok: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();

  const sessionRows = await sql<SessionRow>`
    select id, a_id, b_id, kind, closed_at
    from sessions
    where id = ${input.sessionId}
      and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const session = sessionRows[0];
  if (!session || session.closed_at) return { ok: false };

  const peerId = peerOf(session, deviceId);
  try {
    const updated = await sql<{ id: string }>`
      update messages
      set seen_at = coalesce(seen_at, now())
      where session_id = ${session.id}
        and from_id = ${peerId}
        and seen_at is null
      returning id
    `;
    if (updated.length > 0) {
      emitToDevice(peerId, "messages_seen", {
        sessionId: session.id,
        seenAt: new Date().toISOString(),
      });
    }
  } catch {}

  return { ok: true };
}

export async function offerQsl(input: {
  deviceId: string;
  sessionId: string;
}): Promise<MessagesPack> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();

  const sessions = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
    from sessions
    where id = ${input.sessionId}
      and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const session = sessions[0];
  if (!session || session.kind !== "stranger" || session.closed_at) {
    throw new Error("Chat session not found or cannot offer invite.");
  }

  const peerId = peerOf(session, deviceId);
  const [a, b] = pairKey(deviceId, peerId);
  const friends = await sql<{ n: number }>`
    select count(*)::int as n from friendships where user_a = ${a} and user_b = ${b}
  `;
  if ((friends[0]?.n ?? 0) > 0) {
    throw new Error("You are already connected as friends.");
  }

  const existing = await sql<RequestRow>`
    select id, from_id, to_id, session_id, status
    from friend_requests
    where (from_id = ${deviceId} and to_id = ${peerId})
       or (from_id = ${peerId} and to_id = ${deviceId})
    order by created_at desc
    limit 1
  `;

  if (existing[0]?.status === "pending" && existing[0].from_id === peerId) {
    await acceptQslPair(peerId, deviceId, existing[0].id);
    return loadMessagesPack(deviceId, session.id);
  }

  const reqId = newId();
  await sql`
    insert into friend_requests (id, from_id, to_id, session_id, status)
    values (${reqId}, ${deviceId}, ${peerId}, ${session.id}, 'pending')
  `;

  const ttl = ttlInterval(session.kind);
  await sql`
    insert into messages (id, session_id, from_id, body, expires_at)
    values (${newId()}, ${session.id}, 'system', 'Friend request offered.', now() + ${ttl}::interval)
  `;

  emitToDevice(peerId, "friend_request", await loadDesk(peerId));
  return loadMessagesPack(deviceId, session.id);
}

export async function respondQsl(input: {
  deviceId: string;
  requestId: string;
  accept: boolean;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();

  const requests = await sql<RequestRow>`
    select id, from_id, to_id, session_id, status
    from friend_requests
    where id = ${input.requestId} and to_id = ${deviceId}
  `;
  const req = requests[0];
  if (!req || req.status !== "pending") {
    throw new Error("Friend request expired or not found.");
  }

  if (input.accept) {
    await acceptQslPair(req.from_id, deviceId, req.id);
    if (req.session_id) {
      const ttl = ttlInterval("stranger");
      await sql`
        insert into messages (id, session_id, from_id, body, expires_at)
        values (${newId()}, ${req.session_id}, 'system', 'Friend request accepted! You are now connected permanently.', now() + ${ttl}::interval)
      `;
    }
  } else {
    await sql`update friend_requests set status = 'declined' where id = ${req.id}`;
  }

  const deskSender = await loadDesk(req.from_id);
  emitToDevice(req.from_id, "desk_update", deskSender);

  return loadDesk(deviceId);
}

export async function updateCallsign(input: {
  deviceId: string;
  callsign: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const raw = typeof input.callsign === "string" ? input.callsign.trim() : "";
  if (!raw) {
    throw new Error("Callsign cannot be empty.");
  }
  const clean = raw.slice(0, 32);
  const sql = await getSql();

  await sql`
    insert into stations (device_id, callsign, is_custom, last_seen)
    values (${deviceId}, ${clean}, true, now())
    on conflict (device_id) do update
    set callsign = ${clean}, is_custom = true, last_seen = now()
  `;

  return loadDesk(deviceId);
}

export async function deleteStation(input: { deviceId: string }): Promise<{ ok: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();

  await Promise.all([
    sql`delete from queue where device_id = ${deviceId}`,
    sql`delete from friend_requests where from_id = ${deviceId} or to_id = ${deviceId}`,
    sql`delete from friendships where user_a = ${deviceId} or user_b = ${deviceId}`,
    sql`delete from messages where session_id in (select id from sessions where a_id = ${deviceId} or b_id = ${deviceId})`,
    sql`delete from sessions where a_id = ${deviceId} or b_id = ${deviceId}`,
    sql`delete from stations where device_id = ${deviceId}`,
  ]);

  return { ok: true };
}

export async function listVoidLetters(deviceId: string): Promise<VoidLetter[]> {
  requireDeviceId(deviceId);
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    device_id: string;
    callsign: string;
    text: string;
    stars: number;
    created_at: Date | string;
    has_starred: boolean;
  }>`
    select
      vl.id,
      vl.device_id,
      vl.callsign,
      vl.text,
      vl.stars,
      vl.created_at,
      case when vs.device_id is not null then true else false end as has_starred
    from void_letters vl
    left join void_stars vs on vs.letter_id = vl.id and vs.device_id = ${deviceId}
    order by vl.created_at desc
    limit 60
  `;

  return rows.map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    callsign: r.callsign,
    text: r.text,
    stars: Number(r.stars),
    hasStarred: Boolean(r.has_starred),
    createdAt: asIso(r.created_at),
  }));
}

export async function castVoidLetter(input: {
  deviceId: string;
  text: string;
  ip?: string;
}): Promise<{ ok: boolean; letter?: VoidLetter; error?: string }> {
  const deviceId = requireDeviceId(input.deviceId);
  const text = requireText(input.text, 500);

  const safety = evaluateSafety(text);
  if (!safety.allowed) {
    return { ok: false, error: `Content not allowed: ${safety.reason}` };
  }

  const sql = await getSql();
  const recent = await sql<{ n: number }>`
    select count(*)::int as n from void_letters
    where device_id = ${deviceId} and created_at > now() - interval '30 seconds'
  `;
  if ((recent[0]?.n ?? 0) > 0) {
    return {
      ok: false,
      error: "Please wait a moment before casting another thought into the void.",
    };
  }

  const station = await loadDesk(deviceId, input.ip);
  const letterId = newId();

  const inserted = await sql<{
    id: string;
    device_id: string;
    callsign: string;
    text: string;
    stars: number;
    created_at: Date | string;
  }>`
    insert into void_letters (id, device_id, callsign, text, stars)
    values (${letterId}, ${deviceId}, ${station.station.callsign}, ${text}, 0)
    returning id, device_id, callsign, text, stars, created_at
  `;

  const row = inserted[0];
  if (!row) return { ok: false, error: "Failed to cast thought." };

  return {
    ok: true,
    letter: {
      id: row.id,
      deviceId: row.device_id,
      callsign: row.callsign,
      text: row.text,
      stars: 0,
      hasStarred: false,
      createdAt: asIso(row.created_at),
    },
  };
}

export async function starVoidLetter(input: {
  deviceId: string;
  letterId: string;
}): Promise<{ ok: boolean; stars: number; hasStarred: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const letterId = input.letterId;
  const sql = await getSql();

  const existingStar = await sql<{ letter_id: string }>`
    select letter_id from void_stars where letter_id = ${letterId} and device_id = ${deviceId}
  `;

  if (existingStar.length > 0) {
    await sql`delete from void_stars where letter_id = ${letterId} and device_id = ${deviceId}`;
    const updated = await sql<{ stars: number }>`
      update void_letters set stars = greatest(0, stars - 1) where id = ${letterId} returning stars
    `;
    return { ok: true, stars: updated[0]?.stars ?? 0, hasStarred: false };
  }

  await sql`insert into void_stars (letter_id, device_id) values (${letterId}, ${deviceId}) on conflict do nothing`;
  const updated = await sql<{ stars: number }>`
    update void_letters set stars = stars + 1 where id = ${letterId} returning stars
  `;
  return { ok: true, stars: updated[0]?.stars ?? 1, hasStarred: true };
}

export async function blockUser(input: {
  deviceId: string;
  targetId: string;
}): Promise<{ ok: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const targetId = requireDeviceId(input.targetId);
  const sql = await getSql();

  await sql`
    insert into blocks (blocker_id, blocked_id)
    values (${deviceId}, ${targetId})
    on conflict do nothing
  `;

  return { ok: true };
}

export async function reportUser(input: {
  deviceId: string;
  targetId: string;
  reason: string;
}): Promise<{ ok: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const targetId = requireDeviceId(input.targetId);
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 500) : "Unspecified";
  const sql = await getSql();

  await sql`
    insert into abuse_reports (id, reporter_id, reported_id, reason)
    values (${newId()}, ${deviceId}, ${targetId}, ${reason})
  `;

  await sql`
    insert into blocks (blocker_id, blocked_id)
    values (${deviceId}, ${targetId})
    on conflict do nothing
  `;

  return { ok: true };
}
