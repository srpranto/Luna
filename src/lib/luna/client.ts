import type { DeskView, MessagesPack, QueueHeartbeatResult, VoidLetter } from "./types";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiFailure {
  ok: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

async function request<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/luna", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.ok) {
    throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
  }
  return json.data;
}

const rpc = <TResult, TPayload extends Record<string, unknown> = Record<string, unknown>>(action: string) =>
  (data: TPayload): Promise<TResult> => request<TResult>(action, data);

export const registerStation = rpc<DeskView, { deviceId: string; publicKey?: string }>("registerStation");
export const getDesk = rpc<DeskView, { deviceId: string; publicKey?: string }>("getDesk");
export const joinQueue = rpc<QueueHeartbeatResult, { deviceId: string; interests: string[]; blockedIds?: string[]; publicKey?: string }>("joinQueue");
export const leaveQueue = rpc<DeskView, { deviceId: string }>("leaveQueue");
export const heartbeatQueue = rpc<QueueHeartbeatResult, { deviceId: string; blockedIds?: string[] }>("heartbeatQueue");
export const reportTyping = rpc<{ ok: boolean }, { deviceId: string; sessionId: string; isTyping: boolean }>("reportTyping");
export const openFriendLine = rpc<DeskView, { deviceId: string; friendId: string }>("openFriendLine");
export const leaveSession = rpc<DeskView, { deviceId: string; sessionId: string }>("leaveSession");
export const listMessages = rpc<MessagesPack, { deviceId: string; sessionId: string }>("listMessages");
export const sendMessage = rpc<MessagesPack, { deviceId: string; sessionId: string; body: string }>("sendMessage");
export const editMessage = rpc<MessagesPack, { deviceId: string; sessionId: string; messageId: string; body: string }>("editMessage");
export const deleteMessage = rpc<{ ok: boolean; messageId: string }, { deviceId: string; sessionId: string; messageId: string }>("deleteMessage");
export const reportPresence = rpc<{ ok: boolean }, { deviceId: string; sessionId?: string; isAway: boolean }>("reportPresence");
export const offerQsl = rpc<MessagesPack, { deviceId: string; sessionId: string }>("offerQsl");
export const respondQsl = rpc<DeskView, { deviceId: string; requestId: string; accept: boolean }>("respondQsl");
export const updateCallsign = rpc<DeskView, { deviceId: string; callsign: string }>("updateCallsign");
export const deleteStation = rpc<{ ok: boolean }, { deviceId: string }>("deleteStation");
export const listVoidLetters = (deviceId: string) => request<VoidLetter[]>("listVoidLetters", { deviceId });
export const castVoidLetter = rpc<{ ok: boolean; letter?: VoidLetter; error?: string }, { deviceId: string; text: string }>("castVoidLetter");
export const starVoidLetter = rpc<{ ok: boolean; stars: number; hasStarred: boolean }, { deviceId: string; letterId: string }>("starVoidLetter");

type StreamHandler = (eventType: string, data: unknown) => void;

const STREAM_EVENT_TYPES = [
  "message",
  "typing",
  "session_started",
  "session_ended",
  "desk_update",
  "friend_request",
  "presence_update",
  "message_edited",
  "message_deleted",
] as const;

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];

export function subscribeDeskStream(
  deviceId: string,
  onEvent: StreamHandler,
  onOpen?: () => void,
): () => void {
  if (typeof window === "undefined" || !("EventSource" in window)) {
    return () => {};
  }

  let source: EventSource | null = null;
  let retryTimer: number | null = null;
  let attempt = 0;
  let stopped = false;

  const scheduleReconnect = () => {
    if (stopped || retryTimer !== null) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10000;
    attempt += 1;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;
    source?.close();
    const next = new EventSource(`/api/luna/stream?deviceId=${encodeURIComponent(deviceId)}`);
    source = next;

    next.addEventListener("open", () => {
      attempt = 0;
      onOpen?.();
    });

    next.addEventListener("error", () => {
      if (next.readyState === EventSource.CLOSED) {
        scheduleReconnect();
      }
    });

    for (const type of STREAM_EVENT_TYPES) {
      next.addEventListener(type, (e: MessageEvent) => {
        try {
          onEvent(type, JSON.parse(e.data));
        } catch {
          return;
        }
      });
    }
  };

  const revive = () => {
    if (!stopped && (!source || source.readyState === EventSource.CLOSED)) {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      attempt = 0;
      connect();
    }
  };

  const onVisible = () => {
    if (!document.hidden) revive();
  };

  window.addEventListener("online", revive);
  document.addEventListener("visibilitychange", onVisible);
  connect();

  return () => {
    stopped = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    window.removeEventListener("online", revive);
    document.removeEventListener("visibilitychange", onVisible);
    source?.close();
  };
}
