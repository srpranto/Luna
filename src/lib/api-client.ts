import type { DeskView, MessagesPack, QueueHeartbeatResult, VoidLetter } from "./types";
import type { LunaStreamEvent } from "./events";
import { getOrCreateDeviceSecret } from "./identity";
import { ApiClientError } from "./errors";

export { ApiClientError };

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiFailure {
  ok: false;
  error: string;
  code?: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

let cachedStationToken: string | null = null;

export function getCachedStationToken(): string | null {
  if (cachedStationToken) return cachedStationToken;
  if (typeof window !== "undefined") {
    try {
      cachedStationToken = sessionStorage.getItem("luna.station_token") || localStorage.getItem("luna.station_token");
    } catch {}
  }
  return cachedStationToken;
}

export function setCachedStationToken(token: string | null): void {
  cachedStationToken = token;
  if (typeof window !== "undefined") {
    try {
      if (token) {
        sessionStorage.setItem("luna.station_token", token);
      } else {
        sessionStorage.removeItem("luna.station_token");
        localStorage.removeItem("luna.station_token");
      }
    } catch {}
  }
}

const IDEMPOTENT_ACTIONS = new Set(["getDesk", "listMessages", "listVoidLetters"]);

async function request<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const secret = getOrCreateDeviceSecret();
  const token = getCachedStationToken();
  const isIdempotent = IDEMPOTENT_ACTIONS.has(action);
  const maxAttempts = isIdempotent ? 2 : 1;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-luna-device-secret": secret,
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ action, deviceSecret: secret, stationToken: token || undefined, ...payload }),
        signal: AbortSignal.timeout(10000),
      });

      let json: ApiResponse<T> | null = null;
      try {
        json = (await res.json()) as ApiResponse<T>;
      } catch {
        throw new ApiClientError(`Server returned invalid response (HTTP ${res.status})`, res.status, "INVALID_RESPONSE");
      }
      if (!res.ok || !json || !json.ok) {
        const errorMsg = json && "error" in json ? json.error : `HTTP ${res.status}`;
        const errorCode = json && "code" in json ? json.code : "HTTP_ERROR";
        throw new ApiClientError(errorMsg, res.status, errorCode);
      }

      // Automatically capture fresh stationToken if returned in response
      if (json.data && typeof json.data === "object") {
        const dataObj = json.data as Record<string, unknown>;
        if (typeof dataObj.stationToken === "string") {
          setCachedStationToken(dataObj.stationToken);
        } else if (dataObj.desk && typeof (dataObj.desk as Record<string, unknown>).stationToken === "string") {
          setCachedStationToken((dataObj.desk as Record<string, unknown>).stationToken as string);
        }
      }

      return json.data;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  if (lastError instanceof ApiClientError) {
    throw lastError;
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const rpc = <TResult, TPayload extends Record<string, unknown> = Record<string, unknown>>(action: string) =>
  (data: TPayload): Promise<TResult> => request<TResult>(action, data);

export const registerStation = rpc<DeskView, { deviceId: string; publicKey?: string }>("registerStation");
export const getDesk = rpc<DeskView, { deviceId: string; publicKey?: string }>("getDesk");
export const joinQueue = rpc<QueueHeartbeatResult, { deviceId: string; interests: string[]; blockedIds?: string[]; recentPeerIds?: string[]; publicKey?: string; sessionId?: string }>("joinQueue");
export const leaveQueue = rpc<DeskView, { deviceId: string }>("leaveQueue");
export const heartbeatQueue = rpc<QueueHeartbeatResult, { deviceId: string; blockedIds?: string[]; recentPeerIds?: string[] }>("heartbeatQueue");
export const requestReconnect = rpc<DeskView, { deviceId: string; sessionId: string }>("requestReconnect");
export const reportTyping = rpc<{ ok: boolean }, { deviceId: string; sessionId: string; isTyping: boolean }>("reportTyping");
export const openFriendLine = rpc<DeskView, { deviceId: string; friendId: string }>("openFriendLine");
export const leaveSession = rpc<DeskView, { deviceId: string; sessionId: string }>("leaveSession");
export const listMessages = rpc<MessagesPack, { deviceId: string; sessionId: string; markSeen?: boolean }>("listMessages");
export const markSeen = rpc<{ ok: boolean }, { deviceId: string; sessionId: string }>("markSeen");
export const sendMessage = rpc<MessagesPack, { deviceId: string; sessionId: string; body: string; clientMsgId?: string; isReaction?: boolean }>("sendMessage");
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
export const blockUser = rpc<{ ok: boolean }, { deviceId: string; targetId: string }>("blockUser");
export const reportUser = rpc<{ ok: boolean }, { deviceId: string; targetId: string; reason: string }>("reportUser");

type StreamHandler = (event: LunaStreamEvent) => void;

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
  "messages_seen",
  "reconnect_requested",
  "ping",
] as const;

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
  let lastSeenEventId = 0;

  const scheduleReconnect = () => {
    if (stopped || retryTimer !== null) return;
    const baseDelay = Math.min(1000 * Math.pow(1.5, attempt), 15000);
    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.round(baseDelay + jitter);
    attempt += 1;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;
    source?.close();
    const cursorParam = lastSeenEventId > 0 ? `&lastEventId=${lastSeenEventId}` : "";
    const secret = getOrCreateDeviceSecret();
    const secretParam = secret ? `&secret=${encodeURIComponent(secret)}` : "";
    const token = getCachedStationToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
    const next = new EventSource(`/api/chat/stream?deviceId=${encodeURIComponent(deviceId)}${cursorParam}${secretParam}${tokenParam}`);
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
        if (e.lastEventId) {
          const idNum = Number(e.lastEventId);
          if (!Number.isNaN(idNum) && idNum > lastSeenEventId) {
            lastSeenEventId = idNum;
          }
        }
        try {
          const parsedData = JSON.parse(e.data);
          onEvent({
            type,
            data: parsedData,
            id: e.lastEventId ? Number(e.lastEventId) : undefined,
          } as LunaStreamEvent);
        } catch (parseErr) {
          console.warn(`[Luna Stream] Failed to parse event data for "${type}":`, parseErr);
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
