/**
 * Single source of truth for role-dependent destinations.
 *
 * Role model: one role per user (users.role). CUSTOMER is the default
 * storefront role; VENDOR / DELIVERY_PARTNER get their own dashboards;
 * ADMIN / SUPER_ADMIN get theirs but may also use consumer routes.
 *
 * - getHomeRouteForRole: where "Home" means for this role (post-login
 *   landing for staff roles; the storefront for customers).
 * - getDashboardRouteForRole: the role's working dashboard. For customers
 *   that is /dashboard (their orders/favorites hub), not /.
 * - getAccountRouteForRole: where the Account entry points (bottom nav,
 *   header user button) lead. Staff roles land on their dashboard;
 *   customers land on account settings. Unknown → /auth.
 */

export type AppRole = "CUSTOMER" | "VENDOR" | "DELIVERY_PARTNER" | "ADMIN" | "SUPER_ADMIN";

export function getHomeRouteForRole(role?: string | null): string {
  switch (role) {
    case "VENDOR":
      return "/vendor/dashboard";
    case "DELIVERY_PARTNER":
      return "/rider/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    case "SUPER_ADMIN":
      return "/super-admin/dashboard";
    default:
      return "/";
  }
}

export function getDashboardRouteForRole(role?: string | null): string {
  if (role === "CUSTOMER" || !role) return "/dashboard";
  return getHomeRouteForRole(role);
}

export function getAccountRouteForRole(role?: string | null): string {
  if (!role) return "/auth";
  if (role === "CUSTOMER") return "/account/profile";
  return getHomeRouteForRole(role);
}

/** Roles that use the consumer storefront tabs (cart, saved, favorites). */
export function usesConsumerTabs(role?: string | null): boolean {
  return !role || role === "CUSTOMER" || role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Orders destination for footer/drawer shortcuts. */
export function getOrdersRouteForRole(role?: string | null): string {
  if (role === "VENDOR") return "/vendor/orders";
  if (role === "DELIVERY_PARTNER") return "/rider/dashboard";
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "SUPER_ADMIN") return "/super-admin/dashboard";
  return "/dashboard?tab=orders";
}
