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
}

export interface DeskView {
  station: Station;
  friends: FriendRow[];
  inboundQsl: QslRow[];
  activeSession: SessionView | null;
  queued: boolean;
  queuedInterests: string[];
  enteredAt: string | null;
  banned?: boolean;
  banReason?: string;
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
