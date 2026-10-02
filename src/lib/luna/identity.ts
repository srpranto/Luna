const STORAGE_PREFIX = "luna.user";

export function deskName(): string {
  if (typeof window === "undefined") {
    return "main";
  }
  const params = new URLSearchParams(window.location.search);
  const desk = params.get("desk") || params.get("table") || params.get("seat");
  if (desk && /^[a-z0-9-]{1,16}$/i.test(desk)) {
    return desk.toLowerCase();
  }
  return "main";
}

export function getOrCreateDeviceId(): string {
  const key = `${STORAGE_PREFIX}.${deskName()}`;
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export function getCachedCustomName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${STORAGE_PREFIX}.name.${deskName()}`);
}

export function setCachedCustomName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}.name.${deskName()}`, name);
}

export function clearCachedCustomName(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${STORAGE_PREFIX}.name.${deskName()}`);
}

export function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatRemaining(expiresAt: string, now: number): string | null {
  const left = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(left) || left <= 0) {
    return "faded";
  }
  if (left > 60 * 60 * 1000) {
    return null;
  }
  return formatElapsed(left);
}
