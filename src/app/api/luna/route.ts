import { NextResponse } from "next/server";
import {
  getDesk,
  heartbeatQueue,
  joinQueue,
  leaveQueue,
  leaveSession,
  listMessages,
  offerQsl,
  openFriendLine,
  registerStation,
  reportTyping,
  respondQsl,
  sendMessage,
  editMessage,
  deleteMessage,
  reportPresence,
  updateCallsign,
  deleteStation,
  listVoidLetters,
  castVoidLetter,
  starVoidLetter,
  blockUser,
  reportUser,
} from "@/lib/luna/server";

export const dynamic = "force-dynamic";

interface RequestBody {
  action?: string;
  deviceId?: string;
  sessionId?: string;
  messageId?: string;
  friendId?: string;
  requestId?: string;
  accept?: boolean;
  body?: string;
  interests?: string[];
  blockedIds?: string[];
  isTyping?: boolean;
  isAway?: boolean;
  callsign?: string;
  publicKey?: string;
  text?: string;
  letterId?: string;
  clientMsgId?: string;
  targetId?: string;
  reason?: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitBucket>();

function checkRateLimit(key: string, limit = 180, windowMs = 60000): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    if (rateLimitMap.size > 10000) {
      for (const [k, v] of rateLimitMap) {
        if (now > v.resetAt) rateLimitMap.delete(k);
      }
    }
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "127.0.0.1"
  );
}

function requireFields<T extends RequestBody>(payload: T, ...fields: (keyof T)[]): void {
  for (const field of fields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      throw new Error(`Missing ${String(field)}.`);
    }
  }
}

type ActionHandler = (payload: RequestBody, clientIp: string) => Promise<unknown>;

const actionHandlers: Record<string, ActionHandler> = {
  registerStation: (p, ip) => registerStation({ deviceId: p.deviceId!, clientIp: ip, publicKey: p.publicKey }),
  getDesk: (p, ip) => getDesk({ deviceId: p.deviceId!, clientIp: ip, publicKey: p.publicKey }),
  joinQueue: (p, ip) =>
    joinQueue({
      deviceId: p.deviceId!,
      interests: p.interests ?? [],
      blockedIds: p.blockedIds ?? [],
      clientIp: ip,
      publicKey: p.publicKey,
    }),
  leaveQueue: (p) => leaveQueue({ deviceId: p.deviceId! }),
  heartbeatQueue: (p, ip) =>
    heartbeatQueue({ deviceId: p.deviceId!, blockedIds: p.blockedIds ?? [], clientIp: ip }),
  reportTyping: (p) => {
    requireFields(p, "sessionId");
    return reportTyping({ deviceId: p.deviceId!, sessionId: p.sessionId!, isTyping: Boolean(p.isTyping) });
  },
  openFriendLine: (p) => {
    requireFields(p, "friendId");
    return openFriendLine({ deviceId: p.deviceId!, friendId: p.friendId! });
  },
  leaveSession: (p) => {
    requireFields(p, "sessionId");
    return leaveSession({ deviceId: p.deviceId!, sessionId: p.sessionId! });
  },
  listMessages: (p) => {
    requireFields(p, "sessionId");
    return listMessages({ deviceId: p.deviceId!, sessionId: p.sessionId! });
  },
  sendMessage: (p) => {
    if (!p.sessionId || typeof p.body !== "string") throw new Error("Missing sessionId or message body.");
    return sendMessage({ deviceId: p.deviceId!, sessionId: p.sessionId, body: p.body, clientMsgId: p.clientMsgId });
  },
  editMessage: (p) => {
    if (!p.sessionId || !p.messageId || typeof p.body !== "string") {
      throw new Error("Missing sessionId, messageId, or message body.");
    }
    return editMessage({ deviceId: p.deviceId!, sessionId: p.sessionId, messageId: p.messageId, body: p.body });
  },
  deleteMessage: (p) => {
    requireFields(p, "sessionId", "messageId");
    return deleteMessage({ deviceId: p.deviceId!, sessionId: p.sessionId!, messageId: p.messageId! });
  },
  reportPresence: (p) =>
    reportPresence({ deviceId: p.deviceId!, sessionId: p.sessionId, isAway: Boolean(p.isAway) }),
  offerQsl: (p) => {
    requireFields(p, "sessionId");
    return offerQsl({ deviceId: p.deviceId!, sessionId: p.sessionId! });
  },
  respondQsl: (p) => {
    if (!p.requestId || typeof p.accept !== "boolean") throw new Error("Missing requestId or accept decision.");
    return respondQsl({ deviceId: p.deviceId!, requestId: p.requestId, accept: p.accept });
  },
  updateCallsign: (p) => {
    if (typeof p.callsign !== "string") throw new Error("Missing callsign.");
    return updateCallsign({ deviceId: p.deviceId!, callsign: p.callsign });
  },
  deleteStation: (p) => deleteStation({ deviceId: p.deviceId! }),
  listVoidLetters: (p) => listVoidLetters(p.deviceId!),
  castVoidLetter: (p, ip) => {
    requireFields(p, "text");
    return castVoidLetter({ deviceId: p.deviceId!, text: p.text!, ip });
  },
  starVoidLetter: (p) => {
    requireFields(p, "letterId");
    return starVoidLetter({ deviceId: p.deviceId!, letterId: p.letterId! });
  },
  blockUser: (p) => {
    requireFields(p, "targetId");
    return blockUser({ deviceId: p.deviceId!, targetId: p.targetId! });
  },
  reportUser: (p) => {
    requireFields(p, "targetId", "reason");
    return reportUser({ deviceId: p.deviceId!, targetId: p.targetId!, reason: p.reason! });
  },
};

const NO_CACHE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  try {
    const clientIp = extractClientIp(req);
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please slow down." },
        { status: 429, headers: { ...NO_CACHE_HEADERS, "Retry-After": "5" } },
      );
    }

    const payload = (await req.json()) as RequestBody;
    const { action, deviceId } = payload;

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "Missing deviceId." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    if (payload.body && payload.body.length > 10000) {
      return NextResponse.json({ ok: false, error: "Message too long." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    if (payload.callsign && payload.callsign.length > 64) {
      return NextResponse.json({ ok: false, error: "Callsign too long." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    if (payload.text && payload.text.length > 5000) {
      return NextResponse.json({ ok: false, error: "Text too long." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const handler = action ? actionHandlers[action] : undefined;
    if (!handler) {
      return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const data = await handler(payload, clientIp);
    return NextResponse.json({ ok: true, data }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Internal server error.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: NO_CACHE_HEADERS });
  }
}
