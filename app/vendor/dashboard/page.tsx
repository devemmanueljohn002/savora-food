"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Star, Wallet } from "lucide-react";
import { VendorShell, VendorSignIn, naira } from "@/components/VendorShell";
import RoleGuard from "@/components/RoleGuard";
import {
  useUpdateVendorAvailability,
  useVendorAnalytics,
  useVendorCatering,
  useVendorEarnings,
  useVendorOrders,
  useVendorProfile,
  useVendorSchedule,
  useVendorWithdrawals,
} from "@/lib/api/hooks";
import { describeAvailability } from "@/lib/lagos-time";

/**
 * Vendor dashboard = overview only. Order:
 * header (kitchen name, Approved badge, live status + toggle)
 * → KPI cards → "Needs attention" + wallet → low stock.
 * Withdrawals live on the Payouts tab; this page only links there.
 */
function StatusHeader({ profileName, isOpen, nextChange }: { profileName: string; isOpen: boolean; nextChange: string | null }) {
  const update = useUpdateVendorAvailability();
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    try {
      await update.mutateAsync({ isOpen: !isOpen });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change your status. Try again.");
    }
  }

  return (
    <div className="card card-body vendor-status" role="status" aria-live="polite">
      <div className="row">
        <div>
          <p className="vendor-status-kitchen">{profileName}</p>
          <span className={`badge ${isOpen ? "badge-success" : "badge-danger"}`}>
            {describeAvailability(isOpen, nextChange)}
          </span>
          {error && (
            <p className="auth-error" role="alert" style={{ margin: "8px 0 0" }}>
              {error}
            </p>
          )}
        </div>
        <button className="btn" type="button" disabled={update.isPending} onClick={toggle}>
          {update.isPending ? "Updating…" : isOpen ? "Close kitchen" : "Open kitchen"}
        </button>
      </div>
    </div>
  );
}

