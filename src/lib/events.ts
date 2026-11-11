import { getSql } from "./database";
import type { DeskView, MessagesPack, SessionView } from "./types";
import { isRedisConfigured, redisPublish } from "./redis";

export interface LunaEventDataMap {
  desk_update: DeskView;
  message: MessagesPack;
  message_edited: { sessionId: string; messageId: string; body: string; editedAt: string };
  message_deleted: { sessionId: string; messageId: string };
  messages_seen: { sessionId: string; seenAt: string };
  reconnect_requested: { sessionId: string; fromCallsign: string; session: SessionView };
  presence_update: { sessionId: string; peerId: string; isAway: boolean };
  typing: { sessionId: string; isTyping: boolean };
  session_started: { sessionId: string; desk?: DeskView };
  session_ended: { sessionId: string; desk?: DeskView };
  friend_request: DeskView;
  ping: string;
}

export type LunaEventType = keyof LunaEventDataMap;

export type LunaStreamEvent = {
  [K in keyof LunaEventDataMap]: {
    type: K;
    data: LunaEventDataMap[K];
    id?: number;
    timestamp?: string;
  };
}[keyof LunaEventDataMap];

export interface LunaEvent<T = unknown> {
  id?: number;
  type: LunaEventType;
  data: T;
  timestamp: string;
}

type Listener = (event: LunaEvent) => void;

declare global {
  var __lunaDeviceListeners: Map<string, Set<Listener>> | undefined;
  var __lunaInstanceId: string | undefined;
}

if (!globalThis.__lunaDeviceListeners) {
  globalThis.__lunaDeviceListeners = new Map<string, Set<Listener>>();
}

if (!globalThis.__lunaInstanceId) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    globalThis.__lunaInstanceId = crypto.randomUUID();
  } else if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    globalThis.__lunaInstanceId = `inst-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  } else {
    globalThis.__lunaInstanceId = `inst-${Date.now()}`;
  }
}

const SERVER_INSTANCE_ID = globalThis.__lunaInstanceId;
const deviceListeners = globalThis.__lunaDeviceListeners;

export function subscribeDevice(deviceId: string, listener: Listener): () => void {
  let listeners = deviceListeners.get(deviceId);
  if (!listeners) {
    listeners = new Set();
    deviceListeners.set(deviceId, listeners);
  }
  listeners.add(listener);

  return () => {
    const set = deviceListeners.get(deviceId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        deviceListeners.delete(deviceId);
      }
    }
  };
}

export function isDeviceConnected(deviceId: string): boolean {
  const listeners = deviceListeners.get(deviceId);
  return Boolean(listeners && listeners.size > 0);
}

export function emitToDevice<K extends keyof LunaEventDataMap>(
  deviceId: string,
  type: K,
  data: LunaEventDataMap[K],
): void;
export function emitToDevice(
  deviceId: string,
  type: LunaEventType,
  data: unknown,
): void {
  void (async () => {
    let eventId: number | undefined;
    try {
      const sql = await getSql();
      const serialized = JSON.stringify(data);
      const rows = await sql<{ id: number }>`
        insert into device_events (device_id, type, data, instance_id, created_at)
        values (${deviceId}, ${type}, ${serialized}, ${SERVER_INSTANCE_ID}, now())
        returning id
      `;
      if (rows[0]?.id) {
        eventId = Number(rows[0].id);
      }
    } catch (err) {
      console.error("[Luna Event Persistence Error]", {
        deviceId,
        type,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const event: LunaEvent<unknown> = {
      id: eventId,
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    // Optional Redis Fanout for multi-instance Vercel deployments
    if (isRedisConfigured()) {
      void redisPublish(`luna:device:${deviceId}`, JSON.stringify(event));
    }

    const listeners = deviceListeners.get(deviceId);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error("[Luna Event Listener Error]", {
            deviceId,
            type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  })();
}
