import type { ChatMessage, HistorySession } from "./types";

const CHAT_CACHE_PREFIX = "luna.chat";
const HISTORY_INDEX_KEY = "luna.history.sessions";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
    if (Array.isArray(parsed)) {
      return parsed as ChatMessage[];
    }
    return [];
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
  const filtered = msgs.filter((m) => m.id !== messageId);
  saveCachedMessages(sessionId, filtered);
}


export function saveHistorySession(session: HistorySession): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadChatHistory();
    const updated = [session, ...existing.filter((s) => s.sessionId !== session.sessionId)].slice(
      0,
      50,
    );
    localStorage.setItem(HISTORY_INDEX_KEY, JSON.stringify(updated));
  } catch {}
}

export function loadChatHistory(): HistorySession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const valid: HistorySession[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object" && "sessionId" in item && "savedAt" in item) {
        const h = item as HistorySession;
        if (now - h.savedAt <= CACHE_TTL_MS) {
          valid.push(h);
        } else {
          localStorage.removeItem(`${CHAT_CACHE_PREFIX}.${h.sessionId}`);
        }
      }
    }
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
    const filtered = existing.filter((s) => s.sessionId !== sessionId);
    localStorage.setItem(HISTORY_INDEX_KEY, JSON.stringify(filtered));
    localStorage.removeItem(`${CHAT_CACHE_PREFIX}.${sessionId}`);
  } catch {}
}

export function clearAllChatHistory(): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadChatHistory();
    for (const s of existing) {
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
      if (key && key.startsWith(`${CHAT_CACHE_PREFIX}.`)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CachedEnvelope;
            if (parsed.savedAt && now - parsed.savedAt > CACHE_TTL_MS) {
              toRemove.push(key);
            }
          } catch {}
        }
      }
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
    }
  } catch {}
}

const ecdhStore = new Map<
  string,
  {
    keyPair?: CryptoKeyPair;
    sharedKey?: CryptoKey;
  }
>();

export async function getOrCreateDeviceKeyPair(deviceId: string): Promise<CryptoKeyPair | null> {
  if (typeof window === "undefined" || !crypto?.subtle) return null;
  const existing = ecdhStore.get(`device:${deviceId}`)?.keyPair;
  if (existing) return existing;

  const storageKey = `luna.device.ecdh.${deviceId}`;

  try {
    const cached = sessionStorage.getItem(storageKey);
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
      sessionStorage.setItem(storageKey, JSON.stringify({ priv, pub }));
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
    return Array.from(new Uint8Array(raw))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
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
  const keyPair = await getOrCreateDeviceKeyPair(deviceId);
  if (!keyPair) return null;

  try {
    const hexMatches = peerPublicKeyHex.match(/.{1,2}/g);
    if (!hexMatches) return null;
    const bytes = new Uint8Array(hexMatches.map((byte) => parseInt(byte, 16)));
    const peerKey = await crypto.subtle.importKey(
      "raw",
      bytes,
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

async function deriveFallbackSessionKey(sessionId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(`luna.session.${sessionId}`),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(`luna.salt.${sessionId}`),
      iterations: 10000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptText(text: string, sessionId: string): Promise<string> {
  if (typeof window === "undefined" || !crypto?.subtle) {
    return text;
  }
  try {
    const entry = ecdhStore.get(sessionId);
    const key = entry?.sharedKey ?? (await deriveFallbackSessionKey(sessionId));
    const isEcdh = Boolean(entry?.sharedKey);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const dataHex = Array.from(new Uint8Array(encrypted))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return isEcdh ? `e2e:v2:${ivHex}:${dataHex}` : `e2e:${ivHex}:${dataHex}`;
  } catch {
    return text;
  }
}

export async function decryptText(payload: string, sessionId: string): Promise<string> {
  if (typeof window === "undefined" || !crypto?.subtle || !payload.startsWith("e2e:")) {
    return payload;
  }
  try {
    const parts = payload.split(":");
    let ivHex = "";
    let dataHex = "";

    if (parts.length === 4 && parts[1] === "v2") {
      ivHex = parts[2] ?? "";
      dataHex = parts[3] ?? "";
    } else if (parts.length === 3) {
      ivHex = parts[1] ?? "";
      dataHex = parts[2] ?? "";
    } else {
      return payload;
    }

    const ivMatches = ivHex.match(/.{1,2}/g);
    const dataMatches = dataHex.match(/.{1,2}/g);
    if (!ivMatches || !dataMatches) {
      return payload;
    }
    const iv = new Uint8Array(ivMatches.map((byte) => parseInt(byte, 16)));
    const encrypted = new Uint8Array(dataMatches.map((byte) => parseInt(byte, 16)));

    const entry = ecdhStore.get(sessionId);
    const key = entry?.sharedKey ?? (await deriveFallbackSessionKey(sessionId));

    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch {
    return payload;
  }
}
