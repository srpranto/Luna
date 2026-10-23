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

interface SessionWithStationsRow {
  id: string;
  a_id: string;
  b_id: string;
  kind: SessionKind;
  interests: unknown;
  created_at: Date | string;
  closed_at: Date | string | null;
  a_callsign: string | null;
  a_public_key: string | null;
  a_is_away: boolean | null;
  a_last_seen: Date | string | null;
  a_typing_until: Date | string | null;
  b_callsign: string | null;
  b_public_key: string | null;
  b_is_away: boolean | null;
  b_last_seen: Date | string | null;
  b_typing_until: Date | string | null;
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
  // Normalize CRLF to LF and preserve intentional newlines and whitespace
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty.");
  }
  if (trimmed.length > max) {
    throw new Error(`Line too long (${max} max).`);
  }
  // Clamp excessive consecutive blank lines to at most 2
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
): Promise<Station> {
  const ip = clientIp?.trim() || "127.0.0.1";
  const sql = await getSql();
  const existing = await sql<StationRow>`
    select device_id, callsign, ip, is_custom, public_key from stations where device_id = ${deviceId}
  `;

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
  await sql`
    insert into stations (device_id, callsign, ip, is_custom, last_seen, public_key)
    values (${deviceId}, ${callsign}, ${ip}, false, now(), ${keyToSave})
    on conflict (device_id) do update set last_seen = now(), ip = ${ip}, public_key = coalesce(${keyToSave}, stations.public_key)
  `;
  return { deviceId, callsign, publicKey: keyToSave ?? undefined };
}

