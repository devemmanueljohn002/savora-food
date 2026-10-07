import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifySessionToken, type SessionUser } from "./auth/session";

/**
 * Server-side admin gate for /admin pages. Reads the session cookie and
 * verifies the role on the SERVER before any admin UI renders — hiding
 * links in the UI is not enforcement. Returns the admin user, or null when
 * the visitor is signed out, has no session, or is not an admin.
 *
 * Both ADMIN and SUPER_ADMIN satisfy the "admin" requirement (SUPER_ADMIN
 * is the database-created escalation of the single admin role; there is no
 * admin signup anywhere in the app).
 */
export async function getAdminPageUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(ACCESS_COOKIE)?.value;
    if (!token) return null;
    const user = await verifySessionToken(token);
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return null;
    return user;
  } catch {
    return null;
  }
}
