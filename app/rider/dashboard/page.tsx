"use client";

import Link from "next/link";
import { RiderShell, RiderSignIn, deliveryBadge, naira } from "@/components/RiderShell";
import RoleGuard from "@/components/RoleGuard";
import { useConfirm } from "@/components/ui/confirm";
import {
  useAcceptRiderJob,
  useDeclineRiderJob,
  useReleaseRiderJob,
  useRiderDeliveries,
  useRiderDeliveryAction,
  useRiderEarnings,
  useRiderJobs,
  useRiderProfile,
  useUpdateRiderProfile,
} from "@/lib/api/hooks";
import { useState } from "react";
import type { BoardJob } from "@/lib/savora-api";

function ageLabel(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function dropAreaLabel(job: BoardJob): string {
  const parts = [job.dropArea.zone, job.dropArea.city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Nearby";
}

/** Tapping a card reveals the pre-claim detail, then Accept. The detail
 *  never contains customer identity or full addresses (server-enforced). */
function JobCard({
  job,
  hasActiveJob,
  accepting,
  dismissing,
  onAccept,
  onDismiss,
}: {
  job: BoardJob;
  hasActiveJob: boolean;
  accepting: boolean;
  dismissing: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card card-body">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        style={{
          all: "unset",
          display: "block",
          width: "100%",
          cursor: "pointer",
          boxSizing: "border-box",
        }}
      >
        <div className="row">
          <div>
            <strong>{job.vendor.name}</strong>
            {job.vendor.area ? <span className="muted"> · {job.vendor.area}</span> : null}
            {job.boosted && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Boosted pay</span>}
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Drop-off: {dropAreaLabel(job)} · {job.itemCount} item{job.itemCount === 1 ? "" : "s"} ·{" "}
              {ageLabel(job.ageMinutes)}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="muted" style={{ display: "block", fontSize: 12 }}>
              Rider payout
            </span>
            <strong className="price">{naira(job.payout)}</strong>
          </div>
        </div>
      </button>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <p className="muted" style={{ margin: "0 0 4px" }}>
            Order {job.orderNumber} · Pickup: {job.vendor.name}
            {job.vendor.area ? ` (${job.vendor.area})` : ""} · Drop-off area: {dropAreaLabel(job)}
          </p>
          <p className="muted" style={{ margin: "0 0 12px" }}>
            Full pickup and drop-off details are revealed after you accept.
          </p>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" disabled={accepting || hasActiveJob} onClick={onAccept}>
              {accepting ? "Accepting…" : hasActiveJob ? "Finish current first" : "Accept job"}
            </button>
            <button className="btn secondary btn-sm" disabled={dismissing} onClick={onDismiss}>
              Not interested
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

export default function RiderDashboardPage() {
  const profile = useRiderProfile();
  const jobs = useRiderJobs();
  const active = useRiderDeliveries({ active: true });
  const earnings = useRiderEarnings();
  const accept = useAcceptRiderJob();
  const decline = useDeclineRiderJob();
  const release = useReleaseRiderJob();
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
  // Presence is stored as status + is_online (kept in sync by the API).
  // Prefer the explicit isOnline flag when present so a legacy drift
  // (ACTIVE + is_online FALSE) shows Offline instead of an empty job feed.
  const online = me.isOnline ?? me.status === "ACTIVE";
  const current = (active.data ?? [])[0] ?? null;
  const PerformAction = current ? (
    <ActiveDeliveryCard deliveryId={current.id} status={current.status} requireOtp={current.requireOtp ?? false} />
  ) : null;

  async function takeJob(orderId: string) {
    setError("");
    try {
      await accept.mutateAsync(orderId);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not accept this job.";
      // 409 from a lost claim race: say so kindly and refresh the board.
      if (/already taken/i.test(message)) {
        setError("Another rider took this job — refreshing the list.");
        void jobs.refetch();
      } else {
        setError(message);
      }
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
    <RoleGuard allow={["DELIVERY_PARTNER"]}>
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

      <div className="row" style={{ marginTop: 32 }}>
        <h2 style={{ margin: 0 }}>Available jobs</h2>
        <button
          className="btn secondary btn-sm"
          type="button"
          disabled={jobs.isFetching}
          onClick={() => void jobs.refetch()}
          aria-label="Refresh available jobs"
        >
          {jobs.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
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
        <div className="grid" style={{ gridTemplateColumns: "1fr" }} aria-label="Loading jobs">
          {[0, 1, 2].map((key) => (
            <div className="card card-body" key={key}>
              <div className="skeleton" style={{ height: 18, width: "55%", marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 14, width: "80%", marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 14, width: "40%" }} />
            </div>
          ))}
        </div>
      ) : jobs.isError ? (
        <div className="empty-state">
          <p className="empty-state-title">Couldn&apos;t load jobs</p>
          <p className="empty-state-desc">
            {jobs.error instanceof Error ? jobs.error.message : "Something went wrong."} Check your connection and
            try again.
          </p>
          <button className="btn secondary btn-sm" type="button" onClick={() => void jobs.refetch()}>
            Retry
          </button>
        </div>
      ) : (jobs.data?.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No jobs right now</p>
          <p className="empty-state-desc">New pickup requests will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          {jobs.data?.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              hasActiveJob={!!current}
              accepting={accept.isPending}
              onAccept={() => takeJob(job.id)}
              onDismiss={() => passJob(job.id)}
              dismissing={decline.isPending}
            />
          ))}
        </div>
      )}
      {error && (
        <p className="auth-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </RiderShell>
    </RoleGuard>
  );
}

function ActiveDeliveryCard({ deliveryId, status, requireOtp }: { deliveryId: string; status: string; requireOtp: boolean }) {
  const action = useRiderDeliveryAction(deliveryId);
  const releaseJob = useReleaseRiderJob();
  const confirm = useConfirm();
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const releasable = ["ASSIGNED", "GOING_TO_VENDOR", "ARRIVED_AT_VENDOR"].includes(status);

  async function run(next: "going" | "arrived" | "pickup" | "in_transit" | "deliver") {
    setError("");
    try {
      await action.mutateAsync({ action: next, ...(next === "deliver" && otp.trim() ? { otp: otp.trim() } : {}) });
      setOtp("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  async function release() {
    setError("");
    if (!(await confirm({ title: "Release this job?", body: "It goes back to the board. Only do this before pickup.", confirmLabel: "Release job" }))) return;
    try {
      await releaseJob.mutateAsync(deliveryId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not release this job.");
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
      {releasable && (
        <button className="btn secondary btn-sm" disabled={releaseJob.isPending} onClick={() => void release()}>
          {releaseJob.isPending ? "Releasing…" : "Release job"}
        </button>
      )}
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}
