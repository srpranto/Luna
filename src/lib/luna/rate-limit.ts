export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const messageBuckets = new Map<string, Bucket>();
const matchmakerBuckets = new Map<string, Bucket>();
const previewBuckets = new Map<string, Bucket>();

// Sweeps old buckets every 5 minutes to prevent memory leak
if (typeof setInterval !== "undefined") {
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of messageBuckets.entries()) {
      if (now - b.lastRefill > 60000) messageBuckets.delete(key);
    }
    for (const [key, b] of matchmakerBuckets.entries()) {
      if (now - b.lastRefill > 60000) matchmakerBuckets.delete(key);
    }
    for (const [key, b] of previewBuckets.entries()) {
      if (now - b.lastRefill > 300000) previewBuckets.delete(key);
    }
  }, 300000);
  if (typeof sweepTimer.unref === "function") {
    sweepTimer.unref();
  }
}

function checkTokenBucket(
  store: Map<string, Bucket>,
  key: string,
  maxCapacity: number,
  refillRatePerSec: number,
): RateLimitResult {
  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket) {
    bucket = { tokens: maxCapacity - 1, lastRefill: now };
    store.set(key, bucket);
    return { allowed: true, retryAfterMs: 0 };
  }

  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(maxCapacity, bucket.tokens + elapsedSec * refillRatePerSec);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  const waitSec = (1 - bucket.tokens) / refillRatePerSec;
  return { allowed: false, retryAfterMs: Math.ceil(waitSec * 1000) };
}

export function checkMessageRateLimit(deviceId: string): RateLimitResult {
  // Max 5 messages burst, refills at 1.5 msg/sec (~5 per 3 seconds)
  return checkTokenBucket(messageBuckets, deviceId, 5, 1.67);
}

export function checkMatchmakerRateLimit(deviceId: string): RateLimitResult {
  // Max 3 rapid heartbeat/queue requests, refills at 2 per second
  return checkTokenBucket(matchmakerBuckets, deviceId, 3, 2.0);
}

export function checkPreviewRateLimit(ipOrDevice: string): RateLimitResult {
  // Max 15 previews, refills at 0.25/sec (~15 per minute)
  return checkTokenBucket(previewBuckets, ipOrDevice, 15, 0.25);
}
