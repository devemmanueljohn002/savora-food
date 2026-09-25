"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PageShell from "@/components/PageShell";
import SignOutButton from "@/components/SignOutButton";
import { naira, orderBadge } from "@/components/VendorShell";

export { naira, orderBadge };

const LINKS: [string, string][] = [
  ["Dashboard", "/admin/dashboard"],
  ["Vendors", "/admin/vendors"],
  ["Riders", "/admin/riders"],
  ["Customers", "/admin/customers"],
  ["Orders", "/admin/orders"],
  ["Products", "/admin/products"],
  ["Payouts", "/admin/payouts"],
  ["Coupons", "/admin/coupons"],
  ["Settings", "/admin/settings"],
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="vendor-tabs" aria-label="Admin">
      {LINKS.map(([label, href]) => {
        const active = pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link key={href} href={href} className={`vendor-tab${active ? " selected" : ""}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ title, sub, children }: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <section className="section container">
        <div className="row" style={{ alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <h1 style={{ margin: "0 0 6px" }}>{title}</h1>
            {sub ? <p className="section-sub" style={{ marginTop: 0 }}>{sub}</p> : null}
          </div>
          <SignOutButton />
        </div>
        <AdminNav />
        {children}
      </section>
    </PageShell>
  );
}

export function AdminSignIn() {
  return (
    <PageShell>
      <section className="section container">
        <h1>Admin</h1>
        <p className="muted">Please sign in with an admin account.</p>
        <Link className="btn" href="/auth?next=/admin/dashboard">Sign in</Link>
      </section>
    </PageShell>
  );
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="row" style={{ marginTop: 16 }}>
      <button className="btn secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page} of {totalPages}
      </span>
      <button className="btn secondary btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
