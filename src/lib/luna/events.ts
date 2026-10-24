import { getSql } from "./db";

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

export async function isDeviceOnline(deviceId: string, thresholdSeconds = 45): Promise<boolean> {
  if (isDeviceConnected(deviceId)) return true;
  try {
    const sql = await getSql();
    const rows = await sql<{ online: boolean }>`
      select (last_seen > now() - (${thresholdSeconds} || ' seconds')::interval) as online
      from stations
      where device_id = ${deviceId}
    `;
    return Boolean(rows[0]?.online);
  } catch {
    return false;
  }
}

export function emitToDevice<T = unknown>(deviceId: string, type: LunaEventType, data: T): void {
  const event: LunaEvent<T> = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  const listeners = deviceListeners.get(deviceId);
  if (listeners && listeners.size > 0) {
    for (const listener of listeners) {
      try {
        listener(event as LunaEvent);
      } catch {}
    }
  }

  void (async () => {
    try {
      const sql = await getSql();
      const serialized = JSON.stringify(data);
      await sql`
        insert into device_events (device_id, type, data, instance_id, created_at)
        values (${deviceId}, ${type}, ${serialized}, ${SERVER_INSTANCE_ID}, now())
      `;
    } catch {}
  })();
}
