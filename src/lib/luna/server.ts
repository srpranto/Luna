import { getSql, type Sql } from "./db";
import {
  FRIEND_TTL_DAYS,
  MAX_LINE_CHARS,
  QUEUE_STALE_SECONDS,
  SEND_COOLDOWN_MS,
  STRANGER_NAMES,
  type StrangerName,
  STRANGER_TTL_MINUTES,
  friendSessionId,
  hashIp,
  isDeviceId,
  minSharedForWait,
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
import { emitToDevice } from "./events";
import { evaluateSafety } from "./safety";

interface StationRow {
  device_id: string;
  callsign: string;
  created_at?: Date | string;
  last_seen?: Date | string;
  typing_until?: Date | string | null;
  ip?: string | null;
  is_custom?: boolean | null;
  public_key?: string | null;
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

function requireText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    throw new Error("Message cannot be empty.");
  }
  const body = value.replace(/\s+/g, " ").trim();
  if (!body) {
    throw new Error("Message cannot be empty.");
  }
  if (body.length > max) {
    throw new Error(`Line too long (${max} max).`);
  }
  return body;
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
): Promise<Station> {
  const ip = clientIp?.trim() || "127.0.0.1";
  const sql = await getSql();
  let existing: StationRow[];
  try {
    existing = await sql<StationRow>`
      select device_id, callsign, ip, is_custom, public_key from stations where device_id = ${deviceId}
    `;
  } catch (err: unknown) {
    if (String(err).includes("public_key")) {
      try {
        await sql.query("alter table stations add column if not exists public_key text;");
      } catch {}
      existing = await sql<StationRow>`
        select device_id, callsign, ip, is_custom, public_key from stations where device_id = ${deviceId}
      `;
    } else {
      throw err;
    }
  }

  if (existing[0]) {
    const row = existing[0];
    const keyToSave = publicKey ?? row.public_key ?? null;
    if (row.is_custom) {
      await sql`update stations set last_seen = now(), ip = ${ip}, public_key = ${keyToSave} where device_id = ${deviceId}`;
      return { deviceId: row.device_id, callsign: row.callsign, publicKey: keyToSave ?? undefined };
    }

    const ipChanged = Boolean(row.ip && row.ip !== ip);
    const isKnownPool = STRANGER_NAMES.includes(row.callsign as StrangerName);

    if (ipChanged || !isKnownPool) {
      const nextCallsign = await findAvailableStrangerName(sql, ip, deviceId);
      await sql`
        update stations
        set callsign = ${nextCallsign}, ip = ${ip}, last_seen = now(), is_custom = false, public_key = ${keyToSave}
        where device_id = ${deviceId}
      `;
      return { deviceId: row.device_id, callsign: nextCallsign, publicKey: keyToSave ?? undefined };
    }

    await sql`update stations set last_seen = now(), ip = ${ip}, public_key = ${keyToSave} where device_id = ${deviceId}`;
    return { deviceId: row.device_id, callsign: row.callsign, publicKey: keyToSave ?? undefined };
  }

  const callsign = await findAvailableStrangerName(sql, ip);
  const keyToSave = publicKey ?? null;
  try {
    await sql`
      insert into stations (device_id, callsign, ip, is_custom, last_seen, public_key)
      values (${deviceId}, ${callsign}, ${ip}, false, now(), ${keyToSave})
      on conflict (device_id) do update set last_seen = now(), ip = ${ip}, public_key = coalesce(${keyToSave}, stations.public_key)
    `;
    return { deviceId, callsign, publicKey: keyToSave ?? undefined };
  } catch (insertErr) {
    if (String(insertErr).includes("public_key")) {
      try {
        await sql.query("alter table stations add column if not exists public_key text;");
        await sql`
          insert into stations (device_id, callsign, ip, is_custom, last_seen, public_key)
          values (${deviceId}, ${callsign}, ${ip}, false, now(), ${keyToSave})
          on conflict (device_id) do update set last_seen = now(), ip = ${ip}, public_key = coalesce(${keyToSave}, stations.public_key)
        `;
        return { deviceId, callsign, publicKey: keyToSave ?? undefined };
      } catch {}
    }
    const retry = await sql<StationRow>`
      select device_id, callsign, public_key from stations where device_id = ${deviceId}
    `;
    if (retry[0]) {
      return {
        deviceId: retry[0].device_id,
        callsign: retry[0].callsign,
        publicKey: retry[0].public_key ?? undefined,
      };
    }
  }
  return { deviceId, callsign, publicKey: keyToSave ?? undefined };
}