async function cleanup(sql?: Sql): Promise<void> {
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
  await reapAbandonedSessions(sql);
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
  const window = `${ABANDON_AFTER_MINUTES} minutes`;
  const rows = await sql<SessionRow & { a_gone: boolean; b_gone: boolean }>`
    select ses.id, ses.a_id, ses.b_id, ses.kind, ses.interests, ses.created_at, ses.closed_at,
      (sa.last_seen is null or sa.last_seen < now() - ${window}::interval) as a_gone,
      (sb.last_seen is null or sb.last_seen < now() - ${window}::interval) as b_gone
    from sessions ses
    left join stations sa on sa.device_id = ses.a_id
    left join stations sb on sb.device_id = ses.b_id
    where ses.closed_at is null
      and ses.kind = 'stranger'
      and (
        sa.last_seen is null or sb.last_seen is null
        or sa.last_seen < now() - ${window}::interval
        or sb.last_seen < now() - ${window}::interval
      )
  `;
  for (const row of rows) {
    if (isDeviceConnected(row.a_id) || isDeviceConnected(row.b_id)) {
      continue;
    }
    const aGone = Boolean(row.a_gone);
    const bGone = Boolean(row.b_gone);
    if (!aGone || !bGone) {
      continue;
    }
    const ended = await endSessionOnce(sql, row);
    if (!ended) {
      continue;
    }
    const payload = { sessionId: row.id, reason: "User is no longer available right now." };
    if (!aGone) {
      emitToDevice(row.a_id, "session_ended", payload);
    }
    if (!bGone) {
      emitToDevice(row.b_id, "session_ended", payload);
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
      last_seen: string;
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
  const isFreshSession = sessionAgeMs < 15000;
  const peerLastSeenMs = peerStation?.last_seen ? new Date(peerStation.last_seen).getTime() : 0;
  const peerLastSeen = peerStation?.last_seen ? asIso(peerStation.last_seen) : undefined;
  const peerTyping = Boolean(
    peerStation?.typing_until && new Date(peerStation.typing_until).getTime() > nowMs,
  );
  const recentlySeen = peerLastSeenMs > 0 && nowMs - peerLastSeenMs < 45000;
  const peerOnline = isDeviceConnected(peerId) || recentlySeen || isFreshSession;
  const peerIsAway = !isFreshSession && (Boolean(peerStation?.is_away) || !peerOnline);
  const peerPresence: "active" | "away" | "disconnected" = session.closed_at
    ? "disconnected"
    : peerIsAway
      ? "away"
      : "active";

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


async function loadDesk(
  deviceId: string,
  clientIp?: string,
  publicKey?: string,
): Promise<DeskView> {
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
  };
}

async function heartbeatQueueHandler(
  deviceId: string,
  blockedIds: string[] = [],
  clientIp?: string,
): Promise<QueueHeartbeatResult> {
  const rateCheck = checkMatchmakerRateLimit(deviceId);
  if (!rateCheck.allowed) {
    return {
      status: "waiting",
      desk: await loadDesk(deviceId, clientIp),
    };
  }

  const sql = await getSql();
  const open = await openSessionFor(deviceId);
  if (open) {
    await sql`delete from queue where device_id = ${deviceId}`;
    return { status: "matched", desk: await loadDesk(deviceId, clientIp) };
  }

  // Update heartbeats immediately so active users are never pruned by cleanup
  await sql`update queue set last_beat = now() where device_id = ${deviceId}`;
  await sql`update stations set last_seen = now() where device_id = ${deviceId}`;

  // Enforce server-side blocks: query permanent blocks recorded on server
  const serverBlocks = await sql<{ peer_id: string }>`
    select blocked_id as peer_id from blocks where blocker_id = ${deviceId}
    union
    select blocker_id as peer_id from blocks where blocked_id = ${deviceId}
  `;
  const blockedSet = new Set([...blockedIds, ...serverBlocks.map((b) => b.peer_id)]);

  await cleanup(sql);

  for (let matchAttempt = 0; matchAttempt < 4; matchAttempt++) {
    const openNow = await openSessionFor(deviceId);
    if (openNow) {
      await sql`delete from queue where device_id = ${deviceId}`;
      return { status: "matched", desk: await loadDesk(deviceId, clientIp) };
    }

    const meRows = await sql<QueueRow>`
      select device_id, interests, entered_at, last_beat
      from queue where device_id = ${deviceId}
    `;
    const me = meRows[0];
    if (!me) {
      let openAfterMe = await openSessionFor(deviceId);
      if (!openAfterMe) {
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((r) => setTimeout(r, 20));
          openAfterMe = await openSessionFor(deviceId);
          if (openAfterMe) break;
        }
      }
      if (openAfterMe) {
        await sql`delete from queue where device_id = ${deviceId}`;
        return { status: "matched", desk: await loadDesk(deviceId, clientIp) };
      }
      return { status: "idle", desk: await loadDesk(deviceId, clientIp) };
    }

    const myInterests = parseInterests(me.interests);

    const others = await sql<QueueRow>`
      select q.device_id, q.interests, q.entered_at, q.last_beat
      from queue q
      inner join stations s on s.device_id = q.device_id
      where q.device_id <> ${deviceId}
        and q.last_beat > now() - interval '30 seconds'
        and s.last_seen > now() - interval '45 seconds'
        and not exists (
          select 1 from sessions ses
          where ses.closed_at is null
            and (ses.a_id = q.device_id or ses.b_id = q.device_id)
        )
    `;

    let best: { row: QueueRow; shared: string[] } | null = null;
    for (const row of others) {
      if (blockedSet.has(row.device_id)) {
        continue;
      }
      const theirInterests = parseInterests(row.interests);

      if (myInterests.length === 0) {
        // Untagged client: can only match other untagged clients.
        // Prevent untagged clients from stealing tagged clients from the queue.
        if (theirInterests.length > 0) {
          continue;
        }
        const shared: string[] = [];
        if (!best || row.entered_at < best.row.entered_at) {
          best = { row, shared };
        }
      } else {
        // Tagged client: match immediately if strangers share >= 1 topic without broadening stalls.
        const shared = sharedInterests(myInterests, theirInterests);
        if (shared.length < 1) {
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
      let alreadyMatched = await openSessionFor(deviceId);
      if (!alreadyMatched && !removed.some((r) => r.device_id === deviceId)) {
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((r) => setTimeout(r, 20));
          alreadyMatched = await openSessionFor(deviceId);
          if (alreadyMatched) break;
        }
      }

      if (alreadyMatched) {
        await sql`delete from queue where device_id = ${deviceId}`;
        return {
          status: "matched",
          desk: await loadDesk(deviceId, clientIp),
        };
      }

      // Defensive restore: if we deleted best without deleting ourselves, restore best
      for (const r of removed) {
        if (r.device_id !== deviceId) {
          const targetRow = others.find((o) => o.device_id === r.device_id);
          if (targetRow) {
            const tPayload = JSON.stringify(parseInterests(targetRow.interests));
            await sql`
              insert into queue (device_id, interests, entered_at, last_beat)
              values (${targetRow.device_id}, ${tPayload}, ${targetRow.entered_at}, now())
              on conflict (device_id) do update set last_beat = now()
            `;
          }
        }
      }

      const payload = JSON.stringify(myInterests);
      await sql`
        insert into queue (device_id, interests, entered_at, last_beat)
        values (${deviceId}, ${payload}, ${me.entered_at}, now())
        on conflict (device_id) do update set last_beat = now()
      `;

      const desk = await loadDesk(deviceId, clientIp);
      if (desk.activeSession) {
        await sql`delete from queue where device_id = ${deviceId}`;
        return { status: "matched", desk };
      }

      continue;
    }

    const activeCheck = await sql<{ id: string }>`
      select id from sessions
      where closed_at is null
        and (a_id in (${deviceId}, ${best.row.device_id}) or b_id in (${deviceId}, ${best.row.device_id}))
      limit 1
    `;
    if (activeCheck.length > 0) {
      await sql`delete from queue where device_id = ${deviceId} or device_id = ${best.row.device_id}`;
      return { status: "matched", desk: await loadDesk(deviceId, clientIp) };
    }

    const sessionId = newId();
    const shared = JSON.stringify(best.shared);
    await sql`
      insert into sessions (id, a_id, b_id, kind, interests)
      values (${sessionId}, ${deviceId}, ${best.row.device_id}, 'stranger', ${shared})
    `;
    await sql`
      delete from queue
      where device_id = ${deviceId} or device_id = ${best.row.device_id}
    `;

    const deskA = await loadDesk(deviceId, clientIp);
    const deskB = await loadDesk(best.row.device_id);
    emitToDevice(deviceId, "session_started", { sessionId, desk: deskA });
    emitToDevice(best.row.device_id, "session_started", { sessionId, desk: deskB });

    return { status: "matched", desk: deskA };
  }

  return {
    status: "waiting",
    desk: await loadDesk(deviceId, clientIp),
  };
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
  const interests = sanitizeInterests(input.interests);

  await cleanup();

  const sql = await getSql();
  const existing = await openSessionFor(deviceId);
  if (existing) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs < 4000) {
      // Just matched within last 4s - do not destroy the fresh match
      await sql`delete from queue where device_id = ${deviceId}`;
      return { status: "matched", desk: await loadDesk(deviceId, input.clientIp) };
    }

    const ended = await endSessionOnce(sql, existing);
    if (ended) {
      const peerId = peerOf(existing, deviceId);
      emitToDevice(peerId, "session_ended", {
        sessionId: existing.id,
        desk: await loadDesk(peerId),
      });
    }
  }

  await touchStation(deviceId, input.clientIp, input.publicKey);

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
  const ended = await endSessionOnce(sql, session);
  await sql`
    delete from queue
    where (device_id = ${deviceId} or device_id = ${peerId})
      and entered_at <= ${session.created_at}
  `;
  const desk = await loadDesk(deviceId);
  if (ended) {
    const peerDesk = await loadDesk(peerId);
    emitToDevice(peerId, "session_ended", { sessionId: session.id, desk: peerDesk });
  }
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
  clientMsgId?: string;
}): Promise<MessagesPack> {
  const deviceId = requireDeviceId(input.deviceId);
  const rateCheck = checkMessageRateLimit(deviceId);
  if (!rateCheck.allowed) {
    throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(rateCheck.retryAfterMs / 1000)}s.`);
  }

  const body = requireText(input.body, MAX_LINE_CHARS);
  const sql = await getSql();

  if (!body.startsWith("e2e:")) {
    const safety = evaluateSafety(body);
    if (!safety.allowed) {
      throw new Error(`Message blocked: ${safety.reason}`);
    }
  }

  // 1 query to fetch session and station metadata (callsigns, public keys, presence, is_away)
  const rows = await sql<SessionWithStationsRow>`
    select
      s.id,
      s.a_id,
      s.b_id,
      s.kind,
      s.interests,
      s.created_at,
      s.closed_at,
      sa.callsign as a_callsign,
      sa.public_key as a_public_key,
      sa.is_away as a_is_away,
      sa.last_seen as a_last_seen,
      sa.typing_until as a_typing_until,
      sb.callsign as b_callsign,
      sb.public_key as b_public_key,
      sb.is_away as b_is_away,
      sb.last_seen as b_last_seen,
      sb.typing_until as b_typing_until
    from sessions s
    left join stations sa on sa.device_id = s.a_id
    left join stations sb on sb.device_id = s.b_id
    where s.id = ${input.sessionId}
      and (s.a_id = ${deviceId} or s.b_id = ${deviceId})
  `;
  const row = rows[0];
  if (!row) {
    return {
      session: {
        id: input.sessionId,
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

  const isA = row.a_id === deviceId;
  const peerId = isA ? row.b_id : row.a_id;
  const senderCallsign = (isA ? row.a_callsign : row.b_callsign) ?? "----";
  const peerCallsign = (isA ? row.b_callsign : row.a_callsign) ?? "----";
  const senderPublicKey = (isA ? row.a_public_key : row.b_public_key) ?? undefined;
  const peerPublicKey = (isA ? row.b_public_key : row.a_public_key) ?? undefined;

  if (row.closed_at) {
    return {
      session: {
        id: row.id,
        kind: row.kind,
        peerId,
        peerCallsign,
        peerPublicKey,
        interests: parseInterests(row.interests),
        createdAt: asIso(row.created_at),
        closed: true,
        outboundQsl: null,
        inboundQsl: null,
        alreadyFriends: row.kind === "friend",
        peerTyping: false,
        peerPresence: "disconnected",
        peerIsAway: true,
      },
      messages: [],
    };
  }

  // 1 query to insert message RETURNING id, created_at, expires_at
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

  const nowMs = Date.now();
  const sessionAgeMs = nowMs - new Date(row.created_at).getTime();
  const isFreshSession = sessionAgeMs < 15000;

  const peerLastSeenRaw = isA ? row.b_last_seen : row.a_last_seen;
  const peerTypingUntilRaw = isA ? row.b_typing_until : row.a_typing_until;
  const peerIsAwayRaw = isA ? row.b_is_away : row.a_is_away;

  const senderLastSeenRaw = isA ? row.a_last_seen : row.b_last_seen;
  const senderTypingUntilRaw = isA ? row.a_typing_until : row.b_typing_until;
  const senderIsAwayRaw = isA ? row.a_is_away : row.b_is_away;

  // Peer presence for sender's view
  const peerLastSeenMs = peerLastSeenRaw ? new Date(peerLastSeenRaw).getTime() : 0;
  const peerLastSeen = peerLastSeenRaw ? asIso(peerLastSeenRaw) : undefined;
  const peerTyping = Boolean(
    peerTypingUntilRaw && new Date(peerTypingUntilRaw).getTime() > nowMs,
  );
  const peerRecentlySeen = peerLastSeenMs > 0 && nowMs - peerLastSeenMs < 45000;
  const peerOnline = isDeviceConnected(peerId) || peerRecentlySeen || isFreshSession;
  const peerIsAway = !isFreshSession && (Boolean(peerIsAwayRaw) || !peerOnline);
  const peerPresence: "active" | "away" | "disconnected" = peerIsAway ? "away" : "active";

  // Sender presence for peer's view
  const senderLastSeenMs = senderLastSeenRaw ? new Date(senderLastSeenRaw).getTime() : 0;
  const senderLastSeen = senderLastSeenRaw ? asIso(senderLastSeenRaw) : undefined;
  const senderTyping = Boolean(
    senderTypingUntilRaw && new Date(senderTypingUntilRaw).getTime() > nowMs,
  );
  const senderRecentlySeen = senderLastSeenMs > 0 && nowMs - senderLastSeenMs < 45000;
  const senderOnline = isDeviceConnected(deviceId) || senderRecentlySeen || isFreshSession;
  const senderIsAway = !isFreshSession && (Boolean(senderIsAwayRaw) || !senderOnline);
  const senderPresence: "active" | "away" | "disconnected" = senderIsAway ? "away" : "active";

  const interests = parseInterests(row.interests);

  const mySessionView: SessionView = {
    id: row.id,
    kind: row.kind,
    peerId,
    peerCallsign,
    peerPublicKey,
    interests,
    createdAt: asIso(row.created_at),
    closed: false,
    outboundQsl: null,
    inboundQsl: null,
    alreadyFriends: row.kind === "friend",
    peerTyping,
    peerLastSeen,
    peerPresence,
    peerIsAway,
  };

  const peerSessionView: SessionView = {
    id: row.id,
    kind: row.kind,
    peerId: deviceId,
    peerCallsign: senderCallsign,
    peerPublicKey: senderPublicKey,
    interests,
    createdAt: asIso(row.created_at),
    closed: false,
    outboundQsl: null,
    inboundQsl: null,
    alreadyFriends: row.kind === "friend",
    peerTyping: senderTyping,
    peerLastSeen: senderLastSeen,
    peerPresence: senderPresence,
    peerIsAway: senderIsAway,
  };

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
  const cleaned = input.text.trim().slice(0, 280);
  if (!cleaned) {
    return { ok: false, error: "Letter cannot be empty." };
  }

  const safety = evaluateSafety(cleaned, true);
  if (!safety.allowed) {
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
  const reason = requireText(input.reason, 200);
  const sql = await getSql();

  // Privacy-respecting abuse reporting: stores only reporter, target, and category reason
  // Never stores message content, plaintext, or encryption keys
  await sql`
    insert into abuse_reports (id, reporter_id, reported_id, reason)
    values (${newId()}, ${deviceId}, ${targetId}, ${reason})
  `;

  // Automatically enforce server-side block so they cannot be matched again
  await sql`
    insert into blocks (blocker_id, blocked_id)
    values (${deviceId}, ${targetId})
    on conflict do nothing
  `;
  return { ok: true };
}
