import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROLES = {
  CUSTOMER: "CUSTOMER",
  VENDOR: "VENDOR",
  ADMIN: "ADMIN",
  DELIVERY_PARTNER: "DELIVERY_PARTNER",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

type Role = (typeof ROLES)[keyof typeof ROLES];

const SIGN_IN = "/login";
const encoder = new TextEncoder();

type Rule = { matcher: string; roles: Role[] };

const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: "/",
  VENDOR: "/vendor/dashboard",
  DELIVERY_PARTNER: "/rider/dashboard",
  ADMIN: "/admin/dashboard",
  SUPER_ADMIN: "/super-admin/dashboard",
};

/** Where a signed-in user of this role belongs when bounced off a route. */
function homeForRole(role: Role | null): string {
  return (role && ROLE_HOME[role]) || "/";
}

const PAGE_ROLES: Rule[] = [
  { matcher: "/account", roles: [ROLES.CUSTOMER, ROLES.ADMIN] },
  { matcher: "/cart", roles: [ROLES.CUSTOMER] },
  { matcher: "/checkout", roles: [ROLES.CUSTOMER] },
  // Customer dashboard hub (orders, catering, favorites, notifications).
  { matcher: "/dashboard", roles: [ROLES.CUSTOMER, ROLES.ADMIN, ROLES.SUPER_ADMIN] },
  // Public vendor profile pages are single-segment slugs (/vendor/[slug]);
  // only these dashboard paths are protected.
  { matcher: "/vendor/dashboard", roles: [ROLES.VENDOR, ROLES.ADMIN] },
  { matcher: "/vendor/orders", roles: [ROLES.VENDOR, ROLES.ADMIN] },
  { matcher: "/vendor/products", roles: [ROLES.VENDOR, ROLES.ADMIN] },
  { matcher: "/vendor/catering", roles: [ROLES.VENDOR, ROLES.ADMIN] },
  { matcher: "/vendor/payouts", roles: [ROLES.VENDOR, ROLES.ADMIN] },
  { matcher: "/vendor/profile", roles: [ROLES.VENDOR, ROLES.ADMIN] },
  { matcher: "/vendor/onboarding", roles: [ROLES.VENDOR] },
  { matcher: "/admin", roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN] },
  { matcher: "/rider", roles: [ROLES.DELIVERY_PARTNER, ROLES.ADMIN] },
  { matcher: "/super-admin", roles: [ROLES.SUPER_ADMIN] },
];

function matches(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function findRule(pathname: string): Rule | null {
  return PAGE_ROLES.find((rule) => matches(rule.matcher, pathname)) ?? null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const rule = findRule(pathname);
  if (!rule) return NextResponse.next();

  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    // Fail closed in production: without a signing secret no session can be
    // verified, so every protected page bounces to login. Local dev (no
    // secret configured yet) still relies on route-level guards instead of
    // blocking the developer.
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      return NextResponse.redirect(new URL(`${SIGN_IN}?next=${encodeURIComponent(pathname)}`, request.url));
    }
    return NextResponse.next();
  }

  const accessCookie = request.cookies.get("savora.access")?.value;
  if (!accessCookie) {
    return NextResponse.redirect(new URL(`${SIGN_IN}?next=${encodeURIComponent(pathname)}`, request.url));
  }

  try {
    // Same issuer/audience contract as the API-layer session check
    // (src/server/auth/session.ts) so both layers agree on validity.
    const issuer = process.env.JWT_ISSUER?.trim() || "savora-food";
    const { payload } = await jwtVerify(accessCookie, encoder.encode(jwtSecret), {
      issuer,
      audience: "savora-frontend",
    });
    const role = typeof payload.role === "string" ? (payload.role as Role) : null;
    if (!role || !rule.roles.includes(role)) {
      return NextResponse.redirect(new URL(homeForRole(role), request.url));
    }
  } catch {
    return NextResponse.redirect(new URL(`${SIGN_IN}?next=${encodeURIComponent(pathname)}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/cart/:path*", "/checkout/:path*", "/dashboard/:path*", "/vendor/:path*", "/admin/:path*", "/rider/:path*", "/super-admin/:path*"],
};