async function cleanup(sql?: Sql): Promise<void> {
  if (!sql) {
    sql = await getSql();
  }
  const stale = `${QUEUE_STALE_SECONDS} seconds`;
  await sql`delete from queue where last_beat < now() - ${stale}::interval`;
  await sql`delete from messages where expires_at < now()`;
}

async function loadSessionView(session: SessionRow, deviceId: string): Promise<SessionView> {
  const peerId = peerOf(session, deviceId);
  const [left, right] = pairKey(deviceId, peerId);
  const sql = await getSql();
  const [peerCallsign, outbound, inbound, friends, peerStationRows] = await Promise.all([
    callsignOf(peerId),
    sql<RequestRow>`
        select id, from_id, to_id, session_id, status
        from friend_requests
        where from_id = ${deviceId} and to_id = ${peerId}
        order by created_at desc
        limit 1
      `,
    sql<RequestRow>`
        select id, from_id, to_id, session_id, status
        from friend_requests
        where from_id = ${peerId} and to_id = ${deviceId}
        order by created_at desc
        limit 1
      `,
    sql<{ n: number }>`
        select count(*)::int as n from friendships
        where user_a = ${left} and user_b = ${right}
      `,
    sql<{
      last_seen: string;
      typing_until: string | null;
      public_key: string | null;
      is_away: boolean | null;
    }>`
        select last_seen, typing_until, public_key, is_away from stations where device_id = ${peerId}
      `,
  ]);

  const peerStation = peerStationRows[0];
  const nowMs = Date.now();
  const peerLastSeenMs = peerStation?.last_seen ? new Date(peerStation.last_seen).getTime() : 0;
  const peerLastSeen = peerStation?.last_seen ? asIso(peerStation.last_seen) : undefined;
  const peerTyping = Boolean(
    peerStation?.typing_until && new Date(peerStation.typing_until).getTime() > nowMs,
  );
  const diffSec = peerLastSeenMs > 0 ? (nowMs - peerLastSeenMs) / 1000 : 0;
  const isStranger = session.kind === "stranger";
  const isUnclosed = !session.closed_at;

  const peerIsAway = Boolean(peerStation?.is_away || diffSec >= 60);
  const peerPresence: "active" | "away" | "disconnected" = session.closed_at
    ? "disconnected"
    : peerIsAway
      ? "away"
      : "active";

  if (isStranger && isUnclosed && diffSec >= 300 && peerLastSeenMs > 0) {
    await sql`update sessions set closed_at = now() where id = ${session.id}`;
    session.closed_at = new Date().toISOString();
    await sql`
      insert into messages (id, session_id, from_id, body, expires_at)
      values (${newId()}, ${session.id}, 'system', 'Stranger disconnected. User is no longer available right now.', now() + interval '24 hours')
    `;
    emitToDevice(deviceId, "session_ended", {
      sessionId: session.id,
      reason: "User is no longer available right now.",
    });
    emitToDevice(peerId, "session_ended", {
      sessionId: session.id,
      reason: "User is no longer available right now.",
    });
  }

  return {
    id: session.id,
    kind: session.kind,
    peerId,
    peerCallsign,
    peerPublicKey: peerStation?.public_key ?? undefined,
    interests: parseInterests(session.interests),
    createdAt: asIso(session.created_at),
    closed: Boolean(session.closed_at),
    outboundQsl: outbound[0]?.status ?? null,
    inboundQsl: inbound[0] ? { id: inbound[0].id, status: inbound[0].status } : null,
    alreadyFriends: (friends[0]?.n ?? 0) > 0,
    peerTyping,
    peerLastSeen,
    peerPresence,
    peerIsAway,
  };
}

