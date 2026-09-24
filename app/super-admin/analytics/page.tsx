"use client";

import Link from "next/link";
import { SuperAdminShell, SuperAdminSignIn, naira } from "@/components/SuperAdminShell";
import { useSuperAnalytics } from "@/lib/api/hooks";

export default function SuperAdminAnalyticsPage() {
  const analytics = useSuperAnalytics();

  if (analytics.isLoading) {
    return (
      <SuperAdminShell title="Analytics">
        <p className="muted">Loading analytics…</p>
      </SuperAdminShell>
    );
  }
  if (analytics.isError || !analytics.data) return <SuperAdminSignIn />;

  const data = analytics.data;
  const maxGmv = Math.max(1, ...data.gmvByDay.map((row) => row.gross));
  const maxVendor = Math.max(1, ...data.topVendors.map((row) => row.gross));

  return (
    <SuperAdminShell title="Analytics" sub="GMV, leaders and growth across the marketplace.">
      <h2>GMV · last 90 days</h2>
      <div className="card card-body">
        {data.gmvByDay.length === 0 ? (
          <p className="muted">No settled orders in this window.</p>
        ) : (
          data.gmvByDay.map((row) => (
            <div key={row.day} style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0" }}>
              <span className="muted" style={{ width: 90, flex: "none", fontSize: 13 }}>{row.day.slice(5)}</span>
              <span
                aria-hidden="true"
                style={{
                  display: "block",
                  height: 14,
                  borderRadius: 7,
                  background: "linear-gradient(90deg,var(--orange),var(--gold))",
                  width: `${Math.max(2, Math.round((row.gross / maxGmv) * 100))}%`,
                }}
              />
              <span style={{ fontSize: 13 }}>
                {naira(row.gross)} · {row.orders} orders · {naira(row.commission)} commission
              </span>
            </div>
          ))
        )}
      </div>

      <div className="two-col" style={{ marginTop: 24 }}>
        <div>
          <h2>Top vendors · 30 days</h2>
          <div className="card card-body">
            {data.topVendors.length === 0 ? (
              <p className="muted">No vendor revenue yet.</p>
            ) : (
              data.topVendors.map((row) => (
                <div key={row.id} style={{ margin: "8px 0" }}>
                  <div className="row">
                    <Link href={`/vendor/${row.slug}`}>
                      <strong>{row.businessName}</strong>
                    </Link>
                    <span style={{ fontSize: 13 }}>
                      {naira(row.gross)} · {row.orders} orders
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "block",
                      height: 8,
                      borderRadius: 4,
                      background: "#f1ede7",
                      marginTop: 4,
                      position: "relative",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "block",
                        height: 8,
                        borderRadius: 4,
                        background: "var(--orange)",
                        width: `${Math.max(2, Math.round((row.gross / maxVendor) * 100))}%`,
                      }}
                    />
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2>Top categories · 30 days</h2>
          <div className="card card-body">
            {data.topCategories.length === 0 ? (
              <p className="muted">No category revenue yet.</p>
            ) : (
              data.topCategories.map((row) => (
                <div key={row.name} className="row" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{row.name}</span>
                  <span style={{ fontSize: 13 }}>
                    {naira(row.gross)} · {row.orders} items
                  </span>
                </div>
              ))
            )}
          </div>

          <h2 style={{ marginTop: 24 }}>User growth · weekly</h2>
          <div className="card card-body">
            {data.userGrowth.length === 0 ? (
              <p className="muted">No signups in this window.</p>
            ) : (
              data.userGrowth.map((row) => (
                <div key={row.week} className="row" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span className="muted" style={{ fontSize: 13 }}>w/c {row.week}</span>
                  <span style={{ fontSize: 13 }}>
                    +{row.customers} customers · +{row.vendors} vendors
                  </span>
                </div>
              ))
            )}
          </div>

          <h2 style={{ marginTop: 24 }}>Catering pipeline</h2>
          <div className="card card-body">
            {data.cateringByStatus.length === 0 ? (
              <p className="muted">No catering requests yet.</p>
            ) : (
              data.cateringByStatus.map((row) => (
                <div key={row.status} className="row" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{row.status.replaceAll("_", " ")}</span>
                  <strong>{row.count}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </SuperAdminShell>
  );
}
