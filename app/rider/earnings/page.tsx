"use client";

import { RiderShell, RiderSignIn, naira } from "@/components/RiderShell";
import { useRiderEarnings, useRiderProfile } from "@/lib/api/hooks";

export default function RiderEarningsPage() {
  const profile = useRiderProfile();
  const earnings = useRiderEarnings();

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <RiderSignIn />;

  return (
    <RiderShell
      profile={profile.data}
      title="Earnings"
      sub="You keep the delivery fee on every completed trip."
    >
      {earnings.isLoading ? (
        <p className="muted">Loading earnings…</p>
      ) : earnings.data ? (
        <>
          <div className="hero-stats">
            <div className="stat">
              <b>{naira(earnings.data.earned)}</b>
              <span>Total earned ({earnings.data.delivered} trips)</span>
            </div>
            <div className="stat">
              <b>{naira(earnings.data.last7Days.earned)}</b>
              <span>Last 7 days ({earnings.data.last7Days.delivered} trips)</span>
            </div>
            <div className="stat">
              <b>★ {earnings.data.rating.average.toFixed(1)}</b>
              <span>{earnings.data.rating.count} ratings</span>
            </div>
          </div>

          <h2 style={{ marginTop: 32 }}>Last 30 days</h2>
          {earnings.data.byDay.length === 0 ? (
            <p className="muted">No completed trips in the last 30 days.</p>
          ) : (
            <div className="card card-body">
              {earnings.data.byDay.map((row) => (
                <div className="row" key={row.day} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{row.day}</span>
                  <span>
                    {row.trips} trip{row.trips === 1 ? "" : "s"} · <strong>{naira(row.earned)}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 32 }}>Recent trips</h2>
          {earnings.data.recent.length === 0 ? (
            <p className="muted">Completed trips will appear here.</p>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
              {earnings.data.recent.map((trip) => (
                <div className="card card-body" key={trip.id}>
                  <div className="row">
                    <div>
                      <strong>{trip.orderNumber}</strong>
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        {trip.deliveredAt ? new Date(trip.deliveredAt).toLocaleString("en-NG") : ""}
                      </p>
                    </div>
                    <strong className="price">+{naira(trip.deliveryFee)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="auth-error">Could not load earnings.</p>
      )}
    </RiderShell>
  );
}
