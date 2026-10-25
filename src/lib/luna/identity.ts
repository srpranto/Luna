const STORAGE_PREFIX = "luna.user";
const SECRET_PREFIX = "luna.secret";

export function deskName(): string {
  if (typeof window === "undefined") return "main";
  const params = new URLSearchParams(window.location.search);
  const desk = params.get("desk") || params.get("table") || params.get("seat");
  return desk && /^[a-z0-9-]{1,16}$/i.test(desk) ? desk.toLowerCase() : "main";
}

export function getOrCreateDeviceId(): string {
  const key = `${STORAGE_PREFIX}.${deskName()}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export function getOrCreateDeviceSecret(): string {
  if (typeof window === "undefined") return "server-secret-placeholder";
  const key = `${SECRET_PREFIX}.${deskName()}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const secret =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `${crypto.randomUUID()}-${crypto.randomUUID()}`.replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  localStorage.setItem(key, secret);
  return secret;
}

export const getCachedCustomName = (): string | null =>
  typeof window === "undefined" ? null : localStorage.getItem(`${STORAGE_PREFIX}.name.${deskName()}`);

export const setCachedCustomName = (name: string): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(`${STORAGE_PREFIX}.name.${deskName()}`, name);
  }
};

export const clearCachedCustomName = (): void => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(`${STORAGE_PREFIX}.name.${deskName()}`);
  }
};

export const formatClock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

export const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export const formatRemaining = (expiresAt: string, now: number): string | null => {
  const left = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(left) || left <= 0) return "faded";
  return left > 3600000 ? null : formatElapsed(left);
};
