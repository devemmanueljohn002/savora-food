"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import SignOutButton from "@/components/SignOutButton";

export type AdminNavKey = "overview" | "vendors" | "riders" | "orders" | "payouts" | "customers" | "settings";

const NAV: { key: AdminNavKey; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/admin/dashboard" },
  { key: "vendors", label: "Vendors", href: "/admin/vendors" },
  { key: "riders", label: "Riders", href: "/admin/riders" },
  { key: "orders", label: "Orders", href: "/admin/orders" },
  { key: "payouts", label: "Payouts", href: "/admin/payouts" },
  { key: "customers", label: "Customers", href: "/admin/customers" },
  { key: "settings", label: "Settings", href: "/admin/settings" },
];

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Admin console shell: dark sidebar on desktop (top nav on mobile),
 * greeting top bar, live badge counts. Badges come from real queries
 * passed in by the page — never hardcoded.
 */
export default function AdminDashboardShell({
  active,
  pendingVendors,
  failedPayouts,
  adminName,
  adminEmail,
  children,
}: {
  active: AdminNavKey;
  pendingVendors?: number;
  failedPayouts?: number;
  adminName?: string | null;
  adminEmail?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const displayName = adminName?.trim() || adminEmail?.split("@")[0] || "Admin";
  const initial = displayName.trim().charAt(0).toUpperCase() || "A";

  function badgeFor(key: AdminNavKey): number | null {
    if (key === "vendors") return pendingVendors ?? null;
    if (key === "payouts") return failedPayouts ?? null;
    return null;
  }

  return (
    <div className="admin-app">
      <aside className="admin-side">
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true" />
          Savora Admin
        </div>
        <nav className="admin-nav" aria-label="Admin">
          {NAV.map((item) => {
            const selected = active === item.key || (active === "overview" && pathname === item.href);
            const badge = badgeFor(item.key);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`admin-nav-link${selected ? " on" : ""}`}
                aria-current={selected ? "page" : undefined}
              >
                <span>{item.label}</span>
                {badge !== null && badge > 0 && <b className="admin-nav-badge">{badge}</b>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="admin-main">
        <div className="admin-top">
          <div>
            <h1 className="admin-title">
              {greetingFor(new Date())}, {displayName}
            </h1>
            <p className="admin-sub">What needs your attention today</p>
          </div>
          <div className="admin-me">
            <SignOutButton className="btn secondary btn-sm" />
            <span className="avatar admin-avatar" aria-hidden="true">
              {initial}
            </span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
