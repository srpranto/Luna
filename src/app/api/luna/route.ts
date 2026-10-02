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
  recordMSpamSession,
  reportViolationRpc,
  listVoidLetters,
  castVoidLetter,
  starVoidLetter,
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
  peerId?: string;
  violation?: string;
  sample?: string;
  text?: string;
  letterId?: string;
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cfConnectingIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) return cfConnectingIp;
  return "127.0.0.1";
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as RequestBody;
    const { action, deviceId } = payload;
    const clientIp = extractClientIp(req);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "Missing deviceId." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    let data: unknown;

    switch (action) {
      case "registerStation":
        data = await registerStation({ deviceId, clientIp, publicKey: payload.publicKey });
        break;

      case "getDesk":
        data = await getDesk({ deviceId, clientIp, publicKey: payload.publicKey });
        break;

      case "joinQueue":
        data = await joinQueue({
          deviceId,
          interests: payload.interests ?? [],
          blockedIds: payload.blockedIds ?? [],
          clientIp,
          publicKey: payload.publicKey,
        });
        break;

      case "leaveQueue":
        data = await leaveQueue({ deviceId });
        break;

      case "heartbeatQueue":
        data = await heartbeatQueue({
          deviceId,
          blockedIds: payload.blockedIds ?? [],
          clientIp,
        });
        break;

      case "reportTyping":
        if (!payload.sessionId) {
          throw new Error("Missing sessionId.");
        }
        data = await reportTyping({
          deviceId,
          sessionId: payload.sessionId,
          isTyping: Boolean(payload.isTyping),
        });
        break;

      case "openFriendLine":
        if (!payload.friendId) {
          throw new Error("Missing friendId.");
        }
        data = await openFriendLine({
          deviceId,
          friendId: payload.friendId,
        });
        break;

      case "leaveSession":
        if (!payload.sessionId) {
          throw new Error("Missing sessionId.");
        }
        data = await leaveSession({
          deviceId,
          sessionId: payload.sessionId,
        });
        break;

      case "listMessages":
        if (!payload.sessionId) {
          throw new Error("Missing sessionId.");
        }
        data = await listMessages({
          deviceId,
          sessionId: payload.sessionId,
        });
        break;

      case "sendMessage":
        if (!payload.sessionId || typeof payload.body !== "string") {
          throw new Error("Missing sessionId or message body.");
        }
        data = await sendMessage({
          deviceId,
          sessionId: payload.sessionId,
          body: payload.body,
        });
        break;

      case "editMessage":
        if (!payload.sessionId || !payload.messageId || typeof payload.body !== "string") {
          throw new Error("Missing sessionId, messageId, or message body.");
        }
        data = await editMessage({
          deviceId,
          sessionId: payload.sessionId,
          messageId: payload.messageId,
          body: payload.body,
        });
        break;

      case "deleteMessage":
        if (!payload.sessionId || !payload.messageId) {
          throw new Error("Missing sessionId or messageId.");
        }
        data = await deleteMessage({
          deviceId,
          sessionId: payload.sessionId,
          messageId: payload.messageId,
        });
        break;

      case "reportPresence":
        data = await reportPresence({
          deviceId,
          sessionId: payload.sessionId,
          isAway: Boolean(payload.isAway),
        });
        break;

      case "offerQsl":
        if (!payload.sessionId) {
          throw new Error("Missing sessionId.");
        }
        data = await offerQsl({
          deviceId,
          sessionId: payload.sessionId,
        });
        break;

      case "respondQsl":
        if (!payload.requestId || typeof payload.accept !== "boolean") {
          throw new Error("Missing requestId or accept decision.");
        }
        data = await respondQsl({
          deviceId,
          requestId: payload.requestId,
          accept: payload.accept,
        });
        break;

      case "updateCallsign":
        if (typeof payload.callsign !== "string") {
          throw new Error("Missing callsign.");
        }
        data = await updateCallsign({
          deviceId,
          callsign: payload.callsign,
        });
        break;

      case "deleteStation":
        data = await deleteStation({ deviceId });
        break;

      case "recordMSpam":
        if (!payload.sessionId) {
          throw new Error("Missing sessionId.");
        }
        data = await recordMSpamSession(deviceId, clientIp, payload.sessionId);
        break;

      case "reportViolation":
        if (!payload.violation) {
          throw new Error("Missing violation.");
        }
        data = await reportViolationRpc({
          deviceId,
          peerId: payload.peerId,
          sessionId: payload.sessionId,
          violation: payload.violation,
          sample: payload.sample,
          clientIp,
        });
        break;

      case "listVoidLetters":
        data = await listVoidLetters(deviceId);
        break;

      case "castVoidLetter":
        if (!payload.text) {
          throw new Error("Missing letter text.");
        }
        data = await castVoidLetter({
          deviceId,
          text: payload.text,
          ip: clientIp,
        });
        break;

      case "starVoidLetter":
        if (!payload.letterId) {
          throw new Error("Missing letterId.");
        }
        data = await starVoidLetter({
          deviceId,
          letterId: payload.letterId,
        });
        break;

      default:
        return NextResponse.json(
          { ok: false, error: "Unknown action." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
    }

    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "Internal server error.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
