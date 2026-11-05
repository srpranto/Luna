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
  requestReconnect,
  markMessagesSeen,
  verifyStationAuth,
} from "@/lib/chat-server";
import { isAppError, RateLimitError } from "@/lib/errors";
import type { DeskView, MessagesPack, QueueHeartbeatResult, VoidLetter } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface ChatActionMap {
  registerStation: { params: { deviceId: string; publicKey?: string; deviceSecret?: string }; result: DeskView };
  getDesk: { params: { deviceId: string; publicKey?: string; deviceSecret?: string }; result: DeskView };
  joinQueue: {
    params: {
      deviceId: string;
      interests?: string[];
      blockedIds?: string[];
      recentPeerIds?: string[];
      publicKey?: string;
      sessionId?: string;
      deviceSecret?: string;
    };
    result: QueueHeartbeatResult;
  };
  leaveQueue: { params: { deviceId: string; deviceSecret?: string }; result: DeskView };
  heartbeatQueue: {
    params: {
      deviceId: string;
      blockedIds?: string[];
      recentPeerIds?: string[];
      deviceSecret?: string;
    };
    result: QueueHeartbeatResult;
  };
  requestReconnect: { params: { deviceId: string; sessionId: string; deviceSecret?: string }; result: DeskView };
  reportTyping: {
    params: { deviceId: string; sessionId: string; isTyping: boolean; deviceSecret?: string };
    result: { ok: boolean };
  };
  openFriendLine: { params: { deviceId: string; friendId: string; deviceSecret?: string }; result: DeskView };
  leaveSession: { params: { deviceId: string; sessionId: string; deviceSecret?: string }; result: DeskView };
  listMessages: {
    params: { deviceId: string; sessionId: string; markSeen?: boolean; deviceSecret?: string };
    result: MessagesPack;
  };
  markSeen: { params: { deviceId: string; sessionId: string; deviceSecret?: string }; result: { ok: boolean } };
  sendMessage: {
    params: {
      deviceId: string;
      sessionId: string;
      body: string;
      clientMsgId?: string;
      isReaction?: boolean;
      deviceSecret?: string;
    };
    result: MessagesPack;
  };
  editMessage: {
    params: { deviceId: string; sessionId: string; messageId: string; body: string; deviceSecret?: string };
    result: MessagesPack;
  };
  deleteMessage: {
    params: { deviceId: string; sessionId: string; messageId: string; deviceSecret?: string };
    result: { ok: boolean; messageId: string };
  };
  reportPresence: {
    params: { deviceId: string; sessionId?: string; isAway: boolean; deviceSecret?: string };
    result: { ok: boolean };
  };
  offerQsl: { params: { deviceId: string; sessionId: string; deviceSecret?: string }; result: MessagesPack };
  respondQsl: {
    params: { deviceId: string; requestId: string; accept: boolean; deviceSecret?: string };
    result: DeskView;
  };
  updateCallsign: { params: { deviceId: string; callsign: string; deviceSecret?: string }; result: DeskView };
  deleteStation: { params: { deviceId: string; deviceSecret?: string }; result: { ok: boolean } };
  listVoidLetters: { params: { deviceId: string; deviceSecret?: string }; result: VoidLetter[] };
  castVoidLetter: {
    params: { deviceId: string; text: string; deviceSecret?: string };
    result: { ok: boolean; letter?: VoidLetter; error?: string };
  };
  starVoidLetter: {
    params: { deviceId: string; letterId: string; deviceSecret?: string };
    result: { ok: boolean; stars: number; hasStarred: boolean };
  };
  blockUser: { params: { deviceId: string; targetId: string; deviceSecret?: string }; result: { ok: boolean } };
  reportUser: {
    params: { deviceId: string; targetId: string; reason: string; deviceSecret?: string };
    result: { ok: boolean };
  };
}

export type ChatActionName = keyof ChatActionMap;

