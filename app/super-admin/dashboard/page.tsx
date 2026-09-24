"use client";

import Link from "next/link";
import { SuperAdminShell, SuperAdminSignIn, naira } from "@/components/SuperAdminShell";
import { useAdminOverview } from "@/lib/api/hooks";
import { useSuperAdmins } from "@/lib/api/hooks";

export default function SuperAdminDashboardPage() {
  const overview = useAdminOverview();
  const admins = useSuperAdmins({ limit: 5 });

  if (overview.isLoading) {
    return (
      <SuperAdminShell title="Platform control">
        <p className="muted">Loading…</p>
      </SuperAdminShell>
    );
  }
  if (overview.isError || !overview.data) return <SuperAdminSignIn />;

  const data = overview.data;
  const maxRevenue = Math.max(1, ...data.revenueByDay.map((row) => row.gross));

  return (
    <SuperAdminShell title="Platform control" sub="Fullest access: admins, settings, audit and analytics.">
      <div className="hero-stats">
        <div className="stat">
          <b>{naira(data.last30Days.gross)}</b>
          <span>GMV · 30 days ({data.last30Days.orders} orders)</span>
        </div>
        <div className="stat">
          <b>{naira(data.today.gross)}</b>
          <span>Today ({data.today.orders} orders)</span>
        </div>
        <div className="stat">
          <b>{admins.data?.total ?? "—"}</b>
          <span>Admin accounts</span>
        </div>
        <div className="stat">
          <b>{data.openCatering}</b>
          <span>Open catering requests</span>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 32 }}>
        <div>
          <h2>Revenue · last 14 days</h2>
          <div className="card card-body">
            {data.revenueByDay.map((row) => (
              <div key={row.day} style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0" }}>
                <span className="muted" style={{ width: 90, flex: "none", fontSize: 13 }}>{row.day.slice(5)}</span>
                <span
                  aria-hidden="true"
                  style={{
                    display: "block",
                    height: 14,
                    borderRadius: 7,
                    background: "linear-gradient(90deg,var(--orange),var(--gold))",
                    width: `${Math.max(2, Math.round((row.gross / maxRevenue) * 100))}%`,
                  }}
                />
                <span style={{ fontSize: 13 }}>{naira(row.gross)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2>Quick links</h2>
          <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
            <Link className="card card-body" href="/super-admin/admins">
              <strong>Manage admins</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>Create, promote, suspend and audit admin accounts.</p>
            </Link>
            <Link className="card card-body" href="/super-admin/settings">
              <strong>Platform settings</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>Payments, commission, delivery and country config.</p>
            </Link>
            <Link className="card card-body" href="/super-admin/audit">
              <strong>Audit log</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>Every admin action, who did it and when.</p>
            </Link>
            <Link className="card card-body" href="/super-admin/analytics">
              <strong>Analytics</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>GMV trends, top vendors, categories and growth.</p>
            </Link>
            <Link className="card card-body" href="/admin/dashboard">
              <strong>Admin dashboard →</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>Super admins can use the full admin surface too.</p>
            </Link>
          </div>
        </div>
      </div>
    </SuperAdminShell>
  );
}
