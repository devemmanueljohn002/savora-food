import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, verifySessionToken, type SessionUser } from "./auth/session";
import { getHomeRouteForRole } from "@/lib/role-routes";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

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
    if (!ADMIN_ROLES.has(user.role)) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Enforcing server-side gate for the /admin layout. Unlike
 * getAdminPageUser (which returns null and lets a page choose its fallback),
 * this REDIRECTS: signed-out visitors go to sign-in with a return path, and
 * signed-in non-admins go to their own role home. Call it from
 * app/admin/layout.tsx so EVERY /admin route is protected regardless of
 * client-side navigation or a disabled edge proxy.
 *
 * redirect() throws a control-flow signal, so it is invoked OUTSIDE the
 * try/catch that swallows token-verification failures.
 */
export async function requireAdminPageUser(): Promise<SessionUser> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) redirect("/login?next=%2Fadmin");

  let user: SessionUser;
  try {
    user = await verifySessionToken(token);
  } catch {
    redirect("/login?next=%2Fadmin");
  }

  if (!ADMIN_ROLES.has(user.role)) {
    redirect(getHomeRouteForRole(user.role));
  }
  return user;
}
