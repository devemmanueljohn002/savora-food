"use client";

import Link from "next/link";
import { VendorShell, VendorSignIn, naira } from "@/components/VendorShell";
import { useVendorAnalytics, useVendorEarnings, useVendorOrders, useVendorCatering, useVendorProfile } from "@/lib/api/hooks";

export default function VendorDashboardPage() {
  const profile = useVendorProfile();
  const earnings = useVendorEarnings();
  const analytics = useVendorAnalytics();
  const orders = useVendorOrders({ limit: 5 });
  const catering = useVendorCatering();

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading your vendor dashboard…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;

  const pendingOrders = (orders.data?.items ?? []).filter((order) =>
    ["PAID", "VENDOR_ACCEPTED", "CONFIRMED", "PREPARING"].includes(order.status),
  );
  const openCatering = (catering.data ?? []).filter((request) =>
    ["SUBMITTED", "UNDER_REVIEW"].includes(request.status),
  );

  return (
    <VendorShell profile={profile.data} title={profile.data.businessName} sub="Here is what is happening in your kitchen today.">
      <div className="hero-stats">
        <div className="stat">
          <b>{earnings.data ? naira(earnings.data.last30Days.gross) : "—"}</b>
          <span>Revenue · last 30 days</span>
        </div>
        <div className="stat">
          <b>{earnings.data?.last30Days.orders ?? "—"}</b>
          <span>Orders · last 30 days</span>
        </div>
        <div className="stat">
          <b>{pendingOrders.length}</b>
          <span>Orders needing action</span>
        </div>
        <div className="stat">
          <b>{openCatering.length}</b>
          <span>Catering requests awaiting quote</span>
        </div>
        <div className="stat">
          <b>★ {(analytics.data?.rating.average ?? 0).toFixed(1)}</b>
          <span>{analytics.data?.rating.count ?? 0} reviews</span>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 32 }}>
        <div>
          <div className="row">
            <h2 style={{ margin: 0 }}>Orders needing action</h2>
            <Link href="/vendor/orders">View all</Link>
          </div>
          {orders.isLoading ? (
            <p className="muted">Loading…</p>
          ) : pendingOrders.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">All caught up</p>
              <p className="empty-state-desc">New paid orders will appear here.</p>
            </div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
              {pendingOrders.map((order) => (
                <div className="card card-body" key={order.id}>
                  <div className="row">
                    <div>
                      <Link href={`/vendor/orders/${order.id}`}>
                        <strong>{order.orderNumber}</strong>
                      </Link>
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        {order.customerName} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"} ·{" "}
                        {naira(order.total)}
                      </p>
                    </div>
                    <span className="badge badge-info">{order.status.replaceAll("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="row">
            <h2 style={{ margin: 0 }}>Catering requests</h2>
            <Link href="/vendor/catering">View all</Link>
          </div>
          {catering.isLoading ? (
            <p className="muted">Loading…</p>
          ) : openCatering.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No open requests</p>
              <p className="empty-state-desc">New event requests will appear here for quoting.</p>
            </div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
              {openCatering.slice(0, 5).map((request) => (
                <div className="card card-body" key={request.id}>
                  <div className="row">
                    <div>
                      <Link href={`/vendor/catering/${request.id}`}>
                        <strong>{request.eventType}</strong>
                      </Link>
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        {request.eventDate} · {request.guestCount} guests · {request.fullName}
                      </p>
                    </div>
                    <span className="badge badge-warning">{request.status.replaceAll("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(analytics.data?.lowStock.length ?? 0) > 0 && (
            <>
              <h2 style={{ marginTop: 24 }}>Low stock</h2>
              <div className="card card-body">
                {analytics.data?.lowStock.map((item) => (
                  <p key={item.id} style={{ margin: "6px 0" }}>
                    <Link href={`/vendor/products/${item.id}`}>{item.name}</Link>{" "}
                    <span className="badge badge-warning">{item.stock_quantity} left</span>
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </VendorShell>
  );
}
