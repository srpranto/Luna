import type { ChatMessage, HistorySession } from "./types";

const CHAT_CACHE_PREFIX = "luna.chat";
const HISTORY_INDEX_KEY = "luna.history.sessions";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const bufferToHex = (buf: ArrayBuffer | Uint8Array): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

const hexToBytes = (hex: string): Uint8Array => {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  const buffer = new ArrayBuffer(matches.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < matches.length; i++) {
    view[i] = parseInt(matches[i]!, 16);
  }
  return view;
};

interface CachedEnvelope {
  messages: ChatMessage[];
  savedAt: number;
}

export function loadCachedMessages(sessionId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${CHAT_CACHE_PREFIX}.${sessionId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "messages" in parsed && "savedAt" in parsed) {
      const env = parsed as CachedEnvelope;
      if (Date.now() - env.savedAt > CACHE_TTL_MS) {
        localStorage.removeItem(`${CHAT_CACHE_PREFIX}.${sessionId}`);
        return [];
      }
      return env.messages;
    }
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedMessages(sessionId: string, msgs: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CachedEnvelope = {
      messages: msgs,
      savedAt: Date.now(),
    };
    localStorage.setItem(`${CHAT_CACHE_PREFIX}.${sessionId}`, JSON.stringify(envelope));
  } catch {}
}

export function updateCachedMessage(sessionId: string, messageId: string, newBody: string): void {
  const msgs = loadCachedMessages(sessionId);
  const updated = msgs.map((m) =>
    m.id === messageId ? { ...m, body: newBody, editedAt: new Date().toISOString() } : m,
  );
  saveCachedMessages(sessionId, updated);
}

export function deleteCachedMessage(sessionId: string, messageId: string): void {
  const msgs = loadCachedMessages(sessionId);
  saveCachedMessages(
    sessionId,
    msgs.filter((m) => m.id !== messageId),
  );
}

export function saveHistorySession(session: HistorySession): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadChatHistory();
    const updated = [session, ...existing.filter((s) => s.sessionId !== session.sessionId)].slice(0, 50);
    localStorage.setItem(HISTORY_INDEX_KEY, JSON.stringify(updated));
  } catch {}
}

