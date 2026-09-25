"use client";

import Link from "next/link";
import PageShell from "@/components/PageShell";
import VendorNav from "@/components/VendorNav";
import SignOutButton from "@/components/SignOutButton";
import type { VendorProfile } from "@/lib/savora-api";

export function VendorShell({ profile, title, sub, children }: {
  profile: VendorProfile;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <section className="section container">
        <div className="row" style={{ alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <h1 style={{ margin: 0 }}>{title}</h1>
            {sub ? <p className="section-sub" style={{ marginTop: 8, marginBottom: 0 }}>{sub}</p> : null}
          </div>
          <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`badge ${profile.status === "APPROVED" ? "badge-success" : "badge-warning"}`}>
              {profile.status.replaceAll("_", " ")}
            </span>
            <SignOutButton />
          </span>
        </div>
        {profile.status !== "APPROVED" && (
          <p className="auth-success" role="note">
            Your kitchen is under review. Complete your <Link href="/vendor/onboarding">business profile</Link> — an
            admin will approve it before it goes live.
          </p>
        )}
        <VendorNav />
        {children}
      </section>
    </PageShell>
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

export function orderBadge(status: string): string {
  if (status === "DELIVERED") return "badge-success";
  if (status === "CANCELLED" || status === "REFUNDED") return "badge-danger";
  if (status === "PENDING_PAYMENT") return "badge-warning";
  return "badge-info";
}
