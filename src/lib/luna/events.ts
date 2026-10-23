export type LunaEventType =
  | "desk_update"
  | "message"
  | "message_edited"
  | "message_deleted"
  | "presence_update"
  | "typing"
  | "session_started"
  | "session_ended"
  | "friend_request"
  | "ping";

export interface LunaEvent<T = unknown> {
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
  globalThis.__lunaInstanceId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `inst-${Math.random().toString(36).slice(2, 10)}`;
}

export const SERVER_INSTANCE_ID = globalThis.__lunaInstanceId;
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
  const event: LunaEvent<T> = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  // 1. Deliver to local in-process listeners immediately for 0ms latency
  const listeners = deviceListeners.get(deviceId);
  if (listeners && listeners.size > 0) {
    for (const listener of listeners) {
      try {
        listener(event as LunaEvent);
      } catch {
        // Safe dispatch
      }
    }
  }

  // 2. Persist to shared database transport for cross-instance delivery
  void (async () => {
    try {
      const { getSql } = await import("./db");
      const sql = await getSql();
      const serialized = JSON.stringify(data);
      await sql`
        insert into device_events (device_id, type, data, instance_id, created_at)
        values (${deviceId}, ${type}, ${serialized}, ${SERVER_INSTANCE_ID}, now())
      `;
    } catch {
      // Ignored for non-db or transient environments
    }
  })();
}
