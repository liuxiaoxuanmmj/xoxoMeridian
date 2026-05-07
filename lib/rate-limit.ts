type Bucket = number[];

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5_000;
const SWEEP_EVERY = 256;
let opsSinceSweep = 0;

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSec: number; resetAt: number };

export function check(key: string, max: number, windowMs: number, now = Date.now()): RateLimitResult {
  const cutoff = now - windowMs;

  if (++opsSinceSweep >= SWEEP_EVERY) {
    opsSinceSweep = 0;
    sweep(cutoff);
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = [];
    if (buckets.size >= MAX_KEYS) {
      const firstKey = buckets.keys().next().value;
      if (firstKey !== undefined) buckets.delete(firstKey);
    }
    buckets.set(key, bucket);
  }

  while (bucket.length && bucket[0] <= cutoff) {
    bucket.shift();
  }

  if (bucket.length >= max) {
    const oldest = bucket[0];
    const resetAt = oldest + windowMs;
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      resetAt,
    };
  }

  bucket.push(now);
  return { ok: true, remaining: max - bucket.length, resetAt: now + windowMs };
}

function sweep(cutoff: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.length === 0 || bucket[bucket.length - 1] <= cutoff) {
      buckets.delete(key);
    }
  }
}

export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return new Response(
    JSON.stringify({ error: "Too many requests", retryAfter: result.retryAfterSec }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(result.retryAfterSec),
      },
    }
  );
}

export function clientIpFrom(request: Request, fallback = "unknown"): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return fallback;
}

export function enforceRateLimit(
  request: Request,
  key: string,
  max: number,
  windowMs: number,
): Response | null {
  const ip = clientIpFrom(request);
  const result = check(`${key}:${ip}`, max, windowMs);
  return result.ok ? null : rateLimitResponse(result);
}
