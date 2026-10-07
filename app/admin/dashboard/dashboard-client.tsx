"use client";

import Link from "next/link";
import AdminDashboardShell from "@/components/AdminDashboardShell";
import { AdminSignIn, naira } from "@/components/AdminShell";
import { ApiRequestError, updateAdminPayout, type AdminDashboard } from "@/lib/savora-api";
import { useAdminDashboard } from "@/lib/api/hooks";
import VendorApprovalPanel from "../vendors/approval-panel";
import { useState } from "react";

function formatMoney(value: number): string {
  return naira(value);
}

function StatCards({ stats }: { stats: AdminDashboard["stats"] }) {
  return (
    <section className="admin-stats" aria-label="Platform stats">
      <div className="admin-stat hot">
        <small>Pending vendors</small>
        <strong>{stats.pendingVendors}</strong>
        <span className="delta">
          <Link href="/admin/vendors?tab=pending" style={{ color: "inherit", textDecoration: "underline" }}>
            Needs review
          </Link>
        </span>
      </div>
      <div className="admin-stat">
        <small>Total revenue (this month)</small>
        <strong>{formatMoney(stats.revenueMonth)}</strong>
        <span className="delta">Platform earnings: {formatMoney(stats.platformEarningsMonth)}</span>
      </div>
      <div className="admin-stat">
        <small>Orders today</small>
        <strong>{stats.ordersToday}</strong>
        <span className="delta">{stats.paidToday} paid</span>
      </div>
      <div className="admin-stat">
        <small>Active riders</small>
        <strong>{stats.activeRiders}</strong>
        <span className="delta">{stats.ridersOnDelivery} on delivery</span>
      </div>
      <div className="admin-stat">
        <small>Failed payouts</small>
        <strong>{stats.failedPayouts}</strong>
        <span className="delta bad">
          <Link href="/admin/payouts" style={{ color: "inherit", textDecoration: "underline" }}>
            Retry now
          </Link>
        </span>
      </div>
    </section>
  );
}

function PayoutsPanel({
  data,
  onChanged,
}: {
  data: AdminDashboard["payoutsNeedingAction"];
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const empty =
    data.failedWithdrawals.length === 0 &&
    data.heldPayouts.length === 0 &&
    data.pendingWithdrawals.length === 0;

  async function retryHeldPayout(id: string) {
    setError("");
    setBusyId(id);
    try {
      // Re-queue a failed payout record back to PENDING (audited server-side).
      await updateAdminPayout(id, { status: "PENDING" });
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Retry failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <h2>Payouts needing action</h2>
        <Link className="btn secondary btn-sm" href="/admin/payouts">
          All payouts
        </Link>
      </div>
      {empty ? (
        <div className="empty-state">
          <p className="empty-state-title">All clear</p>
          <p className="empty-state-desc">No failed transfers or held payouts right now.</p>
        </div>
      ) : (
        <ul className="admin-list">
          {data.failedWithdrawals.map((item) => (
            <li key={item.id}>
              <div>
                {item.ownerType === "VENDOR" ? "Vendor" : "Rider"} payout · {formatMoney(item.amount)}
                <small>{item.ownerName}</small>
                <small>Paystack transfer failed{item.failureReason ? `: ${item.failureReason}` : ""}</small>
              </div>
              <Link className="btn secondary btn-sm" href="/admin/payouts">
                Review
              </Link>
            </li>
          ))}
          {data.heldPayouts.map((item) => (
            <li key={item.id}>
              <div>
                {item.vendorName} · {formatMoney(item.net)}
                <small>
                  {item.reference}
                </small>
                <small>
                  <span
                    className={`badge ${item.status === "FAILED" ? "badge-danger" : "badge-warning"}`}
                  >
                    {item.status}
                  </span>
                </small>
              </div>
              {item.status === "FAILED" ? (
                <button
                  className="btn secondary btn-sm"
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void retryHeldPayout(item.id)}
                >
                  {busyId === item.id ? "Retrying…" : "Retry"}
                </button>
              ) : (
                <Link className="btn secondary btn-sm" href="/admin/payouts">
                  Review
                </Link>
              )}
            </li>
          ))}
          {data.pendingWithdrawals.map((item) => (
            <li key={item.id}>
              <div>
                {item.ownerType === "VENDOR" ? "Vendor" : "Rider"} withdrawal · {formatMoney(item.amount)}
                <small>{item.ownerName}</small>
                <small>Awaiting approval</small>
              </div>
              <Link className="btn secondary btn-sm" href="/admin/payouts">
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ActivityPanel({ items }: { items: AdminDashboard["recentActivity"] }) {
  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <h2>Recent admin activity</h2>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No activity yet</p>
          <p className="empty-state-desc">Admin actions will appear here.</p>
        </div>
      ) : (
        <ul className="admin-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="admin-activity-text">
                {item.text}
                <small>{item.detail}</small>
              </div>
              <small style={{ flex: "none" }}>
                {new Date(item.createdAt).toLocaleString("en-NG", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminDashboardClient() {
  const dashboard = useAdminDashboard();

  if (dashboard.isLoading) {
    return (
      <AdminDashboardShell active="overview">
        <section className="admin-stats" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="admin-stat" key={index}>
              <span className="skeleton" style={{ display: "block", height: 16, width: "60%" }} />
              <span className="skeleton" style={{ display: "block", height: 28, marginTop: 8 }} />
            </div>
          ))}
        </section>
        <p className="muted">Loading dashboard…</p>
      </AdminDashboardShell>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    const status = dashboard.error instanceof ApiRequestError ? dashboard.error.status : undefined;
    if (status === 401 || status === 403) return <AdminSignIn />;
    return (
      <AdminDashboardShell active="overview">
        <div className="empty-state" role="alert">
          <p className="empty-state-title">Couldn&apos;t load the dashboard</p>
          <p className="empty-state-desc">
            {dashboard.error instanceof Error ? dashboard.error.message : "Try again."}
          </p>
          <button className="btn" type="button" onClick={() => dashboard.refetch()}>
            Retry
          </button>
        </div>
      </AdminDashboardShell>
    );
  }

  const data = dashboard.data;

  return (
    <AdminDashboardShell
      active="overview"
      pendingVendors={data.stats.pendingVendors}
      failedPayouts={data.stats.failedPayouts}
      adminName={data.admin.firstName}
      adminEmail={data.admin.email}
    >
      <StatCards stats={data.stats} />

      <div className="admin-grid">
        <section className="admin-card" aria-label="Vendor approvals">
          <div className="admin-card-head">
            <h2>Vendor approvals</h2>
            <Link className="btn secondary btn-sm" href="/admin/vendors">
              View all
            </Link>
          </div>
          <VendorApprovalPanel limit={8} showPager={false} />
        </section>

        <div className="admin-side-col">
          <PayoutsPanel data={data.payoutsNeedingAction} onChanged={() => dashboard.refetch()} />
          <ActivityPanel items={data.recentActivity} />
        </div>
      </div>
    </AdminDashboardShell>
  );
}
