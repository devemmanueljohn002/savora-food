"use client";

import Link from "next/link";
import PageShell from "@/components/PageShell";
import VendorNav from "@/components/VendorNav";
import SignOutButton from "@/components/SignOutButton";
import type { VendorProfile } from "@/lib/savora-api";

/**
 * Vendor-only shell. Deliberately NOT PageShell: vendor pages show no
 * customer search bar, no customer nav and no customer bottom tab bar —
 * just the vendor top bar plus the single vendor nav (scrollable tab bar
 * on mobile, sticky sidebar on desktop).
 */
export function VendorShell({ profile, title, sub, children }: {
  profile: VendorProfile;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="vendor-shell">
      <header className="vendor-topbar">
        <Link className="vendor-brand" href="/vendor/dashboard" aria-label="Savora Food vendor home">
          <img src="/savora-logo-wide.png" alt="Savora Food" />
          <span className="vendor-brand-tag">Vendor</span>
        </Link>
        <div className="vendor-topbar-right">
          <span className={`badge ${profile.status === "APPROVED" ? "badge-success" : "badge-warning"}`}>
            {profile.status.replaceAll("_", " ")}
          </span>
          <SignOutButton className="btn secondary btn-sm" />
        </div>
      </header>
      <div className="vendor-body">
        <VendorNav />
        <main className="vendor-main">
          <div className="vendor-page-head">
            <h1>{title}</h1>
            {sub ? <p className="muted">{sub}</p> : null}
          </div>
          {profile.status !== "APPROVED" && (
            <p className="auth-success" role="note">
              Your kitchen is under review. Complete your <Link href="/vendor/onboarding">business profile</Link> — an
              admin will approve it before it goes live.
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

export function VendorSignIn() {
  return (
    <PageShell>
      <section className="section container">
        <h1>Vendor dashboard</h1>
        <p className="muted">Please sign in with your vendor account.</p>
        <Link className="btn" href="/auth?next=/vendor/dashboard">Sign in</Link>
      </section>
    </PageShell>
  );
}

export function naira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

/**
 * Consistent NGN display with two decimals everywhere (₦78,502.50, ₦0.00).
 * Display only — never use for stored or transmitted values.
 */
const nairaFormatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function formatNaira(amount: number): string {
  return nairaFormatter.format(Number.isFinite(amount) ? amount : 0);
}

export function orderBadge(status: string): string {
  if (status === "DELIVERED") return "badge-success";
  if (status === "CANCELLED" || status === "REFUNDED") return "badge-danger";
  if (status === "PENDING_PAYMENT") return "badge-warning";
  return "badge-info";
}