async function openSessionFor(deviceId: string): Promise<SessionRow | undefined> {
  const sql = await getSql();
  const rows = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
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
): Promise<MessagesPack> {
  const sql = await getSql();
  await sql`update stations set last_seen = now() where device_id = ${deviceId}`;
  await sql`delete from messages where expires_at < now()`;

  const sessions = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
    from sessions
    where id = ${sessionId}
      and (a_id = ${deviceId} or b_id = ${deviceId})
  `;
  const session = sessions[0];
  if (!session) {
    throw new Error("Line not found.");
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
  if (!isAway) {
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
    } catch (err) {
      if (String(err).includes("seen_at")) {
        try {
          await sql.query("alter table messages add column if not exists seen_at timestamptz;");
          const retry = await sql<{ id: string }>`
            update messages
            set seen_at = coalesce(seen_at, now())
            where session_id = ${session.id}
              and from_id <> ${deviceId}
              and seen_at is null
            returning id
          `;
          if (retry.length > 0) {
            markedSeen = true;
          }
        } catch {}
      }
    }
  }

  let rows: MessageRow[];
  try {
    rows = await sql<MessageRow>`
      select id, session_id, from_id, body, created_at, expires_at, copied_at, edited_at, seen_at
      from messages
      where session_id = ${session.id}
        and expires_at > now()
      order by created_at asc
      limit 200
    `;
  } catch (err) {
    if (String(err).includes("seen_at")) {
      try {
        await sql.query("alter table messages add column if not exists seen_at timestamptz;");
        rows = await sql<MessageRow>`
          select id, session_id, from_id, body, created_at, expires_at, copied_at, edited_at, seen_at
          from messages
          where session_id = ${session.id}
            and expires_at > now()
          order by created_at asc
          limit 200
        `;
      } catch {
        rows = await sql<MessageRow>`
          select id, session_id, from_id, body, created_at, expires_at, copied_at, edited_at
          from messages
          where session_id = ${session.id}
            and expires_at > now()
          order by created_at asc
          limit 200
        `;
      }
    } else {
      throw err;
    }
  }

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
    void (async () => {
      try {
        const senderPack = await loadMessagesPack(peerId, session.id, true);
        emitToDevice(peerId, "message", senderPack);
      } catch {}
    })();
  }

  return {
    session: await loadSessionView(session, deviceId),
    messages,
  };
}

async function getBanInfo(
  deviceId: string,
  ip?: string,
): Promise<{ banned: boolean; reason?: string; violation?: string } | null> {
  const sql = await getSql();
  const cleanIp = ip?.trim() || "";
  try {
    const rows = await sql<{ device_id: string; ip: string; reason: string; violation: string }>`
      select device_id, ip, reason, violation from bans
      where device_id = ${deviceId} or (ip is not null and ip <> '' and ip = ${cleanIp})
      limit 1
    `;
    if (rows[0]) {
      return {
        banned: true,
        reason: rows[0].reason,
        violation: rows[0].violation,
      };
    }
  } catch {
    return null;
  }
  return null;
}

async function banDevice(
  deviceId: string,
  ip: string,
  reason: string,
  violation: string,
): Promise<void> {
  const sql = await getSql();
  const cleanIp = ip?.trim() || "";
  try {
    await sql`
      insert into bans (device_id, ip, reason, violation, banned_at)
      values (${deviceId}, ${cleanIp}, ${reason}, ${violation}, now())
      on conflict (device_id) do update set reason = ${reason}, violation = ${violation}, banned_at = now()
    `;
  } catch {}

  try {
    await sql`delete from queue where device_id = ${deviceId}`;
  } catch {}

  try {
    const activeSessions = await sql<SessionRow>`
      select id, a_id, b_id, kind, interests, created_at, closed_at from sessions
      where (a_id = ${deviceId} or b_id = ${deviceId}) and closed_at is null
    `;

    for (const s of activeSessions) {
      await sql`update sessions set closed_at = now() where id = ${s.id}`;
      const peerId = peerOf(s, deviceId);
      emitToDevice(peerId, "peer_banned", {
        sessionId: s.id,
        reason: "The other user was removed and banned for violating community safety guidelines.",
      });
      emitToDevice(peerId, "session_ended", { sessionId: s.id });
    }
  } catch {}

  emitToDevice(deviceId, "banned", {
    reason,
    violation,
  });
}

export async function recordMSpamSession(
  deviceId: string,
  ip: string,
  sessionId: string,
): Promise<{ banned: boolean; count: number }> {
  const sql = await getSql();
  const cleanIp = ip?.trim() || "";
  const id = newId();
  try {
    await sql`
      insert into violation_logs (id, device_id, ip, violation, session_id, created_at)
      values (${id}, ${deviceId}, ${cleanIp}, 'm_spam', ${sessionId}, now())
    `;

    const countRows = await sql<{ n: number }>`
      select count(distinct session_id)::int as n
      from violation_logs
      where (device_id = ${deviceId} or (ip is not null and ip <> '' and ip = ${cleanIp}))
        and violation = 'm_spam'
    `;
    const count = countRows[0]?.n ?? 1;

    if (count >= 5) {
      await banDevice(
        deviceId,
        cleanIp,
        "Automated ban: Excessive 'M'/gender spam across 5 or more chats.",
        "m_spam",
      );
      return { banned: true, count };
    }

    return { banned: false, count };
  } catch {
    return { banned: false, count: 1 };
  }
}

export async function reportViolationRpc(input: {
  deviceId: string;
  peerId?: string;
  sessionId?: string;
  violation: string;
  sample?: string;
  clientIp?: string;
}): Promise<{ ok: boolean; banned: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const targetId = input.peerId ? requireDeviceId(input.peerId) : deviceId;
  const sql = await getSql();

  const ipRows = await sql<StationRow>`select ip from stations where device_id = ${targetId}`;
  const targetIp = ipRows[0]?.ip ?? input.clientIp ?? "";

  const reasonMap: Record<string, string> = {
    severe: "Zero-tolerance violation: Incest, exploitation, or non-consensual content.",
    sexual: "Prohibited content: Unsolicited sexual talk or harassment.",
    m_spam: "Automated ban: Excessive 'M'/gender spam across 5 or more chats.",
  };

  const reason = reasonMap[input.violation] ?? "Violation of Luna safety policies.";

  await banDevice(targetId, targetIp, reason, input.violation);
  return { ok: true, banned: true };
}

async function loadDesk(
  deviceId: string,
  clientIp?: string,
  publicKey?: string,
): Promise<DeskView> {
  const ban = await getBanInfo(deviceId, clientIp);
  if (ban?.banned) {
    return {
      station: { deviceId, callsign: "RESTRICTED" },
      friends: [],
      inboundQsl: [],
      activeSession: null,
      queued: false,
      queuedInterests: [],
      enteredAt: null,
      banned: true,
      banReason: ban.reason,
    };
  }

  const station = await touchStation(deviceId, clientIp, publicKey);
  const sql = await getSql();
  const [friendRows, inboundRows, activeSessionRow, queueRows] = await Promise.all([
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
  ]);

  const friendIds = friendRows.map((row) => (row.user_a === deviceId ? row.user_b : row.user_a));

  const friends: FriendRow[] = await Promise.all(
    friendIds.map(async (fid) => ({
      deviceId: fid,
      callsign: await callsignOf(fid),
    })),
  );

  const inboundQsl: QslRow[] = await Promise.all(
    inboundRows.map(async (row) => ({
      id: row.id,
      fromId: row.from_id,
      fromCallsign: await callsignOf(row.from_id),
      toId: row.to_id,
      toCallsign: station.callsign,
      status: row.status,
    })),
  );

  const activeSession = activeSessionRow ? await loadSessionView(activeSessionRow, deviceId) : null;

  const queuedRow = queueRows[0];

  return {
    station,
    friends,
    inboundQsl,
    activeSession,
    queued: Boolean(queuedRow),
    queuedInterests: parseInterests(queuedRow?.interests),
    enteredAt: queuedRow ? asIso(queuedRow.entered_at) : null,
  };
}

async function heartbeatQueueHandler(
  deviceId: string,
  blockedIds: string[] = [],
  clientIp?: string,
): Promise<QueueHeartbeatResult> {
  await cleanup();
  const sql = await getSql();
  const open = await openSessionFor(deviceId);
  if (open) {
    return { status: "matched", desk: await loadDesk(deviceId, clientIp) };
  }

  const meRows = await sql<QueueRow>`
    select device_id, interests, entered_at, last_beat
    from queue where device_id = ${deviceId}
  `;
  const me = meRows[0];
  if (!me) {
    return { status: "idle", desk: await loadDesk(deviceId, clientIp) };
  }

  await sql`update queue set last_beat = now() where device_id = ${deviceId}`;

  const waitMs = Date.now() - new Date(me.entered_at).getTime();
  const myInterests = parseInterests(me.interests);
  const minShared = minSharedForWait(Number.isFinite(waitMs) ? waitMs : 0);
  const stale = `${QUEUE_STALE_SECONDS} seconds`;

  const others = await sql<QueueRow>`
    select device_id, interests, entered_at, last_beat
    from queue
    where device_id <> ${deviceId}
      and last_beat > now() - ${stale}::interval
  `;

  let best: { row: QueueRow; shared: string[] } | null = null;
  for (const row of others) {
    if (blockedIds.includes(row.device_id)) {
      continue;
    }
    const shared = sharedInterests(myInterests, parseInterests(row.interests));
    if (shared.length < minShared) {
      continue;
    }
    if (
      !best ||
      shared.length > best.shared.length ||
      (shared.length === best.shared.length && row.entered_at < best.row.entered_at)
    ) {
      best = { row, shared };
    }
  }

  if (!best) {
    return {
      status: "waiting",
      desk: await loadDesk(deviceId, clientIp),
    };
  }

  const removed = await sql<{ device_id: string }>`
    delete from queue
    where device_id = ${deviceId} or device_id = ${best.row.device_id}
    returning device_id
  `;
  if (removed.length < 2) {
    const payload = JSON.stringify(myInterests);
    await sql`
      insert into queue (device_id, interests, entered_at, last_beat)
      values (${deviceId}, ${payload}, ${me.entered_at}, now())
      on conflict (device_id) do update set last_beat = now()
    `;
    return {
      status: "waiting",
      desk: await loadDesk(deviceId, clientIp),
    };
  }

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
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  return loadDesk(deviceId, input.clientIp, input.publicKey);
}

export async function getDesk(input: {
  deviceId: string;
  clientIp?: string;
  publicKey?: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  return loadDesk(deviceId, input.clientIp, input.publicKey);
}

export async function joinQueue(input: {
  deviceId: string;
  interests: string[];
  blockedIds?: string[];
  clientIp?: string;
  publicKey?: string;
}): Promise<QueueHeartbeatResult> {
  const deviceId = requireDeviceId(input.deviceId);
  const ban = await getBanInfo(deviceId, input.clientIp);
  if (ban?.banned) {
    throw new Error(`Access restricted: ${ban.reason}`);
  }

  const interests = sanitizeInterests(input.interests);
  if (interests.length < 1) {
    throw new Error("Enter at least one interest to start chatting.");
  }

  await cleanup();

  const existing = await openSessionFor(deviceId);
  if (existing) {
    throw new Error("Please leave your current chat first.");
  }

  if (input.publicKey) {
    await touchStation(deviceId, input.clientIp, input.publicKey);
  }

  const sql = await getSql();
  const payload = JSON.stringify(interests);
  await sql`
    insert into queue (device_id, interests, entered_at, last_beat)
    values (${deviceId}, ${payload}, now(), now())
    on conflict (device_id) do update
    set interests = ${payload}, entered_at = now(), last_beat = now()
  `;

  return heartbeatQueueHandler(deviceId, input.blockedIds ?? [], input.clientIp);
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
}): Promise<QueueHeartbeatResult> {
  const deviceId = requireDeviceId(input.deviceId);
  return heartbeatQueueHandler(deviceId, input.blockedIds ?? [], input.clientIp);
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
    emitToDevice(peerId, "typing", { isTyping: input.isTyping });
  }
  return { ok: true };
}

export async function openFriendLine(input: {
  deviceId: string;
  friendId: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const friendId = requireDeviceId(input.friendId);
  if (deviceId === friendId) {
    throw new Error("Cannot open chat with self.");
  }

  const [a, b] = pairKey(deviceId, friendId);
  const sql = await getSql();
  const pairs = await sql<{ n: number }>`
    select count(*)::int as n from friendships where user_a = ${a} and user_b = ${b}
  `;
  if ((pairs[0]?.n ?? 0) === 0) {
    throw new Error("No friend connection on file.");
  }

  const active = await openSessionFor(deviceId);
  if (active) {
    throw new Error("Please leave your current chat first.");
  }

  const sessionId = friendSessionId(deviceId, friendId);
  const existing = await sql<SessionRow>`
    select id, a_id, b_id, kind, interests, created_at, closed_at
    from sessions where id = ${sessionId}
  `;

  if (!existing[0]) {
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${a}, ${b}, 'friend', '[]')
    `;
  } else if (existing[0].closed_at) {
    await sql`
      update sessions set closed_at = null, created_at = now() where id = ${sessionId}
    `;
  }

  const desk = await loadDesk(deviceId);
  const peerDesk = await loadDesk(friendId);
  emitToDevice(friendId, "desk_update", peerDesk);
  return desk;
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

  const peerId = peerOf(session, deviceId);
  await sql`update sessions set closed_at = now() where id = ${session.id}`;

  const ttl = ttlInterval(session.kind);
  await sql`
    insert into messages (id, session_id, from_id, body, expires_at)
    values (${newId()}, ${session.id}, 'system', 'Stranger disconnected. User is no longer available right now.', now() + ${ttl}::interval)
  `;

  const desk = await loadDesk(deviceId);
  const peerDesk = await loadDesk(peerId);
  emitToDevice(peerId, "session_ended", { sessionId: session.id, desk: peerDesk });
  emitToDevice(peerId, "desk_update", peerDesk);
  return desk;
}

