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

type Rule = { matcher: string; roles: Role[]; home: string };

const PAGE_ROLES: Rule[] = [
  { matcher: "/account", roles: [ROLES.CUSTOMER, ROLES.ADMIN], home: "/" },
  { matcher: "/cart", roles: [ROLES.CUSTOMER], home: "/" },
  { matcher: "/checkout", roles: [ROLES.CUSTOMER], home: "/" },
  // Public vendor profile pages are single-segment slugs (/vendor/[slug]);
  // only these dashboard paths are protected.
  { matcher: "/vendor/dashboard", roles: [ROLES.VENDOR, ROLES.ADMIN], home: "/account" },
  { matcher: "/vendor/orders", roles: [ROLES.VENDOR, ROLES.ADMIN], home: "/account" },
  { matcher: "/vendor/products", roles: [ROLES.VENDOR, ROLES.ADMIN], home: "/account" },
  { matcher: "/vendor/payouts", roles: [ROLES.VENDOR, ROLES.ADMIN], home: "/account" },
  { matcher: "/vendor/profile", roles: [ROLES.VENDOR, ROLES.ADMIN], home: "/account" },
  { matcher: "/vendor/onboarding", roles: [ROLES.VENDOR], home: "/" },
  { matcher: "/admin", roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN], home: "/" },
  { matcher: "/rider", roles: [ROLES.DELIVERY_PARTNER, ROLES.ADMIN], home: "/" },
  { matcher: "/super-admin", roles: [ROLES.SUPER_ADMIN], home: "/" },
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
    // No secret configured yet — rely on route-level guards instead of blocking dev.
    return NextResponse.next();
  }

  const accessCookie = request.cookies.get("savora.access")?.value;
  if (!accessCookie) {
    return NextResponse.redirect(new URL(`${SIGN_IN}?next=${encodeURIComponent(pathname)}`, request.url));
  }

  try {
    const { payload } = await jwtVerify(accessCookie, encoder.encode(jwtSecret));
    const role = typeof payload.role === "string" ? (payload.role as Role) : null;
    if (!role || !rule.roles.includes(role)) {
      return NextResponse.redirect(new URL(rule.home, request.url));
    }
  } catch {
    return NextResponse.redirect(new URL(`${SIGN_IN}?next=${encodeURIComponent(pathname)}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/cart/:path*", "/vendor/:path*", "/admin/:path*", "/checkout/:path*", "/rider/:path*", "/super-admin/:path*"],
};