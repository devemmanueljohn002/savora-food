"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PageShell from "@/components/PageShell";
import SignOutButton from "@/components/SignOutButton";
import { naira } from "@/components/VendorShell";

export { naira };

const LINKS: [string, string][] = [
  ["Dashboard", "/super-admin/dashboard"],
  ["Admins", "/super-admin/admins"],
  ["Settings", "/super-admin/settings"],
  ["Audit log", "/super-admin/audit"],
  ["Analytics", "/super-admin/analytics"],
];

export function SuperAdminNav() {
  const pathname = usePathname();
  return (
    <nav className="vendor-tabs" aria-label="Super admin">
      {LINKS.map(([label, href]) => {
        const active = pathname === href || (href !== "/super-admin/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link key={href} href={href} className={`vendor-tab${active ? " selected" : ""}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SuperAdminShell({ title, sub, children }: {
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
        <SuperAdminNav />
        {children}
      </section>
    </PageShell>
  );
}

export function SuperAdminSignIn() {
  return (
    <PageShell>
      <section className="section container">
        <h1>Super admin</h1>
        <p className="muted">Please sign in with a super admin account.</p>
        <Link className="btn" href="/login?next=/super-admin/dashboard">Sign in</Link>
      </section>
    </PageShell>
  );
}