export async function listMessages(input: {
  deviceId: string;
  sessionId: string;
}): Promise<MessagesPack> {
  const deviceId = requireDeviceId(input.deviceId);
  return loadMessagesPack(deviceId, input.sessionId);
}

export async function sendMessage(input: {
  deviceId: string;
  sessionId: string;
  body: string;
}): Promise<MessagesPack> {
  const deviceId = requireDeviceId(input.deviceId);
  const ban = await getBanInfo(deviceId);
  if (ban?.banned) {
    throw new Error(`Your device has been banned: ${ban.reason}`);
  }

  const body = requireText(input.body, MAX_LINE_CHARS);
  const sql = await getSql();

  if (!body.startsWith("e2e:")) {
    const safety = evaluateSafety(body);
    if (safety.autoBan) {
      const ipRows = await sql<StationRow>`select ip from stations where device_id = ${deviceId}`;
      const targetIp = ipRows[0]?.ip ?? "";
      await banDevice(deviceId, targetIp, safety.reason ?? "Policy violation", safety.severity);
      throw new Error(`Message blocked: ${safety.reason}`);
    }
  }

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
  if (session.closed_at) {
    throw new Error("This conversation has ended.");
  }

  const recent = await sql<MessageRow>`
    select id, session_id, from_id, body, created_at, expires_at, copied_at
    from messages
    where session_id = ${session.id} and from_id = ${deviceId}
    order by created_at desc
    limit 1
  `;
  if (recent[0]) {
    const age = Date.now() - new Date(recent[0].created_at).getTime();
    if (Number.isFinite(age) && age < SEND_COOLDOWN_MS) {
      throw new Error("Please wait a moment before sending another message.");
    }
  }

  const ttl = ttlInterval(session.kind);
  await sql`
    insert into messages (id, session_id, from_id, body, expires_at)
    values (${newId()}, ${session.id}, ${deviceId}, ${body}, now() + ${ttl}::interval)
  `;

  const peerId = peerOf(session, deviceId);
  const peerPack = await loadMessagesPack(peerId, session.id, true);
  const pack = await loadMessagesPack(deviceId, session.id, true);

  emitToDevice(peerId, "message", peerPack);
  emitToDevice(deviceId, "message", pack);

  return pack;
}

