"use client";

import Link from "next/link";
import { AdminShell, AdminSignIn, naira, orderBadge } from "@/components/AdminShell";
import { useAdminOverview } from "@/lib/api/hooks";

export default function AdminDashboardPage() {
  const overview = useAdminOverview();

  if (overview.isLoading) {
    return (
      <AdminShell title="Dashboard">
        <p className="muted">Loading platform overview…</p>
      </AdminShell>
    );
  }
  if (overview.isError || !overview.data) return <AdminSignIn />;

  const data = overview.data;
  const pendingVendors =
    data.vendorsByStatus.find((row) => row.status === "PENDING")?.count ?? 0;
  const pendingRiders =
    data.ridersByVerification.find((row) => row.status === "PENDING")?.count ?? 0;
  const maxRevenue = Math.max(1, ...data.revenueByDay.map((row) => row.gross));

  return (
    <AdminShell title="Dashboard" sub="Platform health at a glance.">
      <div className="hero-stats">
        <div className="stat">
          <b>{naira(data.today.gross)}</b>
          <span>Today · {data.today.orders} orders</span>
        </div>
        <div className="stat">
          <b>{naira(data.last30Days.gross)}</b>
          <span>30 days · {data.last30Days.orders} orders</span>
        </div>
        <div className="stat">
          <b>{pendingVendors}</b>
          <span>Vendors awaiting approval</span>
        </div>
        <div className="stat">
          <b>{pendingRiders}</b>
          <span>Riders awaiting verification</span>
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

          <h2 style={{ marginTop: 24 }}>Approval queues</h2>
          <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="card card-body">
              <div className="row">
                <strong>{pendingVendors} vendor{pendingVendors === 1 ? "" : "s"} pending</strong>
                <Link className="btn secondary btn-sm" href="/admin/vendors?status=PENDING">Review</Link>
              </div>
            </div>
            <div className="card card-body">
              <div className="row">
                <strong>{pendingRiders} rider{pendingRiders === 1 ? "" : "s"} pending</strong>
                <Link className="btn secondary btn-sm" href="/admin/riders?verification=PENDING">Review</Link>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="row">
            <h2 style={{ margin: 0 }}>Recent orders</h2>
            <Link href="/admin/orders">View all</Link>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
            {data.recentOrders.map((order) => (
              <div className="card card-body" key={order.id}>
                <div className="row">
                  <div>
                    <Link href={`/admin/orders/${order.id}`}>
                      <strong>{order.orderNumber}</strong>
                    </Link>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {order.vendorName} · {naira(order.total)}
                    </p>
                  </div>
                  <span className={`badge ${orderBadge(order.status)}`}>{order.status.replaceAll("_", " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
