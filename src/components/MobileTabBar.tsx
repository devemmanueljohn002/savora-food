"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  CalendarDays,
  ClipboardList,
  Heart,
  Home,
  LayoutDashboard,
  Package,
  Search,
  ShoppingCart,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import CartCount from "./CartCount";
import { useCurrentUser } from "@/lib/api/hooks";
import {
  getAccountRouteForRole,
  getHomeRouteForRole,
  isVendorPortalRoute,
  usesConsumerTabs,
} from "@/lib/role-routes";

type MobileTab = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  badge?: boolean;
};

/**
 * Fixed bottom tab bar for mobile (Lovable-style). Hidden on desktop where
 * the full header nav is available. Mounted in PageShell after the footer.
 *
 * Vendor portal routes get a vendor-only set of destinations; they never
 * point at the consumer homepage, search, or account overview. Other roles
 * keep the role-aware storefront tabs (cart/saved are customer-only).
 */
function MobileTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: currentUser, isLoading } = useCurrentUser();
  const role = isLoading ? undefined : (currentUser?.role ?? null);
  const showConsumerTabs = usesConsumerTabs(role);
  const accountHref = getAccountRouteForRole(role);
  const homeHref = isLoading ? "/" : getHomeRouteForRole(role ?? undefined);
  const dashboardTab = pathname === "/dashboard" ? (searchParams.get("tab") ?? "overview") : null;

  if (isVendorPortalRoute(pathname)) {
    const vendorTabs: MobileTab[] = [
      {
        key: "dashboard",
        label: "Dashboard",
        href: "/vendor/dashboard",
        icon: LayoutDashboard,
        active: pathname.startsWith("/vendor/dashboard"),
      },
      {
        key: "orders",
        label: "Orders",
        href: "/vendor/orders",
        icon: ClipboardList,
        active: pathname.startsWith("/vendor/orders"),
      },
      {
        key: "products",
        label: "Products",
        href: "/vendor/products",
        icon: Package,
        active: pathname.startsWith("/vendor/products"),
      },
      {
        key: "schedule",
        label: "Schedule",
        href: "/vendor/schedule",
        icon: CalendarDays,
        active: pathname.startsWith("/vendor/schedule"),
      },
      {
        key: "account",
        label: "Account",
        href: "/vendor/profile",
        icon: UserRound,
        active:
          pathname.startsWith("/vendor/profile") ||
          pathname.startsWith("/vendor/payouts") ||
          pathname.startsWith("/vendor/onboarding"),
      },
    ];

    return (
      <nav className="mtab" aria-label="Vendor navigation">
        {vendorTabs.map(({ key, label, href, icon: Icon, active }) => (
          <Link
            key={key}
            href={href}
            className={active ? "mtab-link active" : "mtab-link"}
            aria-current={active ? "page" : undefined}
          >
            <span className="mtab-ico-wrap">
              <Icon className="mtab-ico" aria-hidden="true" />
            </span>
            <span className="mtab-label">{label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  const accountActive =
    role === "VENDOR"
      ? pathname.startsWith("/vendor")
      : role === "DELIVERY_PARTNER"
        ? pathname.startsWith("/rider")
        : role === "ADMIN" || role === "SUPER_ADMIN"
          ? pathname.startsWith("/admin") ||
            pathname.startsWith("/super-admin") ||
            pathname.startsWith("/account") ||
            dashboardTab === "overview"
          : pathname.startsWith("/account") || (dashboardTab !== null && dashboardTab !== "favorites");

  const tabs: MobileTab[] = [
    { key: "home", label: "Home", href: homeHref, icon: Home, active: pathname === "/" || (homeHref !== "/" && pathname.startsWith(homeHref)) },
    { key: "search", label: "Search", href: "/search", icon: Search, active: pathname.startsWith("/search") },
    ...(showConsumerTabs
      ? [
          {
            key: "cart",
            label: "Cart",
            href: "/cart",
            icon: ShoppingCart,
            active: pathname.startsWith("/cart"),
            badge: true,
          },
          {
            key: "saved",
            label: "Saved",
            href: "/dashboard?tab=favorites",
            icon: Heart,
            active: dashboardTab === "favorites",
          },
        ]
      : []),
    {
      // Stable key on purpose: the label flips between "Login" and "Account"
      // when the auth query resolves, and remounting the link mid-tap swallows
      // the click on mobile (touchstart lands on a node React then replaces).
      key: "account",
      label: currentUser ? "Account" : "Login",
      href: accountHref,
      icon: UserRound,
      active: accountActive,
    },
  ];

  return (
    <nav className="mtab" aria-label="Mobile tabs">
      {tabs.map(({ key, label, href, icon: Icon, active, badge }) => (
        <Link
          key={key}
          href={href}
          className={active ? "mtab-link active" : "mtab-link"}
          aria-current={active ? "page" : undefined}
        >
          <span className="mtab-ico-wrap">
            <Icon className="mtab-ico" aria-hidden="true" />
            {badge ? <CartCount /> : null}
          </span>
          <span className="mtab-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default function MobileTabBar() {
  return (
    <Suspense>
      <MobileTabs />
    </Suspense>
  );
}
