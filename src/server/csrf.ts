import { ApiError } from "./errors";
import { getEnv } from "./env";

/**
 * Tolerant same-origin check for cookie-authenticated, money- or
 * credential-moving POSTs. Browsers always send Origin on fetch POSTs (or a
 * Referer fallback), so a cross-origin value is a forgery signal and fails
 * closed. Non-browser clients (curl, native apps, server-to-server) send
 * neither and pass through — this complements SameSite=Lax, it does not
 * replace authentication.
 */
export function assertSameOrigin(request: Request): void {
  const candidate = request.headers.get("origin") ?? request.headers.get("referer") ?? null;
  if (!candidate) return;
  let presented: URL;
  try {
    presented = new URL(candidate);
  } catch {
    throw ApiError.forbidden("Cross-origin request rejected.");
  }
  const allowed = new Set<string>();
  for (const raw of [getEnv().appUrl, getEnv().siteUrl]) {
    if (!raw) continue;
    try {
      allowed.add(new URL(raw.replace(/\/+$/, "")).origin);
    } catch {
      // Misconfigured origin — ignore rather than fail open later.
    }
  }
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    // ignore
  }
  if (!allowed.has(presented.origin)) {
    throw ApiError.forbidden("Cross-origin request rejected.");
  }
}
