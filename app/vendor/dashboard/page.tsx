"use client";

import Link from "next/link";
import { useState } from "react";
import { VendorShell, VendorSignIn, naira } from "@/components/VendorShell";
import RoleGuard from "@/components/RoleGuard";
import { useVendorAnalytics, useVendorEarnings, useVendorOrders, useVendorCatering, useVendorProfile, useVendorWithdrawals, useVendorRecipient, usePayoutBanks, useSaveVendorRecipient, useRequestVendorWithdrawal, useRequestVendorWithdrawalOtp, useUpdateVendorAvailability, useVendorSchedule } from "@/lib/api/hooks";
import PayoutPanel from "@/components/PayoutPanel";
import { resolvePayoutBankAccount } from "@/lib/savora-api";
import { describeAvailability } from "@/lib/lagos-time";

/**
 * Open/Closed ("Accepting Orders") toggle at the top of the vendor
 * dashboard. Shows live schedule status: "Open now · closes at 8:00 PM"
 * or "Closed · opens tomorrow 8:00 AM". Manual toggle overrides schedule.
 */
function AvailabilityToggle({ profileName, isOpen, nextChange, manualOverride }: { 
  profileName: string; 
  isOpen: boolean; 
  nextChange: string | null; 
  manualOverride: "open" | "closed" | null;
}) {
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
    <div className="card card-body" style={{ marginBottom: 20 }} role="status" aria-live="polite">
      <div className="row">
        <div>
          <p className="vendor-status-kitchen" style={{ margin: "0 0 8px", fontWeight: 700 }}>{profileName}</p>
          <span className={`badge ${isOpen ? "badge-success" : "badge-danger"}`}>
            {describeAvailability(isOpen, nextChange)}
          </span>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            {manualOverride === "closed"
              ? "You closed the kitchen manually — the schedule is paused until you reopen."
              : isOpen
                ? "Customers can order from you right now."
                : "Customers see a Closed badge and cannot order until you open."}
          </p>
        </div>
        <button className="btn" type="button" disabled={update.isPending} onClick={toggle}>
          {update.isPending ? "Updating…" : isOpen ? "Close kitchen" : "Open kitchen"}
        </button>
      </div>
      {error && (
        <p className="auth-error" role="alert" style={{ marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function VendorDashboardPage() {
  const profile = useVendorProfile();
  const schedule = useVendorSchedule();
  const earnings = useVendorEarnings();
  const analytics = useVendorAnalytics();
  const orders = useVendorOrders({ limit: 5 });
  const catering = useVendorCatering();
  const withdrawals = useVendorWithdrawals();
  const recipient = useVendorRecipient();
  const banks = usePayoutBanks();
  const saveRecipient = useSaveVendorRecipient();
  const requestWithdrawal = useRequestVendorWithdrawal();
  const requestOtp = useRequestVendorWithdrawalOtp();

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
  const liveManualOverride = schedule.data?.manualOverride ?? null;

  const pendingOrders = (orders.data?.items ?? []).filter((order) =>
    ["PAID", "VENDOR_ACCEPTED", "PREPARING"].includes(order.status),
  );
  const openCatering = (catering.data ?? []).filter((request) =>
    ["SUBMITTED", "UNDER_REVIEW"].includes(request.status),
  );

  return (
    <RoleGuard allow={["VENDOR", "ADMIN"]}>
    <VendorShell profile={profile.data} title={profile.data.businessName} sub="Here is what is happening in your kitchen today.">
      <AvailabilityToggle 
        profileName={profile.data.businessName} 
        isOpen={liveOpen} 
        nextChange={liveNextChange} 
        manualOverride={liveManualOverride} 
      />
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

      <PayoutPanel
        ownerType="VENDOR"
        overview={withdrawals.data ?? null}
        account={recipient.data ?? null}
        banks={banks.data ?? null}
        banksLoading={banks.isLoading}
        banksError={banks.isError ? (banks.error instanceof Error ? banks.error.message : "Could not load banks.") : null}
        onRetryBanks={() => void banks.refetch()}
        availableKobo={withdrawals.data?.availableKobo ?? 0}
        pendingKobo={withdrawals.data?.pendingKobo ?? 0}
        subject="vendor"
        saving={saveRecipient.isPending}
        withdrawing={requestWithdrawal.isPending}
        onResolveAccount={async (input) =>
          resolvePayoutBankAccount({ account_number: input.accountNumber, bank_code: input.bankCode })
        }
        onSaveAccount={(input) => saveRecipient.mutateAsync(input)}
        onRequestOtp={() => requestOtp.mutateAsync()}
        onWithdraw={(input) => requestWithdrawal.mutateAsync(input)}
      />
    </VendorShell>
    </RoleGuard>
  );
}
