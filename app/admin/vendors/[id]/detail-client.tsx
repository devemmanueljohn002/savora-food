"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { AdminNav, AdminSignIn } from "@/components/AdminShell";
import { Modal } from "@/components/ui/modal";
import { useNotify } from "@/components/ui/toast";
import { ApiRequestError, type AdminVendorDetail } from "@/lib/savora-api";
import { useAdminVendor, useUpdateAdminVendor } from "@/lib/api/hooks";

type ActionKind = "approve" | "reject" | "suspend" | "reactivate" | "override";

function VerificationCard({ data }: { data: AdminVendorDetail }) {
  const v = data.verification;
  const tone =
    v.status === "VERIFIED" ? "badge badge-success" : v.status === "FAILED" ? "badge badge-danger" : "badge badge-warning";
  return (
    <div className="card card-body" style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 8px" }}>Identity check (Dojah {v.method})</h4>
      <p style={{ margin: "0 0 6px" }}>
        <span className={tone}>{v.status === "NOT_SUBMITTED" ? "Not submitted" : v.status.toLowerCase()}</span>
      </p>
      {v.status === "FAILED" && v.failureReason && (
        <p className="muted" role="note" style={{ margin: "6px 0 0" }}>
          Failure reason: {v.failureReason}
        </p>
      )}
      {v.status === "VERIFIED" && v.verifiedAt && (
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Verified {new Date(v.verifiedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
        </p>
      )}
      {v.status === "NOT_SUBMITTED" && (
        <p className="muted" style={{ margin: "6px 0 0" }}>
          This vendor hasn&apos;t submitted BVN/NIN documents yet.
        </p>
      )}
    </div>
  );
}

function HistoryCard({ data }: { data: AdminVendorDetail }) {
  return (
    <div className="card card-body" style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 8px" }}>Moderation history</h4>
      {data.history.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No admin actions recorded yet.
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {data.history.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.action.toLowerCase()}</strong>{" "}
                <span className="muted-small">
                  by {entry.adminEmail ?? "admin"} ·{" "}
                  {new Date(entry.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              {entry.reason && <div className="muted-small">“{entry.reason}”</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionModal({
  kind,
  businessName,
  onClose,
  onDone,
}: {
  kind: { action: ActionKind; vendorId: string } | null;
  businessName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const notify = useNotify();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const mutation = useUpdateAdminVendor(kind?.vendorId ?? "");

  if (!kind) return null;
  const current = kind;
  const needsReason = current.action !== "approve";
  const danger = current.action === "reject" || current.action === "suspend";
  const titles: Record<ActionKind, string> = {
    approve: "Approve kitchen",
    reject: "Reject application",
    suspend: "Suspend kitchen",
    reactivate: "Reactivate kitchen",
    override: "Override failed check",
  };

  async function confirm() {
    setError("");
    if (needsReason && !reason.trim()) {
      setError("A reason is required for this action.");
      return;
    }
    try {
      await mutation.mutateAsync({ action: current.action, reason: reason.trim() || undefined });
      notify.success("Done", `${businessName} updated. The vendor has been emailed.`);
      setReason("");
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <Modal open onClose={onClose} title={`${titles[current.action]} — ${businessName}`}>
      {needsReason && (
        <div className="field">
          <label className="field-label" htmlFor="vendor-detail-reason">
            Reason
          </label>
          <textarea
            id="vendor-detail-reason"
            className="input textarea"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Tell the vendor why…"
          />
        </div>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" className="btn secondary" onClick={onClose} style={{ minHeight: 44 }}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? "btn danger" : "btn"}
          disabled={mutation.isPending}
          onClick={() => void confirm()}
          style={{ minHeight: 44 }}
        >
          {mutation.isPending ? "Working…" : titles[current.action]}
        </button>
      </div>
    </Modal>
  );
}

function Detail({ initial }: { initial: AdminVendorDetail }) {
  const vendor = useAdminVendor(initial.id);
  const update = useUpdateAdminVendor(initial.id);
  const notify = useNotify();
  const [commission, setCommission] = useState(String(initial.commissionRate));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<{ action: ActionKind; vendorId: string } | null>(null);

  const data = vendor.data ?? initial;
  const failedCheck = data.verification.status === "FAILED";

  async function saveCommission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await update.mutateAsync({ commissionRate: Number(commission) });
      setMessage("Commission updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save commission.");
    }
  }

  async function toggleFeatured() {
    setError("");
    try {
      await update.mutateAsync({ isFeatured: !data.isFeatured });
      notify.success(data.isFeatured ? "Unfeatured" : "Featured", data.businessName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  if (vendor.isError && !vendor.data) {
    const status = vendor.error instanceof ApiRequestError ? vendor.error.status : undefined;
    if (status === 401 || status === 403) return <AdminSignIn />;
    return (
      <div className="empty-state" role="alert">
        <p className="empty-state-title">Couldn&apos;t load this vendor</p>
        <p className="empty-state-desc">{vendor.error instanceof Error ? vendor.error.message : "Try again."}</p>
        <button className="btn" type="button" onClick={() => vendor.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="two-col">
      <div>
        <div className="card card-body">
          {data.photoUrl ? (
            // Real S3 profile photo (short-lived presigned URL minted server-side).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.photoUrl}
              alt={`${data.businessName} profile photo`}
              style={{ width: 120, height: 120, objectFit: "cover", borderRadius: "50%", marginBottom: 12 }}
            />
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>
              No profile photo on file.
            </p>
          )}
          <h3 style={{ marginTop: 0 }}>{data.businessName}</h3>
          <p className="muted">
            {data.ownerName} · {data.userEmail} · {data.phone ?? "no phone"}
          </p>
          <p>{data.description ?? "No description."}</p>
          <p className="muted">
            {[data.address, data.city, data.state].filter(Boolean).join(", ") || "No address"}
          </p>
          <p className="muted">
            ★ {data.ratingAverage.toFixed(1)} ({data.ratingCount}) · Joined{" "}
            {new Date(data.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
          </p>
          {data.statusReason && (
            <p className="muted">
              Last moderation note: “{data.statusReason}”
            </p>
          )}
          <p>
            <Link href={`/vendor/${data.slug}`} target="_blank" rel="noreferrer">
              View public page
            </Link>
          </p>
          <h4>Documents</h4>
          {data.documents.length === 0 ? (
            <p className="muted">No documents uploaded.</p>
          ) : (
            data.documents.map((doc) => (
              <p key={doc.id} style={{ margin: "6px 0" }}>
                <a href={doc.url} target="_blank" rel="noreferrer">
                  {doc.kind.replaceAll("_", " ")}
                </a>{" "}
                <span className={`badge ${doc.status === "APPROVED" ? "badge-success" : "badge-warning"}`}>
                  {doc.status}
                </span>
              </p>
            ))
          )}
        </div>
        <VerificationCard data={data} />
        <HistoryCard data={data} />
      </div>

      <div className="form-card">
        <h3 style={{ marginTop: 0 }}>Moderation</h3>
        <p>
          Status:{" "}
          <span className={`badge ${data.status === "APPROVED" ? "badge-success" : "badge-warning"}`}>
            {data.status.replaceAll("_", " ")}
          </span>{" "}
          {data.isFeatured && <span className="badge badge-info">Featured</span>}
        </p>
        {vendor.isFetching && <p className="muted">Refreshing…</p>}
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(data.status === "PENDING" || data.status === "UNDER_REVIEW" || data.status === "REJECTED") && (
            <button
              className="btn btn-sm"
              disabled={update.isPending}
              onClick={() => setModal({ action: "approve", vendorId: data.id })}
            >
              Approve
            </button>
          )}
          {(data.status === "PENDING" || data.status === "UNDER_REVIEW") && (
            <button
              className="btn danger btn-sm"
              disabled={update.isPending}
              onClick={() => setModal({ action: "reject", vendorId: data.id })}
            >
              Reject
            </button>
          )}
          {data.status === "APPROVED" && (
            <button
              className="btn danger btn-sm"
              disabled={update.isPending}
              onClick={() => setModal({ action: "suspend", vendorId: data.id })}
            >
              Suspend
            </button>
          )}
          {data.status === "SUSPENDED" && (
            <button
              className="btn btn-sm"
              disabled={update.isPending}
              onClick={() => setModal({ action: "reactivate", vendorId: data.id })}
            >
              Reactivate
            </button>
          )}
          {failedCheck && data.status !== "APPROVED" && (
            <button
              className="btn secondary btn-sm"
              disabled={update.isPending}
              onClick={() => setModal({ action: "override", vendorId: data.id })}
            >
              Override failed check
            </button>
          )}
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => void toggleFeatured()}>
            {data.isFeatured ? "Unfeature" : "Feature"}
          </button>
        </span>
        <form onSubmit={saveCommission} style={{ marginTop: 16 }}>
          <label>
            Commission rate (%)
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={commission}
              onChange={(event) => setCommission(event.target.value)}
            />
          </label>
          <button className="btn btn-sm" disabled={update.isPending}>
            Save commission
          </button>
        </form>
        {message && (
          <p className="auth-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <ActionModal kind={modal} businessName={data.businessName} onClose={() => setModal(null)} onDone={() => setModal(null)} />
      </div>
    </div>
  );
}

function Loader({ id }: { id: string }) {
  const vendor = useAdminVendor(id);
  if (vendor.isLoading) return <p className="muted">Loading vendor…</p>;
  if (vendor.isError || !vendor.data) {
    const status = vendor.error instanceof ApiRequestError ? vendor.error.status : undefined;
    if (status === 401 || status === 403) return <AdminSignIn />;
    return (
      <div className="empty-state" role="alert">
        <p className="empty-state-title">Couldn&apos;t load this vendor</p>
        <p className="empty-state-desc">{vendor.error instanceof Error ? vendor.error.message : "Try again."}</p>
        <button className="btn" type="button" onClick={() => vendor.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return <Detail key={vendor.data.id} initial={vendor.data} />;
}

export default function VendorDetailClient({ id }: { id: string }) {
  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 960 }}>
        <p>
          <Link href="/admin/vendors">← All vendors</Link>
        </p>
        <h1 style={{ marginTop: 0 }}>Vendor review</h1>
        <AdminNav />
        <Loader id={id} />
      </section>
    </PageShell>
  );
}
