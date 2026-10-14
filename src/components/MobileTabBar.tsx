"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Heart, Home, Search, ShoppingCart, UserRound, type LucideIcon } from "lucide-react";
import CartCount from "./CartCount";
import { useCurrentUser } from "@/lib/api/hooks";
import { getAccountRouteForRole, getHomeRouteForRole, usesConsumerTabs } from "@/lib/role-routes";

/**
 * Fixed bottom tab bar for mobile (Lovable-style). Hidden on desktop where
 * the full header nav is available. Mounted in PageShell after the footer.
 *
 * Role-aware: vendors/riders land on their own dashboard from Account and
 * never see the consumer-only Cart/Saved tabs. The active tab is derived
 * from the current pathname (+ dashboard tab query), so nested routes
 * highlight the right tab.
 */
function MobileTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: currentUser, isLoading } = useCurrentUser();
  const role = isLoading ? undefined : (currentUser?.role ?? null);
  const showConsumerTabs = usesConsumerTabs(role);
  const accountHref = getAccountRouteForRole(role);
  // Vendors/riders stay in their own area: Home goes to their dashboard,
  // Account too — they never get bounced to the consumer storefront.
  // Customers keep "/" as before (getHomeRouteForRole returns "/" for them).
  const homeHref = isLoading ? "/" : getHomeRouteForRole(role ?? undefined);
  const dashboardTab = pathname === "/dashboard" ? (searchParams.get("tab") ?? "overview") : null;

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

  const tabs: Array<{
    key: string;
    label: string;
    href: string;
    icon: LucideIcon;
    active: boolean;
    badge?: boolean;
  }> = [
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
