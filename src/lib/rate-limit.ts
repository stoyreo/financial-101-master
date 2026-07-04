/**
 * SERVER-ONLY simple in-memory rate limiter (token bucket per key).
 *
 * Scope and limitations (accepted trade-off per ENHANCEMENT_PROPOSAL_2026-07-02
 * P0 item 4 — "Add a simple per-user/IP limiter"):
 *  - State lives in module memory, so it's per-Vercel-instance, not global.
 *    Serverless functions can scale to multiple instances, so a determined
 *    attacker distributed across instances could exceed the nominal limit.
 *    This is still a large improvement over "no limit at all" and needs no
 *    new infrastructure (Redis/Upstash) to ship. If usage grows, swap this
 *    for Upstash Ratelimit without changing call sites — same `check()` shape.
 *  - Buckets are never explicitly evicted; a lazy sweep runs periodically to
 *    bound memory growth.
 */

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function sweep(staleAfterMs: number) {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  buckets.forEach((bucket, key) => {
    if (now - bucket.updatedAt > staleAfterMs) buckets.delete(key);
  });
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Check + consume one token from `key`'s bucket.
 * @param key        Identifier to scope the limit to (e.g. `${userId}` or `${route}:${ip}`).
 * @param limit       Max tokens (requests) per window.
 * @param windowMs    Window size in ms over which `limit` tokens refill.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  sweep(windowMs * 4);

  const now = Date.now();
  const refillRatePerMs = limit / windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: limit, updatedAt: now };
    buckets.set(key, bucket);
  } else {
    const elapsed = now - bucket.updatedAt;
    bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRatePerMs);
    bucket.updatedAt = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { ok: true, remaining: Math.floor(bucket.tokens), limit, retryAfterSeconds: 0 };
  }

  const deficitTokens = 1 - bucket.tokens;
  const retryAfterMs = deficitTokens / refillRatePerMs;
  return {
    ok: false,
    remaining: 0,
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

/** Best-effort client IP from standard proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
