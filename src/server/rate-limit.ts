import { NextResponse } from "next/server";

/**
 * Tiny in-memory token bucket for read-heavy public endpoints.
 * Per-process and best-effort (resets on redeploy/scale) — enough to blunt
 * brute-force scans without adding infrastructure. Writes/auth are unaffected.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function searchRateLimitKey(request: Request): string {
  return `search:${clientIp(request)}`;
}

export function checkRateLimit(key: string, limit = 60, windowMs = 60_000): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, retryAfter: 0 };
}

export function rateLimitedResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { success: false, message: "Too many requests. Slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Client IP for rate-limit keys. Prefers edge-set headers that clients
 * cannot spoof (Vercel overwrites x-real-ip) over the easily forged
 * X-Forwarded-For. Single-instance memory bucket remains best-effort:
 * use Redis/Upstash for cross-instance auth/OTP limits (documented
 * follow-up, not wired here).
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/** Per-IP token bucket for sensitive non-authenticated endpoints. */
export function limitByIp(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
): { ok: boolean; retryAfter: number } {
  return checkRateLimit(`rl:${scope}:${clientIp(request)}`, limit, windowMs);
}