export default function VendorDashboardPage() {
  const profile = useVendorProfile();
  const schedule = useVendorSchedule();
  const earnings = useVendorEarnings();
  const analytics = useVendorAnalytics();
  const orders = useVendorOrders({ limit: 50 });
  const catering = useVendorCatering();
  const withdrawals = useVendorWithdrawals();

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

  // Same computed availability customers are gated on, so the banner always
  // matches what shoppers see.
  const liveOpen = schedule.data?.isOpen ?? profile.data.isOpen ?? true;
  const liveNextChange = schedule.data?.nextChange ?? null;

  const pendingOrders = (orders.data?.items ?? []).filter((order) =>
    ["PAID", "VENDOR_ACCEPTED", "PREPARING"].includes(order.status),
  );
  const openCatering = (catering.data ?? []).filter((request) =>
    ["SUBMITTED", "UNDER_REVIEW"].includes(request.status),
  );
  const attentionCount = pendingOrders.length + openCatering.length;

  const ratingCount = analytics.data?.rating.count ?? 0;
  const ratingAverage = analytics.data?.rating.average ?? 0;
  const lowStock = analytics.data?.lowStock ?? [];

  const availableKobo = withdrawals.data?.availableKobo ?? 0;
  const pendingKobo = withdrawals.data?.pendingKobo ?? 0;

  return (
    <RoleGuard allow={["VENDOR", "ADMIN"]}>
      <VendorShell profile={profile.data} title="Dashboard" sub="Here is what is happening in your kitchen today.">
        <StatusHeader profileName={profile.data.businessName} isOpen={liveOpen} nextChange={liveNextChange} />

        <div className="vendor-kpis">
          <div className="card card-body vendor-kpi">
            <span className="vendor-kpi-label">Revenue · last 30 days</span>
            <strong className="vendor-kpi-value">{earnings.data ? naira(earnings.data.last30Days.gross) : "—"}</strong>
          </div>
          <div className="card card-body vendor-kpi">
            <span className="vendor-kpi-label">Orders · last 30 days</span>
            <strong className="vendor-kpi-value">{earnings.data?.last30Days.orders ?? "—"}</strong>
          </div>
          <div className="card card-body vendor-kpi">
            <span className="vendor-kpi-label">Rating</span>
            <strong className="vendor-kpi-value">
              {ratingCount === 0 ? (
                <span className="vendor-kpi-empty">No reviews yet</span>
              ) : (
                <>★ {ratingAverage.toFixed(1)} <span className="muted">({ratingCount})</span></>
              )}
            </strong>
          </div>
        </div>

        <div className="vendor-grid-2">
          <section className="card card-body" aria-label="Needs attention">
            <div className="row">
              <h2>Needs attention</h2>
              {attentionCount > 0 ? <span className="badge badge-warning">{attentionCount}</span> : null}
            </div>
            {orders.isLoading || catering.isLoading ? (
              <p className="muted">Loading…</p>
            ) : attentionCount === 0 ? (
              <p className="vendor-empty">
                <CheckCircle2 aria-hidden="true" /> All caught up — no orders or requests need action.
              </p>
            ) : (
              <div className="vendor-attention-list">
                {pendingOrders.slice(0, 5).map((order) => (
                  <div className="vendor-attention-row" key={order.id}>
                    <AlertCircle aria-hidden="true" />
                    <div>
                      <Link href={`/vendor/orders/${order.id}`}>
                        <strong>{order.orderNumber}</strong>
                      </Link>
                      <p className="muted">
                        {order.customerName} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"} · {naira(order.total)}
                      </p>
                    </div>
                    <span className="badge badge-info">{order.status.replaceAll("_", " ")}</span>
                  </div>
                ))}
                {openCatering.slice(0, 5).map((request) => (
                  <div className="vendor-attention-row" key={request.id}>
                    <Star aria-hidden="true" />
                    <div>
                      <Link href={`/vendor/catering/${request.id}`}>
                        <strong>{request.eventType}</strong>
                      </Link>
                      <p className="muted">
                        {request.eventDate} · {request.guestCount} guests · {request.fullName}
                      </p>
                    </div>
                    <span className="badge badge-warning">{request.status.replaceAll("_", " ")}</span>
                  </div>
                ))}
                <div className="vendor-attention-links">
                  {pendingOrders.length > 0 ? <Link href="/vendor/orders">View orders</Link> : null}
                  {openCatering.length > 0 ? <Link href="/vendor/catering">View catering</Link> : null}
                </div>
              </div>
            )}
          </section>

          <section className="card card-body" aria-label="Wallet summary">
            <div className="row">
              <h2>Wallet</h2>
              <Link href="/vendor/payouts">Payouts</Link>
            </div>
            <div className="vendor-wallet">
              <div>
                <span className="vendor-kpi-label">Available</span>
                <strong className="vendor-kpi-value">{naira(availableKobo / 100)}</strong>
              </div>
              <div>
                <span className="vendor-kpi-label">Pending</span>
                <strong className="vendor-kpi-value">{naira(pendingKobo / 100)}</strong>
              </div>
            </div>
            <Link className="btn vendor-withdraw" href="/vendor/payouts">
              <Wallet aria-hidden="true" /> Withdraw
            </Link>
          </section>
        </div>

        {lowStock.length > 0 ? (
          <section className="card card-body" aria-label="Low stock">
            <div className="row">
              <h2>Low stock</h2>
              <span className="badge badge-warning">{lowStock.length}</span>
            </div>
            <ul className="vendor-stock-list">
              {lowStock.map((item) => (
                <li key={item.id}>
                  <Link href={`/vendor/products/${item.id}`}>{item.name}</Link>{" "}
                  <span className="badge badge-warning">{item.stock_quantity} left</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="vendor-empty">
            <CheckCircle2 aria-hidden="true" /> All stocked up — nothing is running low.
          </p>
        )}
      </VendorShell>
    </RoleGuard>
  );
}
