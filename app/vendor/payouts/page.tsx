"use client";

import { VendorShell, VendorSignIn, naira } from "@/components/VendorShell";
import { useVendorEarnings, useVendorProfile } from "@/lib/api/hooks";

export default function VendorPayoutsPage() {
  const profile = useVendorProfile();
  const earnings = useVendorEarnings();

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;

  return (
    <VendorShell
      profile={profile.data}
      title="Earnings & payouts"
      sub={`Platform commission: ${earnings.data?.commissionRate ?? "—"}% of settled orders.`}
    >
      {earnings.isLoading ? (
        <p className="muted">Loading earnings…</p>
      ) : earnings.data ? (
        <>
          <div className="hero-stats">
            <div className="stat">
              <b>{naira(earnings.data.availableBalance)}</b>
              <span>Available balance</span>
            </div>
            <div className="stat">
              <b>{naira(earnings.data.last30Days.net)}</b>
              <span>Net · last 30 days ({earnings.data.last30Days.orders} orders)</span>
            </div>
            <div className="stat">
              <b>{naira(earnings.data.lifetime.net)}</b>
              <span>Lifetime net ({earnings.data.lifetime.orders} orders)</span>
            </div>
            <div className="stat">
              <b>{naira(earnings.data.paidOut)}</b>
              <span>Total paid out</span>
            </div>
          </div>

          <h2 style={{ marginTop: 32 }}>Payout history</h2>
          {earnings.data.payouts.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No payouts yet</p>
              <p className="empty-state-desc">
                Settled earnings accumulate in your available balance. Payouts are processed by the Savora Food finance
                team.
              </p>
            </div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
              {earnings.data.payouts.map((payout) => (
                <div className="card card-body" key={payout.id}>
                  <div className="row">
                    <div>
                      <strong>{payout.reference}</strong>
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        {[payout.periodStart, payout.periodEnd].filter(Boolean).join(" → ") || "Ad-hoc"} · Gross{" "}
                        {naira(payout.gross)} · Commission {naira(payout.commission)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: "0 0 6px" }}>
                        <strong className="price">{naira(payout.net)}</strong>
                      </p>
                      <span
                        className={`badge ${payout.status === "PAID" ? "badge-success" : payout.status === "FAILED" ? "badge-danger" : "badge-warning"}`}
                      >
                        {payout.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="auth-error">Could not load earnings.</p>
      )}
    </VendorShell>
  );
}
