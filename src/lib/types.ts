import { z } from "zod";

// =============================================================================
// Zod Domain Schemas & Inferred Runtime Types
// =============================================================================

export const SessionKindSchema = z.enum(["stranger", "friend"]);
export type SessionKind = z.infer<typeof SessionKindSchema>;

export const QslStatusSchema = z.enum(["pending", "accepted", "declined"]);
export type QslStatus = z.infer<typeof QslStatusSchema>;

export const StationSchema = z.object({
  deviceId: z.string(),
  callsign: z.string(),
  publicKey: z.string().optional(),
});
export type Station = z.infer<typeof StationSchema>;

export const FriendRowSchema = z.object({
  deviceId: z.string(),
  callsign: z.string(),
});
export type FriendRow = z.infer<typeof FriendRowSchema>;

export const QslRowSchema = z.object({
  id: z.string(),
  fromId: z.string(),
  fromCallsign: z.string(),
  toId: z.string(),
  toCallsign: z.string(),
  status: QslStatusSchema,
});
export type QslRow = z.infer<typeof QslRowSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  fromId: z.string(),
  fromCallsign: z.string(),
  body: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  mine: z.boolean(),
  system: z.boolean().optional(),
  copied: z.boolean(),
  editedAt: z.string().optional(),
  seenAt: z.string().optional(),
  clientMsgId: z.string().optional(),
  status: z.enum(["sending", "sent", "delivered", "seen", "failed"]).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SessionViewSchema = z.object({
  id: z.string(),
  kind: SessionKindSchema,
  peerId: z.string(),
  peerCallsign: z.string(),
  peerPublicKey: z.string().optional(),
  interests: z.array(z.string()),
  createdAt: z.string().default(() => new Date().toISOString()),
  closed: z.boolean(),
  outboundQsl: QslStatusSchema.nullable().default(null),
  inboundQsl: z.object({ id: z.string(), status: QslStatusSchema }).nullable().default(null),
  alreadyFriends: z.boolean().default(false),
  peerTyping: z.boolean().default(false),
  peerLastSeen: z.string().optional(),
  peerPresence: z.enum(["active", "away", "disconnected"]).optional(),
  peerIsAway: z.boolean().optional(),
  outboundReconnect: z.boolean().optional(),
  inboundReconnect: z.boolean().optional(),
});
export type SessionView = z.infer<typeof SessionViewSchema>;

export const TopicStatSchema = z.object({
  topic: z.string(),
  count: z.number(),
});
export type TopicStat = z.infer<typeof TopicStatSchema>;

export const DeskViewSchema = z.object({
  station: StationSchema,
  friends: z.array(FriendRowSchema),
  inboundQsl: z.array(QslRowSchema),
  activeSession: SessionViewSchema.nullable(),
  queued: z.boolean(),
  queuedInterests: z.array(z.string()),
  enteredAt: z.string().nullable(),
  onlineCount: z.number().optional(),
  activeQueueTopics: z.array(z.string()).optional(),
  activeTopicStats: z.array(TopicStatSchema).optional(),
  stationToken: z.string().optional(),
});
export type DeskView = z.infer<typeof DeskViewSchema>;

export const QueueHeartbeatResultSchema = z.object({
  status: z.enum(["idle", "waiting", "matched"]),
  desk: DeskViewSchema,
});
export type QueueHeartbeatResult = z.infer<typeof QueueHeartbeatResultSchema>;

export const MessagesPackSchema = z.object({
  session: SessionViewSchema,
  messages: z.array(ChatMessageSchema),
});
export type MessagesPack = z.infer<typeof MessagesPackSchema>;

export const VoidLetterSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  callsign: z.string(),
  text: z.string(),
  stars: z.number(),
  hasStarred: z.boolean().optional(),
  createdAt: z.string(),
});
export type VoidLetter = z.infer<typeof VoidLetterSchema>;

export const HistorySessionSchema = z.object({
  sessionId: z.string(),
  peerCallsign: z.string(),
  startedAt: z.number(),
  savedAt: z.number(),
  messageCount: z.number(),
  preview: z.string(),
  interests: z.array(z.string()),
  messages: z.array(ChatMessageSchema),
});
export type HistorySession = z.infer<typeof HistorySessionSchema>;

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
// Runtime Type Guards Powered by Zod
// =============================================================================

export function isChatMessage(val: unknown): val is ChatMessage {
  return ChatMessageSchema.safeParse(val).success;
}

export function isSessionView(val: unknown): val is SessionView {
  return SessionViewSchema.safeParse(val).success;
}

export function isDeskView(val: unknown): val is DeskView {
  return DeskViewSchema.safeParse(val).success;
}

export function isVoidLetter(val: unknown): val is VoidLetter {
  return VoidLetterSchema.safeParse(val).success;
}

export function isHistorySession(val: unknown): val is HistorySession {
  return HistorySessionSchema.safeParse(val).success;
}
