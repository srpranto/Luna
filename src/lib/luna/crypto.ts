import type { ChatMessage } from "./types";

const CHAT_CACHE_PREFIX = "luna.chat";

export function loadCachedMessages(sessionId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(`${CHAT_CACHE_PREFIX}.${sessionId}`);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveCachedMessages(sessionId: string, msgs: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${CHAT_CACHE_PREFIX}.${sessionId}`, JSON.stringify(msgs));
  } catch {}
}

export function clearCachedMessages(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`${CHAT_CACHE_PREFIX}.${sessionId}`);
  } catch {}
  destroySessionKey(sessionId);
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
