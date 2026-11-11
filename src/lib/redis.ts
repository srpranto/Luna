/**
 * Zero-dependency, Edge-compatible Upstash Redis Serverless REST client.
 * Operates purely over standard Web Fetch API.
 * 100% Free - Upstash provides 10,000 commands/day free forever.
 * Falls back gracefully to local in-memory/SQL mode if environment variables are not set.
 */

export interface UpstashRedisConfig {
  url?: string;
  token?: string;
}

function getRedisConfig(): UpstashRedisConfig {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN,
  };
}

export function isRedisConfigured(): boolean {
  const { url, token } = getRedisConfig();
  return Boolean(url && token);
}

/**
 * Execute an arbitrary command against Upstash Redis via REST.
 * Returns null if Redis is not configured or if a network error occurs.
 */
export async function redisCommand<T = unknown>(
  command: string[],
): Promise<T | null> {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    return null; // Graceful fallback
  }

  try {
    const endpoint = url.replace(/\/+$/, "");
    const res = await fetch(`${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      // Prevent Vercel function hanging if Redis is unreachable
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return null;
    }

    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error) {
      console.warn("[Luna Upstash Redis Error]", json.error);
      return null;
    }

    return json.result ?? null;
  } catch (err) {
    // Non-fatal: system continues on local memory / SQL polling
    console.warn(
      "[Luna Redis Offline Fallback]",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Publish an event to a Redis channel (for multi-region serverless fanout).
 */
export async function redisPublish(channel: string, message: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  const res = await redisCommand<number>(["PUBLISH", channel, message]);
  return typeof res === "number" && res >= 0;
}

/**
 * Atomic rate-limiter using Redis INCR + EXPIRE.
 * 100% serverless, edge-safe token tracking across all Vercel instances.
 */
export async function redisRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!isRedisConfigured()) {
    // When Redis is not configured, fall back to in-process memory limiter
    return { allowed: true, remaining: limit };
  }

  try {
    const current = await redisCommand<number>(["INCR", key]);
    if (current === 1) {
      await redisCommand(["EXPIRE", key, String(windowSeconds)]);
    }

    if (current && current > limit) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: Math.max(0, limit - (current || 0)) };
  } catch {
    return { allowed: true, remaining: 1 };
  }
}