export function loadChatHistory(): HistorySession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const valid = parsed.filter((item): item is HistorySession => {
      if (item && typeof item === "object" && "sessionId" in item && "savedAt" in item) {
        if (now - item.savedAt <= CACHE_TTL_MS) return true;
        localStorage.removeItem(`${CHAT_CACHE_PREFIX}.${item.sessionId}`);
      }
      return false;
    });
    if (valid.length !== parsed.length) {
      localStorage.setItem(HISTORY_INDEX_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

export function deleteHistorySession(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadChatHistory();
    localStorage.setItem(HISTORY_INDEX_KEY, JSON.stringify(existing.filter((s) => s.sessionId !== sessionId)));
    localStorage.removeItem(`${CHAT_CACHE_PREFIX}.${sessionId}`);
  } catch {}
}

export function clearAllChatHistory(): void {
  if (typeof window === "undefined") return;
  try {
    for (const s of loadChatHistory()) {
      localStorage.removeItem(`${CHAT_CACHE_PREFIX}.${s.sessionId}`);
    }
    localStorage.removeItem(HISTORY_INDEX_KEY);
  } catch {}
}

export function sweepExpiredCaches(): void {
  if (typeof window === "undefined") return;
  try {
    loadChatHistory();
    const now = Date.now();
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${CHAT_CACHE_PREFIX}.`)) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? "");
          if (parsed?.savedAt && now - parsed.savedAt > CACHE_TTL_MS) {
            toRemove.push(key);
          }
        } catch {}
      }
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {}
}

const ecdhStore = new Map<
  string,
  {
    keyPair?: CryptoKeyPair;
    sharedKey?: CryptoKey;
  }
>();

async function getOrCreateDeviceKeyPair(deviceId: string): Promise<CryptoKeyPair | null> {
  if (typeof window === "undefined" || !crypto?.subtle) return null;
  const existing = ecdhStore.get(`device:${deviceId}`)?.keyPair;
  if (existing) return existing;

  const storageKey = `luna.device.ecdh.${deviceId}`;

  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { priv?: JsonWebKey; pub?: JsonWebKey };
      if (parsed.priv && parsed.pub) {
        const privateKey = await crypto.subtle.importKey(
          "jwk",
          parsed.priv,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey", "deriveBits"],
        );
        const publicKey = await crypto.subtle.importKey(
          "jwk",
          parsed.pub,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          [],
        );
        const restored: CryptoKeyPair = { privateKey, publicKey };
        const entry = ecdhStore.get(`device:${deviceId}`) ?? {};
        entry.keyPair = restored;
        ecdhStore.set(`device:${deviceId}`, entry);
        return restored;
      }
    }
  } catch {}

  try {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveKey",
      "deriveBits",
    ]);

    try {
      const priv = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
      const pub = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
      localStorage.setItem(storageKey, JSON.stringify({ priv, pub }));
    } catch {}

    const entry = ecdhStore.get(`device:${deviceId}`) ?? {};
    entry.keyPair = keyPair;
    ecdhStore.set(`device:${deviceId}`, entry);
    return keyPair;
  } catch {
    return null;
  }
}

export async function exportDevicePublicKeyHex(deviceId: string): Promise<string | null> {
  if (typeof window === "undefined" || !crypto?.subtle) return null;
  const keyPair = await getOrCreateDeviceKeyPair(deviceId);
  if (!keyPair) return null;

  try {
    const raw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    return bufferToHex(raw);
  } catch {
    return null;
  }
}

export async function establishSharedKey(
  deviceId: string,
  sessionId: string,
  peerPublicKeyHex: string,
): Promise<CryptoKey | null> {
  if (typeof window === "undefined" || !crypto?.subtle) return null;
  const existing = ecdhStore.get(sessionId);
  if (existing?.sharedKey) return existing.sharedKey;
  const keyPair = await getOrCreateDeviceKeyPair(deviceId);
  if (!keyPair) return null;

  try {
    const bytes = hexToBytes(peerPublicKeyHex);
    if (bytes.length === 0) return null;
    const peerKey = await crypto.subtle.importKey(
      "raw",
      bytes as unknown as BufferSource,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const sharedKey = await crypto.subtle.deriveKey(
      { name: "ECDH", public: peerKey },
      keyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const entry = ecdhStore.get(sessionId) ?? {};
    entry.sharedKey = sharedKey;
    ecdhStore.set(sessionId, entry);
    return sharedKey;
  } catch {
    return null;
  }
}

export function destroySessionKey(sessionId: string): void {
  ecdhStore.delete(sessionId);
}

export async function encryptText(text: string, sessionId: string): Promise<string> {
  if (typeof window === "undefined" || !crypto?.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }
  const entry = ecdhStore.get(sessionId);
  const sharedKey = entry?.sharedKey;
  if (!sharedKey) {
    throw new Error("End-to-end encryption key has not been established yet. Message held.");
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, encoded);

  const ivHex = bufferToHex(iv);
  const dataHex = bufferToHex(encrypted);

  return `e2e:v2:${ivHex}:${dataHex}`;
}

export async function decryptText(payload: string, sessionId: string): Promise<string> {
  if (typeof window === "undefined" || !crypto?.subtle || !payload.startsWith("e2e:")) {
    return payload;
  }
  try {
    const parts = payload.split(":");
    if (parts.length === 4 && parts[1] === "v2") {
      const sharedKey = ecdhStore.get(sessionId)?.sharedKey;
      if (!sharedKey) {
        return "🔒 [Encrypted message - awaiting key]";
      }
      const ivHex = parts[2] ?? "";
      const dataHex = parts[3] ?? "";
      const iv = hexToBytes(ivHex);
      const encrypted = hexToBytes(dataHex);
      if (iv.length === 0 || encrypted.length === 0) return payload;

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as unknown as BufferSource },
        sharedKey,
        encrypted as unknown as BufferSource,
      );
      return new TextDecoder().decode(decrypted);
    }
    return "🔒 [Encrypted message]";
  } catch {
    return "🔒 [Decryption failed]";
  }
}

export async function deriveSafetyNumber(pubKeyA: string, pubKeyB: string): Promise<string> {
  if (typeof window === "undefined" || !crypto?.subtle || !pubKeyA || !pubKeyB) {
    return "0000 0000 0000";
  }
  try {
    const combined = [pubKeyA.toLowerCase().trim(), pubKeyB.toLowerCase().trim()].sort().join("::");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(combined));
    const view = new DataView(digest);
    const num1 = String(view.getUint16(0) % 10000).padStart(4, "0");
    const num2 = String(view.getUint16(2) % 10000).padStart(4, "0");
    const num3 = String(view.getUint16(4) % 10000).padStart(4, "0");
    return `${num1} ${num2} ${num3}`;
  } catch {
    return "0000 0000 0000";
  }
}
