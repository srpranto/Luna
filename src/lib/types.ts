export type SessionKind = "stranger" | "friend";

export type QslStatus = "pending" | "accepted" | "declined";

export interface Station {
  deviceId: string;
  callsign: string;
  publicKey?: string;
}

export interface FriendRow {
  deviceId: string;
  callsign: string;
}

export interface QslRow {
  id: string;
  fromId: string;
  fromCallsign: string;
  toId: string;
  toCallsign: string;
  status: QslStatus;
}

export interface ChatMessage {
  id: string;
  fromId: string;
  fromCallsign: string;
  body: string;
  createdAt: string;
  expiresAt: string;
  mine: boolean;
  system?: boolean;
  copied: boolean;
  editedAt?: string;
  seenAt?: string;
  clientMsgId?: string;
  status?: "sending" | "sent" | "delivered" | "seen" | "failed";
}

export interface SessionView {
  id: string;
  kind: SessionKind;
  peerId: string;
  peerCallsign: string;
  peerPublicKey?: string;
  interests: string[];
  createdAt: string;
  closed: boolean;
  outboundQsl: QslStatus | null;
  inboundQsl: { id: string; status: QslStatus } | null;
  alreadyFriends: boolean;
  peerTyping: boolean;
  peerLastSeen?: string;
  peerPresence?: "active" | "away" | "disconnected";
  peerIsAway?: boolean;
  outboundReconnect?: boolean;
  inboundReconnect?: boolean;
}

export interface DeskView {
  station: Station;
  friends: FriendRow[];
  inboundQsl: QslRow[];
  activeSession: SessionView | null;
  queued: boolean;
  queuedInterests: string[];
  enteredAt: string | null;
  onlineCount?: number;
  activeQueueTopics?: string[];
  activeTopicStats?: TopicStat[];
  stationToken?: string;
}

export interface TopicStat {
  topic: string;
  count: number;
}

export interface QueueHeartbeatResult {
  status: "idle" | "waiting" | "matched";
  desk: DeskView;
}

export interface MessagesPack {
  session: SessionView;
  messages: ChatMessage[];
}

export interface VoidLetter {
  id: string;
  deviceId: string;
  callsign: string;
  text: string;
  stars: number;
  hasStarred?: boolean;
  createdAt: string;
}

export interface HistorySession {
  sessionId: string;
  peerCallsign: string;
  startedAt: number;
  savedAt: number;
  messageCount: number;
  preview: string;
  interests: string[];
  messages: ChatMessage[];
}

// =============================================================================
// Advanced TypeScript Utilities
// =============================================================================

export type DeepReadonly<T> = T extends (infer R)[]
  ? ReadonlyArray<DeepReadonly<R>>
  : T extends Function
    ? T
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type ValueOf<T> = T[keyof T];

export type NonNullableFields<T, K extends keyof T = keyof T> = {
  [P in keyof T]: P extends K ? NonNullable<T[P]> : T[P];
};

export type PickByType<T, ValueType> = {
  [P in keyof T as T[P] extends ValueType ? P : never]: T[P];
};

// Re-export core Result pattern types from errors
export type { Result, AsyncResult } from "./errors";

// =============================================================================
// Runtime Type Guards
// =============================================================================

export function isChatMessage(val: unknown): val is ChatMessage {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.fromId === "string" &&
    typeof obj.fromCallsign === "string" &&
    typeof obj.body === "string" &&
    typeof obj.createdAt === "string" &&
    typeof obj.expiresAt === "string" &&
    typeof obj.mine === "boolean" &&
    typeof obj.copied === "boolean"
  );
}

export function isSessionView(val: unknown): val is SessionView {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    (obj.kind === "stranger" || obj.kind === "friend") &&
    typeof obj.peerId === "string" &&
    typeof obj.peerCallsign === "string" &&
    Array.isArray(obj.interests) &&
    typeof obj.closed === "boolean"
  );
}

export function isDeskView(val: unknown): val is DeskView {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.station === "object" &&
    obj.station !== null &&
    Array.isArray(obj.friends) &&
    Array.isArray(obj.inboundQsl) &&
    typeof obj.queued === "boolean"
  );
}

export function isVoidLetter(val: unknown): val is VoidLetter {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.deviceId === "string" &&
    typeof obj.callsign === "string" &&
    typeof obj.text === "string" &&
    typeof obj.stars === "number" &&
    typeof obj.createdAt === "string"
  );
}

export function isHistorySession(val: unknown): val is HistorySession {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.sessionId === "string" &&
    typeof obj.peerCallsign === "string" &&
    typeof obj.startedAt === "number" &&
    typeof obj.savedAt === "number" &&
    typeof obj.messageCount === "number" &&
    typeof obj.preview === "string" &&
    Array.isArray(obj.interests) &&
    Array.isArray(obj.messages)
  );
}
