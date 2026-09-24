"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PageShell from "@/components/PageShell";
import SignOutButton from "@/components/SignOutButton";
import { naira } from "@/components/VendorShell";
import type { RiderProfile } from "@/lib/savora-api";

export { naira };

const LINKS: [string, string][] = [
  ["Dashboard", "/rider/dashboard"],
  ["Deliveries", "/rider/deliveries"],
  ["Earnings", "/rider/earnings"],
  ["Profile", "/rider/profile"],
];

export function RiderNav() {
  const pathname = usePathname();
  return (
    <nav className="vendor-tabs" aria-label="Rider">
      {LINKS.map(([label, href]) => {
        const active = pathname === href || (href !== "/rider/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link key={href} href={href} className={`vendor-tab${active ? " selected" : ""}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function RiderShell({ profile, title, sub, children }: {
  profile: RiderProfile;
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
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`badge ${profile.status === "ACTIVE" ? "badge-success" : "badge"}`}>
              {profile.status === "ACTIVE" ? "Online" : "Offline"}
            </span>
            <span
              className={`badge ${profile.verificationStatus === "APPROVED" ? "badge-success" : "badge-warning"}`}
            >
              {profile.verificationStatus}
            </span>
            <SignOutButton />
          </span>
        </div>
        {profile.verificationStatus !== "APPROVED" && (
          <p className="auth-success" role="note">
            Your rider application is {profile.verificationStatus.toLowerCase()}.{" "}
            <Link href="/rider/profile">Upload your documents</Link> to get verified and start accepting jobs.
          </p>
        )}
        <RiderNav />
        {children}
      </section>
    </PageShell>
  );
}

export function RiderSignIn() {
  return (
    <PageShell>
      <section className="section container">
        <h1>Rider dashboard</h1>
        <p className="muted">Please sign in with your rider account.</p>
        <Link className="btn" href="/login?next=/rider/dashboard">Sign in</Link>
      </section>
    </PageShell>
  );
}

export function deliveryBadge(status: string): string {
  if (status === "DELIVERED") return "badge-success";
  if (status === "FAILED") return "badge-danger";
  if (status === "ASSIGNED") return "badge-warning";
  return "badge-info";
}