export async function editMessage(input: {
  deviceId: string;
  sessionId: string;
  messageId: string;
  body: string;
}): Promise<MessagesPack> {
  const deviceId = requireDeviceId(input.deviceId);
  const ban = await getBanInfo(deviceId);
  if (ban?.banned) {
    throw new Error(`Your device has been banned: ${ban.reason}`);
  }

  const body = requireText(input.body, MAX_LINE_CHARS);
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
  if (session.closed_at) {
    throw new Error("This conversation has ended.");
  }

  const messages = await sql<MessageRow>`
    select id, session_id, from_id, body, created_at, expires_at, copied_at
    from messages
    where id = ${input.messageId} and session_id = ${session.id}
  `;
  const target = messages[0];
  if (!target) {
    throw new Error("Message not found.");
  }
  if (target.from_id !== deviceId) {
    throw new Error("You can only edit your own messages.");
  }

  await sql`
    update messages
    set body = ${body}, edited_at = now()
    where id = ${input.messageId} and session_id = ${session.id}
  `;

  const peerId = peerOf(session, deviceId);
  const [pack, peerPack] = await Promise.all([
    loadMessagesPack(deviceId, session.id),
    loadMessagesPack(peerId, session.id),
  ]);

  emitToDevice(peerId, "message_edited", peerPack);
  emitToDevice(deviceId, "message_edited", pack);

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

  const messages = await sql<MessageRow>`
    select id, session_id, from_id, body, created_at, expires_at, copied_at
    from messages
    where id = ${input.messageId} and session_id = ${session.id}
  `;
  const target = messages[0];
  if (!target) {
    return { ok: true, messageId: input.messageId };
  }
  if (target.from_id !== deviceId) {
    throw new Error("You can only delete your own messages.");
  }

  await sql`
    delete from messages
    where id = ${input.messageId} and session_id = ${session.id}
  `;

  const peerId = peerOf(session, deviceId);
  emitToDevice(peerId, "message_deleted", { sessionId: session.id, messageId: input.messageId });
  emitToDevice(deviceId, "message_deleted", { sessionId: session.id, messageId: input.messageId });

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
            const peerPack = await loadMessagesPack(peerId, session.id, true);
            emitToDevice(peerId, "message", peerPack);
          }
        } catch (err) {
          if (String(err).includes("seen_at")) {
            try {
              await sql.query("alter table messages add column if not exists seen_at timestamptz;");
            } catch {}
          }
        }
      }
    }
  }

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
  if (!session) {
    throw new Error("Chat session not found.");
  }
  if (session.kind !== "stranger") {
    throw new Error("Friend requests are only for stranger chats.");
  }
  const peerId = peerOf(session, deviceId);

  const [a, b] = pairKey(deviceId, peerId);
  const already = await sql<{ n: number }>`
    select count(*)::int as n from friendships where user_a = ${a} and user_b = ${b}
  `;
  if ((already[0]?.n ?? 0) > 0) {
    throw new Error("Already friends.");
  }

  const pending = await sql<RequestRow>`
    select id, from_id, to_id, session_id, status
    from friend_requests
    where from_id = ${peerId} and to_id = ${deviceId} and status = 'pending'
  `;
  if (pending[0]) {
    await acceptQslPair(deviceId, peerId, pending[0].id);
    const [pack, peerPack] = await Promise.all([
      loadMessagesPack(deviceId, session.id),
      loadMessagesPack(peerId, session.id),
    ]);
    emitToDevice(peerId, "message", peerPack);
    emitToDevice(peerId, "desk_update", await loadDesk(peerId));
    emitToDevice(deviceId, "desk_update", await loadDesk(deviceId));
    return pack;
  }

  await sql`
    insert into friend_requests (id, from_id, to_id, session_id, status)
    values (${newId()}, ${deviceId}, ${peerId}, ${session.id}, 'pending')
  `;
  const ttl = `${STRANGER_TTL_MINUTES} minutes`;
  await sql`
    insert into messages (id, session_id, from_id, body, expires_at)
    values (${newId()}, ${session.id}, 'system', 'A friend request was sent.', now() + ${ttl}::interval)
  `;

  const [pack, peerPack] = await Promise.all([
    loadMessagesPack(deviceId, session.id),
    loadMessagesPack(peerId, session.id),
  ]);
  emitToDevice(peerId, "message", peerPack);
  emitToDevice(peerId, "desk_update", await loadDesk(peerId));
  emitToDevice(deviceId, "desk_update", await loadDesk(deviceId));

  return pack;
}

