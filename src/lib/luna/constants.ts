export const MAX_LINE_CHARS = 280;
export const QUEUE_STALE_SECONDS = 6;
export const STRANGER_TTL_MINUTES = 1440;
export const IDLE_AWAY_THRESHOLD_MS = 60000;
export const ABANDON_AFTER_MINUTES = 120;
export const FRIEND_TTL_DAYS = 7;

export function sanitizeInterests(input: unknown): string[] {
  if (!input) return [];
  const items = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
  return [
    ...new Set(
      items
        .flatMap((i) => (typeof i === "string" ? i.split(",") : []))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

export function parseInterests(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return sanitizeInterests(raw);
  if (typeof raw === "string") {
    try {
      return sanitizeInterests(JSON.parse(raw));
    } catch {
      return sanitizeInterests(raw);
    }
  }
  return [];
}

export function sharedInterests(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item));
}

export const minSharedForWait = (waitMs: number): number => (waitMs >= 4000 ? 0 : 1);

export const newId = (): string => crypto.randomUUID();

export const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export const friendSessionId = (a: string, b: string): string => `qsl:${pairKey(a, b).join(":")}`;

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

export const isDeviceId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function mintCallsign(ip?: string, offset = 0): string {
  if (ip) {
    const base = (hashIp(ip) + offset) % STRANGER_NAMES.length;
    return STRANGER_NAMES[base] ?? STRANGER_NAMES[0];
  }
  const idx = Math.floor(Math.random() * STRANGER_NAMES.length);
  return STRANGER_NAMES[idx] ?? STRANGER_NAMES[0];
}
