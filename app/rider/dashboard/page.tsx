"use client";

import Link from "next/link";
import { RiderShell, RiderSignIn, deliveryBadge, naira } from "@/components/RiderShell";
import {
  useAcceptRiderJob,
  useDeclineRiderJob,
  useRiderDeliveries,
  useRiderDeliveryAction,
  useRiderEarnings,
  useRiderJobs,
  useRiderProfile,
  useUpdateRiderProfile,
} from "@/lib/api/hooks";
import { useState } from "react";

export default function RiderDashboardPage() {
  const profile = useRiderProfile();
  const jobs = useRiderJobs();
  const active = useRiderDeliveries({ active: true });
  const earnings = useRiderEarnings();
  const accept = useAcceptRiderJob();
  const decline = useDeclineRiderJob();
  const toggleOnline = useUpdateRiderProfile();
  const [error, setError] = useState("");

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading your rider dashboard…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <RiderSignIn />;

  const me = profile.data;
  const online = me.status === "ACTIVE";
  const current = (active.data ?? [])[0] ?? null;
  const PerformAction = current ? (
    <ActiveDeliveryCard deliveryId={current.id} status={current.status} requireOtp={current.requireOtp ?? false} />
  ) : null;

  async function takeJob(orderId: string) {
    setError("");
    try {
      await accept.mutateAsync(orderId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not accept this job.");
    }
  }

  async function passJob(orderId: string) {
    setError("");
    try {
      await decline.mutateAsync(orderId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not decline this job.");
    }
  }

  async function toggle() {
    try {
      await toggleOnline.mutateAsync({ status: online ? "OFFLINE" : "ACTIVE" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change your status.");
    }
  }

  return (
    <RiderShell profile={me} title={`Hello, ${me.name.split(" ")[0]}`} sub="Accept jobs, deliver orders and track earnings.">
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" disabled={toggleOnline.isPending} onClick={toggle}>
          {toggleOnline.isPending ? "Updating…" : online ? "Go offline" : "Go online"}
        </button>
        <span className="muted">You earn {me.ratingAverage > 0 ? `★ ${me.ratingAverage.toFixed(1)}` : "a"} delivery fee per completed trip.</span>
      </div>

      <div className="hero-stats">
        <div className="stat">
          <b>{earnings.data ? naira(earnings.data.last7Days.earned) : "—"}</b>
          <span>Earned · last 7 days</span>
        </div>
        <div className="stat">
          <b>{earnings.data?.delivered ?? "—"}</b>
          <span>Completed trips</span>
        </div>
        <div className="stat">
          <b>{(jobs.data ?? []).length}</b>
          <span>Available jobs</span>
        </div>
        <div className="stat">
          <b>★ {(me.ratingAverage ?? 0).toFixed(1)}</b>
          <span>{me.ratingCount} ratings</span>
        </div>
      </div>

      {current && (
        <>
          <h2 style={{ marginTop: 32 }}>Current delivery</h2>
          <div className="card card-body">
            <div className="row">
              <div>
                <Link href={`/rider/deliveries/${current.id}`}>
                  <strong>{current.order.orderNumber}</strong>
                </Link>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {current.vendor.name} → {current.customer.name ?? "Customer"} · {naira(current.order.deliveryFee)} fee
                </p>
                {current.address && (
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {current.address.fullAddress}, {current.address.city ?? ""}
                  </p>
                )}
              </div>
              <span className={`badge ${deliveryBadge(current.status)}`}>{current.status.replaceAll("_", " ")}</span>
            </div>
            <div style={{ marginTop: 12 }}>{PerformAction}</div>
          </div>
        </>
      )}

      <h2 style={{ marginTop: 32 }}>Available jobs</h2>
      {!online ? (
        <div className="empty-state">
          <p className="empty-state-title">You are offline</p>
          <p className="empty-state-desc">Go online to see delivery jobs near you.</p>
        </div>
      ) : me.verificationStatus !== "APPROVED" ? (
        <div className="empty-state">
          <p className="empty-state-title">Verification pending</p>
          <p className="empty-state-desc">Jobs unlock once your rider application is approved.</p>
          <Link className="btn" href="/rider/profile">Complete verification</Link>
        </div>
      ) : jobs.isLoading ? (
        <p className="muted">Loading jobs…</p>
      ) : (jobs.data?.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No jobs right now</p>
          <p className="empty-state-desc">New pickup requests will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          {jobs.data?.map((job) => (
            <div className="card card-body" key={job.id}>
              <p className="muted" style={{ margin: "0 0 4px", textTransform: "uppercase", fontSize: 12 }}>
                {job.offered ? "Delivery request" : "Open job"}
              </p>
              <div className="row">
                <div>
                  <strong>{job.orderNumber}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    Pickup: {job.vendor.name}
                    {job.pickupZone ? ` (${job.pickupZone})` : ""}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    Drop-off:{" "}
                    {job.address
                      ? `${job.address.fullAddress}${job.address.city ? `, ${job.address.city}` : ""}`
                      : "See details after accepting"}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {job.itemCount} item{job.itemCount === 1 ? "" : "s"}
                    {job.offerExpiresAt
                      ? ` · offer expires ${new Date(job.offerExpiresAt).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}`
                      : ""}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: "0 0 8px" }}>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>Earnings</span>
                    <strong className="price">{naira(job.earnings ?? job.deliveryFee)}</strong>
                  </p>
                  <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn btn-sm" disabled={accept.isPending || !!current} onClick={() => takeJob(job.id)}>
                      {accept.isPending ? "Accepting…" : current ? "Finish current first" : "Accept"}
                    </button>
                    {job.offered && (
                      <button
                        className="btn secondary btn-sm"
                        disabled={decline.isPending}
                        onClick={() => passJob(job.id)}
                      >
                        Decline
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="auth-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </RiderShell>
  );
}

function ActiveDeliveryCard({ deliveryId, status, requireOtp }: { deliveryId: string; status: string; requireOtp: boolean }) {
  const action = useRiderDeliveryAction(deliveryId);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");

  async function run(next: "going" | "arrived" | "pickup" | "in_transit" | "deliver") {
    setError("");
    try {
      await action.mutateAsync({ action: next, ...(next === "deliver" && otp.trim() ? { otp: otp.trim() } : {}) });
      setOtp("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {status === "ASSIGNED" && (
        <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("going")}>
          {action.isPending ? "Updating…" : "Head to vendor"}
        </button>
      )}
      {status === "GOING_TO_VENDOR" && (
        <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("arrived")}>
          {action.isPending ? "Updating…" : "Arrived at vendor"}
        </button>
      )}
      {["ASSIGNED", "GOING_TO_VENDOR", "ARRIVED_AT_VENDOR"].includes(status) && (
        <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("pickup")}>
          {action.isPending ? "Updating…" : "Confirm pickup"}
        </button>
      )}
      {status === "PICKED_UP" && (
        <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("in_transit")}>
          {action.isPending ? "Updating…" : "Start trip"}
        </button>
      )}
      {(status === "PICKED_UP" || status === "IN_TRANSIT") && (
        <>
          {requireOtp && (
            <input
              value={otp}
              inputMode="numeric"
              maxLength={10}
              placeholder="Delivery code"
              aria-label="Delivery code"
              style={{ maxWidth: 140 }}
              onChange={(event) => setOtp(event.target.value)}
            />
          )}
          <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("deliver")}>
            {action.isPending ? "Updating…" : "Mark delivered"}
          </button>
        </>
      )}
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}
