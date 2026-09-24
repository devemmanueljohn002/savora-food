import type { NextRequest } from "next/server";
import { ApiError } from "../errors";
import { ACCESS_COOKIE, type SessionUser, verifySessionToken } from "./session";

export const ROLES = {
  CUSTOMER: "CUSTOMER",
  VENDOR: "VENDOR",
  ADMIN: "ADMIN",
  DELIVERY_PARTNER: "DELIVERY_PARTNER",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export async function requireSession(request: NextRequest): Promise<SessionUser> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) {
    throw new ApiError("UNAUTHORIZED", "Please sign in to continue.");
  }
  return verifySessionToken(token);
}

export async function requireRole(request: NextRequest, roles: Role[]): Promise<SessionUser> {
  const user = await requireSession(request);
  if (!roles.includes(user.role as Role)) {
    throw new ApiError("FORBIDDEN", "You do not have permission to access this resource.");
  }
  return user;
}

export async function requireCustomer(request: NextRequest): Promise<SessionUser> {
  return requireRole(request, [ROLES.CUSTOMER]);
}

export async function requireVendor(request: NextRequest): Promise<SessionUser> {
  return requireRole(request, [ROLES.VENDOR]);
}

export async function requireAdmin(request: NextRequest): Promise<SessionUser> {
  return requireRole(request, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
}

export async function requireSuperAdmin(request: NextRequest): Promise<SessionUser> {
  return requireRole(request, [ROLES.SUPER_ADMIN]);
}

export async function optionalSession(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}