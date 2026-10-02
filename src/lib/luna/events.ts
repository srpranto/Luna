export type LunaEventType =
  | "desk_update"
  | "message"
  | "typing"
  | "session_started"
  | "session_ended"
  | "friend_request"
  | "banned"
  | "peer_banned"
  | "ping";

export interface LunaEvent<T = unknown> {
  type: LunaEventType;
  data: T;
  timestamp: string;
}

type Listener = (event: LunaEvent) => void;

declare global {
  var __lunaDeviceListeners: Map<string, Set<Listener>> | undefined;
}

if (!globalThis.__lunaDeviceListeners) {
  globalThis.__lunaDeviceListeners = new Map<string, Set<Listener>>();
}

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

export function emitToDevice<T = unknown>(deviceId: string, type: LunaEventType, data: T): void {
  const listeners = deviceListeners.get(deviceId);
  if (!listeners || listeners.size === 0) return;

  const event: LunaEvent<T> = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const listener of listeners) {
    try {
      listener(event as LunaEvent);
    } catch {
      return;
    }
  }
}