export type ChatApiAction = {
  [K in ChatActionName]: { action: K } & ChatActionMap[K]["params"];
}[ChatActionName];

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
  // Only trust edge proxy headers when supplied by a verified deployment proxy
  if (process.env.VERCEL === "1") {
    const realIp = req.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
    const vercelForwarded = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    if (vercelForwarded) return vercelForwarded;
  }
  const forwarded = req.headers.get("x-forwarded-for");
  return (
    req.headers.get("x-real-ip")?.trim() ||
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "127.0.0.1"
  );
}

async function dispatchAction(action: ChatApiAction, clientIp: string): Promise<unknown> {
  switch (action.action) {
    case "registerStation":
      return registerStation({
        deviceId: action.deviceId,
        clientIp,
        publicKey: action.publicKey,
        deviceSecret: action.deviceSecret,
      });
    case "getDesk":
      return getDesk({
        deviceId: action.deviceId,
        clientIp,
        publicKey: action.publicKey,
        deviceSecret: action.deviceSecret,
      });
    case "joinQueue":
      return joinQueue({
        deviceId: action.deviceId,
        interests: action.interests ?? [],
        blockedIds: action.blockedIds ?? [],
        recentPeerIds: action.recentPeerIds ?? [],
        clientIp,
        publicKey: action.publicKey,
        leaveSessionId: action.sessionId,
      });
    case "leaveQueue":
      return leaveQueue({ deviceId: action.deviceId });
    case "heartbeatQueue":
      return heartbeatQueue({
        deviceId: action.deviceId,
        blockedIds: action.blockedIds ?? [],
        recentPeerIds: action.recentPeerIds ?? [],
        clientIp,
      });
    case "requestReconnect":
      return requestReconnect({ deviceId: action.deviceId, sessionId: action.sessionId });
    case "reportTyping":
      return reportTyping({ deviceId: action.deviceId, sessionId: action.sessionId, isTyping: Boolean(action.isTyping) });
    case "openFriendLine":
      return openFriendLine({ deviceId: action.deviceId, friendId: action.friendId });
    case "leaveSession":
      return leaveSession({ deviceId: action.deviceId, sessionId: action.sessionId });
    case "listMessages":
      return listMessages({
        deviceId: action.deviceId,
        sessionId: action.sessionId,
        markSeen: action.markSeen !== undefined ? Boolean(action.markSeen) : undefined,
      });
    case "markSeen":
      return markMessagesSeen({ deviceId: action.deviceId, sessionId: action.sessionId });
    case "sendMessage":
      return sendMessage({
        deviceId: action.deviceId,
        sessionId: action.sessionId,
        body: action.body,
        clientMsgId: action.clientMsgId,
        isReaction: action.isReaction,
      });
    case "editMessage":
      return editMessage({
        deviceId: action.deviceId,
        sessionId: action.sessionId,
        messageId: action.messageId,
        body: action.body,
      });
    case "deleteMessage":
      return deleteMessage({
        deviceId: action.deviceId,
        sessionId: action.sessionId,
        messageId: action.messageId,
      });
    case "reportPresence":
      return reportPresence({
        deviceId: action.deviceId,
        sessionId: action.sessionId,
        isAway: Boolean(action.isAway),
      });
    case "offerQsl":
      return offerQsl({ deviceId: action.deviceId, sessionId: action.sessionId });
    case "respondQsl":
      return respondQsl({
        deviceId: action.deviceId,
        requestId: action.requestId,
        accept: action.accept,
      });
    case "updateCallsign":
      return updateCallsign({ deviceId: action.deviceId, callsign: action.callsign });
    case "deleteStation":
      return deleteStation({ deviceId: action.deviceId });
    case "listVoidLetters":
      return listVoidLetters(action.deviceId);
    case "castVoidLetter":
      return castVoidLetter({ deviceId: action.deviceId, text: action.text, ip: clientIp });
    case "starVoidLetter":
      return starVoidLetter({ deviceId: action.deviceId, letterId: action.letterId });
    case "blockUser":
      return blockUser({ deviceId: action.deviceId, targetId: action.targetId });
    case "reportUser":
      return reportUser({ deviceId: action.deviceId, targetId: action.targetId, reason: action.reason });
    default: {
      const _exhaustiveCheck: never = action;
      throw new Error(`Unknown action: ${JSON.stringify(_exhaustiveCheck)}`);
    }
  }
}

