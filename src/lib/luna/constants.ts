export const MAX_LINE_CHARS = 280;
export const QUEUE_STALE_SECONDS = 6;
export const STRANGER_TTL_MINUTES = 1440;
export const IDLE_AWAY_THRESHOLD_MS = 60000;
export const INACTIVITY_DISCONNECT_MS = 900000;
export const ABANDON_AFTER_MINUTES = 10;
export const FRIEND_TTL_DAYS = 7;

export function sanitizeInterests(input: unknown): string[] {
  if (!input) return [];
  const rawList: string[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        const parts = item.split(",");
        for (const p of parts) rawList.push(p);
      }
    }
  } else if (typeof input === "string") {
    const parts = input.split(",");
    for (const p of parts) rawList.push(p);
  }
  const next: string[] = [];
  for (const item of rawList) {
    const clean = item.trim().toLowerCase();
    if (clean && !next.includes(clean)) {
      next.push(clean);
    }
    if (next.length >= 10) break;
  }
  return next;
}

export function parseInterests(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return sanitizeInterests(raw);
  if (typeof raw === "string") {
    try {
      const value = JSON.parse(raw) as unknown;
      return sanitizeInterests(value);
    } catch {
      return sanitizeInterests(raw);
    }
  }
  return [];
}

export function sharedInterests(a: string[], b: string[]): string[] {
  return a.filter((item) => b.includes(item));
}

export function minSharedForWait(waitMs: number): number {
  if (waitMs >= 4000) {
    return 0;
  }
  return 1;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function friendSessionId(a: string, b: string): string {
  const [x, y] = pairKey(a, b);
  return `qsl:${x}:${y}`;
}

export const STRANGER_NAMES = [
  "Rainy-Soul",
  "Midnight-Reader",
  "Quiet-Traveler",
  "Sleepless-Poet",
  "Gentle-Echo",
  "Muted-Shadow",
  "Amber-Lantern",
  "Velvet-Dreamer",
  "Solitary-Heart",
  "Autumn-Visitor",
  "Patient-Listener",
  "Drifting-Sparrow",
  "Silver-Raindrop",
  "Tired-Wanderer",
  "Somber-Observer",
  "Lost-Sleeper",
  "Warm-Drifter",
  "Fragile-Ghost",
  "Distant-Friend",
  "Nocturnal-Heart",
] as const;

export type StrangerName = (typeof STRANGER_NAMES)[number];

export function hashIp(ip: string): number {
  let hash = 5381;
  for (let i = 0; i < ip.length; i += 1) {
    hash = ((hash << 5) + hash + ip.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function isDeviceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function mintCallsign(ip?: string, offset = 0): string {
  if (ip) {
    const base = (hashIp(ip) + offset) % STRANGER_NAMES.length;
    return STRANGER_NAMES[base] ?? STRANGER_NAMES[0];
  }
  const idx = Math.floor(Math.random() * STRANGER_NAMES.length);
  return STRANGER_NAMES[idx] ?? STRANGER_NAMES[0];
}
