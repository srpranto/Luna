import { getSql } from "./database";

export type LunaEventType =
  | "desk_update"
  | "message"
  | "message_edited"
  | "message_deleted"
  | "messages_seen"
  | "reconnect_requested"
  | "presence_update"
  | "typing"
  | "session_started"
  | "session_ended"
  | "friend_request"
  | "ping";

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

export function emitToDevice<T = unknown>(deviceId: string, type: LunaEventType, data: T): void {
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

    const event: LunaEvent<T> = {
      id: eventId,
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    const listeners = deviceListeners.get(deviceId);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        try {
          listener(event as LunaEvent);
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