const NO_CACHE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  try {
    const clientIp = extractClientIp(req);
    const payload = (await req.json()) as Record<string, unknown>;
    const action = payload.action as string | undefined;
    const deviceId = payload.deviceId as string | undefined;
    const headerSecret = req.headers.get("x-luna-device-secret")?.trim() || undefined;
    const deviceSecret = (payload.deviceSecret as string | undefined) || headerSecret;
    payload.deviceSecret = deviceSecret;

    // 1. Enforce independent global IP rate limit (prevents deviceId rotation bypass)
    if (!checkRateLimit(`ip:${clientIp}`, 120, 60000)) {
      return NextResponse.json(
        { ok: false, error: "Too many requests from this network. Please slow down." },
        { status: 429, headers: { ...NO_CACHE_HEADERS, "Retry-After": "5" } },
      );
    }

    // 2. Enforce per-IP + per-device rate limit and direct device rate limit
    const rateKey = `${clientIp}:${deviceId ?? "anon"}`;
    if (!checkRateLimit(rateKey, 180, 60000)) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please slow down." },
        { status: 429, headers: { ...NO_CACHE_HEADERS, "Retry-After": "5" } },
      );
    }
    if (deviceId && !checkRateLimit(`dev:${deviceId}`, 180, 60000)) {
      return NextResponse.json(
        { ok: false, error: "Too many requests from this device. Please slow down." },
        { status: 429, headers: { ...NO_CACHE_HEADERS, "Retry-After": "5" } },
      );
    }

    // 3. Action-specific rate limits
    if (action === "sendMessage" && !checkRateLimit(`msg:${clientIp}:${deviceId}`, 45, 60000)) {
      return NextResponse.json(
        { ok: false, error: "Sending messages too fast. Please wait a moment." },
        { status: 429, headers: { ...NO_CACHE_HEADERS, "Retry-After": "3" } },
      );
    }
    if (action === "castVoidLetter" && !checkRateLimit(`letter:${clientIp}`, 8, 60000)) {
      return NextResponse.json(
        { ok: false, error: "Too many letters cast. Please wait before writing another." },
        { status: 429, headers: { ...NO_CACHE_HEADERS, "Retry-After": "15" } },
      );
    }
    if (action === "reportUser" && !checkRateLimit(`report:${clientIp}`, 5, 60000)) {
      return NextResponse.json(
        { ok: false, error: "Too many reports submitted." },
        { status: 429, headers: { ...NO_CACHE_HEADERS, "Retry-After": "30" } },
      );
    }

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "Missing deviceId." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    // 4. Verify cryptographic device ownership (prevents peerId impersonation)
    const isAuthorized = await verifyStationAuth(deviceId, deviceSecret, action);
    if (!isAuthorized) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized device operation. Secret mismatch." },
        { status: 401, headers: NO_CACHE_HEADERS },
      );
    }

    if (typeof payload.body === "string" && payload.body.length > 10000) {
      return NextResponse.json({ ok: false, error: "Message too long." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    if (typeof payload.callsign === "string" && payload.callsign.length > 64) {
      return NextResponse.json({ ok: false, error: "Callsign too long." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    if (typeof payload.text === "string" && payload.text.length > 5000) {
      return NextResponse.json({ ok: false, error: "Text too long." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    if (Array.isArray(payload.interests) && payload.interests.length > 20) {
      payload.interests = payload.interests.slice(0, 20);
    }
    if (Array.isArray(payload.blockedIds) && payload.blockedIds.length > 100) {
      payload.blockedIds = payload.blockedIds.slice(0, 100);
    }
    if (Array.isArray(payload.recentPeerIds) && payload.recentPeerIds.length > 50) {
      payload.recentPeerIds = payload.recentPeerIds.slice(0, 50);
    }

    // Required field validation per action
    switch (action) {
      case "sendMessage":
        if (!payload.sessionId || typeof payload.body !== "string") {
          return NextResponse.json({ ok: false, error: "Missing sessionId or message body." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "editMessage":
        if (!payload.sessionId || !payload.messageId || typeof payload.body !== "string") {
          return NextResponse.json({ ok: false, error: "Missing sessionId, messageId, or message body." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "deleteMessage":
        if (!payload.sessionId || !payload.messageId) {
          return NextResponse.json({ ok: false, error: "Missing sessionId or messageId." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "requestReconnect":
      case "reportTyping":
      case "leaveSession":
      case "listMessages":
      case "markSeen":
      case "offerQsl":
        if (!payload.sessionId) {
          return NextResponse.json({ ok: false, error: "Missing sessionId." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "openFriendLine":
        if (!payload.friendId) {
          return NextResponse.json({ ok: false, error: "Missing friendId." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "respondQsl":
        if (!payload.requestId || typeof payload.accept !== "boolean") {
          return NextResponse.json({ ok: false, error: "Missing requestId or accept decision." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "updateCallsign":
        if (typeof payload.callsign !== "string") {
          return NextResponse.json({ ok: false, error: "Missing callsign." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "castVoidLetter":
        if (typeof payload.text !== "string" || !payload.text.trim()) {
          return NextResponse.json({ ok: false, error: "Missing text." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "starVoidLetter":
        if (!payload.letterId) {
          return NextResponse.json({ ok: false, error: "Missing letterId." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "blockUser":
        if (!payload.targetId) {
          return NextResponse.json({ ok: false, error: "Missing targetId." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "reportUser":
        if (!payload.targetId || !payload.reason) {
          return NextResponse.json({ ok: false, error: "Missing targetId or reason." }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        break;
      case "registerStation":
      case "getDesk":
      case "joinQueue":
      case "leaveQueue":
      case "heartbeatQueue":
      case "reportPresence":
      case "deleteStation":
      case "listVoidLetters":
        break;
      default:
        return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const data = await dispatchAction(payload as unknown as ChatApiAction, clientIp);
    return NextResponse.json({ ok: true, data }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    if (isAppError(error)) {
      const headers =
        error instanceof RateLimitError
          ? { ...NO_CACHE_HEADERS, "Retry-After": String(error.retryAfterSeconds) }
          : NO_CACHE_HEADERS;

      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.statusCode, headers },
      );
    }

    const rawMessage = error instanceof Error && error.message ? error.message : "Internal server error.";
    const isInternalError =
      rawMessage.includes("ECONNREFUSED") ||
      rawMessage.includes("ETIMEDOUT") ||
      rawMessage.includes("relation") ||
      rawMessage.includes("syntax error") ||
      rawMessage.includes("connection failed") ||
      rawMessage.includes("socket hang up") ||
      rawMessage.includes("duplicate key") ||
      rawMessage.includes("violates") ||
      rawMessage.includes("constraint") ||
      rawMessage.includes("database") ||
      rawMessage.includes("PGlite") ||
      rawMessage.includes("Postgres") ||
      rawMessage.includes("column") ||
      (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string");

    const status = isInternalError ? 500 : 400;
    const sanitizedError = isInternalError
      ? "An unexpected server error occurred. Please try again."
      : rawMessage;

    return NextResponse.json({ ok: false, error: sanitizedError }, { status, headers: NO_CACHE_HEADERS });
  }
}