export async function respondQsl(input: {
  deviceId: string;
  requestId: string;
  accept: boolean;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();
  const rows = await sql<RequestRow>`
    select id, from_id, to_id, session_id, status
    from friend_requests
    where id = ${input.requestId} and to_id = ${deviceId}
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Request not found.");
  }
  if (row.status !== "pending") {
    return loadDesk(deviceId);
  }

  if (!input.accept) {
    await sql`update friend_requests set status = 'declined' where id = ${row.id}`;
    const desk = await loadDesk(deviceId);
    emitToDevice(row.from_id, "desk_update", await loadDesk(row.from_id));
    return desk;
  }

  await acceptQslPair(deviceId, row.from_id, row.id);
  const desk = await loadDesk(deviceId);
  emitToDevice(row.from_id, "desk_update", await loadDesk(row.from_id));
  return desk;
}

export async function updateCallsign(input: {
  deviceId: string;
  callsign: string;
}): Promise<DeskView> {
  const deviceId = requireDeviceId(input.deviceId);
  const raw = requireText(input.callsign, 20);
  const clean = raw.trim().replace(/[^A-Za-z0-9_-]/g, "");
  if (clean.length < 2) {
    throw new Error("Alias must be at least 2 alphanumeric characters.");
  }
  const sql = await getSql();
  const clash = await sql<{ device_id: string }>`
    select device_id from stations where lower(callsign) = lower(${clean}) and device_id <> ${deviceId}
  `;
  if (clash[0]) {
    throw new Error("That alias is already taken by someone here.");
  }
  await sql`
    insert into stations (device_id, callsign, is_custom, last_seen)
    values (${deviceId}, ${clean}, true, now())
    on conflict (device_id) do update set callsign = ${clean}, is_custom = true, last_seen = now()
  `;
  return loadDesk(deviceId);
}

export async function deleteStation(input: { deviceId: string }): Promise<{ ok: boolean }> {
  const deviceId = requireDeviceId(input.deviceId);
  const sql = await getSql();
  await Promise.all([
    sql`delete from messages where session_id in (select id from sessions where a_id = ${deviceId} or b_id = ${deviceId})`,
    sql`delete from stations where device_id = ${deviceId}`,
    sql`delete from queue where device_id = ${deviceId}`,
    sql`delete from friend_requests where from_id = ${deviceId} or to_id = ${deviceId}`,
    sql`delete from friendships where user_a = ${deviceId} or user_b = ${deviceId}`,
  ]);
  return { ok: true };
}

export async function listVoidLetters(deviceId: string): Promise<VoidLetter[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    device_id: string;
    callsign: string;
    text: string;
    stars: number;
    created_at: Date | string;
    has_starred?: boolean;
  }>`
    select 
      l.id,
      l.device_id,
      l.callsign,
      l.text,
      l.stars,
      l.created_at,
      case when s.device_id is not null then true else false end as has_starred
    from void_letters l
    left join void_stars s on s.letter_id = l.id and s.device_id = ${deviceId}
    where l.created_at > now() - interval '24 hours'
    order by l.created_at desc
    limit 50
  `;

  return rows.map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    callsign: r.callsign,
    text: r.text,
    stars: Number(r.stars) || 0,
    hasStarred: Boolean(r.has_starred),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function castVoidLetter(input: {
  deviceId: string;
  text: string;
  ip?: string;
}): Promise<{ ok: boolean; letter?: VoidLetter; error?: string }> {
  const deviceId = requireDeviceId(input.deviceId);
  const ban = await getBanInfo(deviceId);
  if (ban?.banned) {
    throw new Error(`Your device has been banned: ${ban.reason}`);
  }

  const cleaned = input.text.trim().slice(0, 280);
  if (!cleaned) {
    return { ok: false, error: "Letter cannot be empty." };
  }

  const safety = evaluateSafety(cleaned, true);
  if (safety.autoBan) {
    await banDevice(deviceId, input.ip ?? "", safety.reason ?? "Policy violation", safety.severity);
    return { ok: false, error: safety.reason ?? "Message rejected by safety filter." };
  }

  const sql = await getSql();
  const recent = await sql<{ id: string }>`
    select id from void_letters 
    where device_id = ${deviceId} and created_at > now() - interval '30 seconds'
    limit 1
  `;
  if (recent.length > 0) {
    return {
      ok: false,
      error: "Please wait a moment before casting another thought into the void.",
    };
  }

  const station = await sql<{ callsign: string }>`
    select callsign from stations where device_id = ${deviceId}
  `;
  const callsign = station[0]?.callsign ?? "Anon";
  const id = newId();

  await sql`
    insert into void_letters (id, device_id, callsign, text, stars)
    values (${id}, ${deviceId}, ${callsign}, ${cleaned}, 0)
  `;

  return {
    ok: true,
    letter: {
      id,
      deviceId,
      callsign,
      text: cleaned,
      stars: 0,
      hasStarred: false,
      createdAt: new Date().toISOString(),
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

  const existing = await sql<{ device_id: string }>`
    select device_id from void_stars
    where letter_id = ${letterId} and device_id = ${deviceId}
  `;

  if (existing.length > 0) {
    await sql`delete from void_stars where letter_id = ${letterId} and device_id = ${deviceId}`;
    await sql`update void_letters set stars = greatest(0, stars - 1) where id = ${letterId}`;
    const countRes = await sql<{
      stars: number;
    }>`select stars from void_letters where id = ${letterId}`;
    return { ok: true, stars: Number(countRes[0]?.stars ?? 0), hasStarred: false };
  } else {
    await sql`insert into void_stars (letter_id, device_id) values (${letterId}, ${deviceId}) on conflict do nothing`;
    await sql`update void_letters set stars = stars + 1 where id = ${letterId}`;
    const countRes = await sql<{
      stars: number;
    }>`select stars from void_letters where id = ${letterId}`;
    return { ok: true, stars: Number(countRes[0]?.stars ?? 1), hasStarred: true };
  }
}
