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
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.ok) {
    const message = "error" in json ? json.error : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return json.data;
}

export function registerStation(data: { deviceId: string; publicKey?: string }): Promise<DeskView> {
  return request<DeskView>("registerStation", data);
}

export function getDesk(data: { deviceId: string; publicKey?: string }): Promise<DeskView> {
  return request<DeskView>("getDesk", data);
}

export function joinQueue(data: {
  deviceId: string;
  interests: string[];
  blockedIds?: string[];
  publicKey?: string;
}): Promise<QueueHeartbeatResult> {
  return request<QueueHeartbeatResult>("joinQueue", data);
}

export function leaveQueue(data: { deviceId: string }): Promise<DeskView> {
  return request<DeskView>("leaveQueue", data);
}

export function heartbeatQueue(data: {
  deviceId: string;
  blockedIds?: string[];
}): Promise<QueueHeartbeatResult> {
  return request<QueueHeartbeatResult>("heartbeatQueue", data);
}

export function reportTyping(data: {
  deviceId: string;
  sessionId: string;
  isTyping: boolean;
}): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("reportTyping", data);
}

export function openFriendLine(data: { deviceId: string; friendId: string }): Promise<DeskView> {
  return request<DeskView>("openFriendLine", data);
}

export function leaveSession(data: { deviceId: string; sessionId: string }): Promise<DeskView> {
  return request<DeskView>("leaveSession", data);
}

export function listMessages(data: { deviceId: string; sessionId: string }): Promise<MessagesPack> {
  return request<MessagesPack>("listMessages", data);
}

export function sendMessage(data: {
  deviceId: string;
  sessionId: string;
  body: string;
}): Promise<MessagesPack> {
  return request<MessagesPack>("sendMessage", data);
}

export function editMessage(data: {
  deviceId: string;
  sessionId: string;
  messageId: string;
  body: string;
}): Promise<MessagesPack> {
  return request<MessagesPack>("editMessage", data);
}

export function deleteMessage(data: {
  deviceId: string;
  sessionId: string;
  messageId: string;
}): Promise<{ ok: boolean; messageId: string }> {
  return request<{ ok: boolean; messageId: string }>("deleteMessage", data);
}

export function reportPresence(data: {
  deviceId: string;
  sessionId?: string;
  isAway: boolean;
}): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("reportPresence", data);
}

export function offerQsl(data: { deviceId: string; sessionId: string }): Promise<MessagesPack> {
  return request<MessagesPack>("offerQsl", data);
}

export function respondQsl(data: {
  deviceId: string;
  requestId: string;
  accept: boolean;
}): Promise<DeskView> {
  return request<DeskView>("respondQsl", data);
}

export function updateCallsign(data: { deviceId: string; callsign: string }): Promise<DeskView> {
  return request<DeskView>("updateCallsign", data);
}

export function deleteStation(data: { deviceId: string }): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("deleteStation", data);
}

export function recordMSpam(data: {
  deviceId: string;
  sessionId: string;
}): Promise<{ banned: boolean; count: number }> {
  return request<{ banned: boolean; count: number }>("recordMSpam", data);
}

export function reportViolation(data: {
  deviceId: string;
  peerId?: string;
  sessionId?: string;
  violation: string;
  sample?: string;
}): Promise<{ ok: boolean; banned: boolean }> {
  return request<{ ok: boolean; banned: boolean }>("reportViolation", data);
}

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
  "banned",
  "peer_banned",
];

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
    if (stopped || retryTimer !== null) {
      return;
    }
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10000;
    attempt += 1;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) {
      return;
    }
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
    if (!document.hidden) {
      revive();
    }
  };

  window.addEventListener("online", revive);
  document.addEventListener("visibilitychange", onVisible);
  connect();

  return () => {
    stopped = true;
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
    }
    window.removeEventListener("online", revive);
    document.removeEventListener("visibilitychange", onVisible);
    source?.close();
  };
}

export function listVoidLetters(deviceId: string): Promise<VoidLetter[]> {
  return request<VoidLetter[]>("listVoidLetters", { deviceId });
}

export function castVoidLetter(data: {
  deviceId: string;
  text: string;
}): Promise<{ ok: boolean; letter?: VoidLetter; error?: string }> {
  return request<{ ok: boolean; letter?: VoidLetter; error?: string }>("castVoidLetter", data);
}

export function starVoidLetter(data: {
  deviceId: string;
  letterId: string;
}): Promise<{ ok: boolean; stars: number; hasStarred: boolean }> {
  return request<{ ok: boolean; stars: number; hasStarred: boolean }>("starVoidLetter", data);
}
