"use client";

import { FormEvent, use, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { AdminNav, AdminSignIn } from "@/components/AdminShell";
import { useAdminVendor, useUpdateAdminVendor } from "@/lib/api/hooks";
import type { AdminVendorDetail } from "@/lib/savora-api";

function Detail({ initial }: { initial: AdminVendorDetail }) {
  const vendor = useAdminVendor(initial.id);
  const update = useUpdateAdminVendor(initial.id);
  const [commission, setCommission] = useState(String(initial.commissionRate));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const data = vendor.data ?? initial;

  async function setStatus(status: "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED") {
    setError("");
    setMessage("");
    try {
      await update.mutateAsync({ status });
      setMessage(`Vendor ${status.toLowerCase().replaceAll("_", " ")}. The owner has been notified.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <div className="two-col">
      <div className="card card-body">
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

      <div className="form-card">
        <h3 style={{ marginTop: 0 }}>Moderation</h3>
        <p>
          Status:{" "}
          <span className={`badge ${data.status === "APPROVED" ? "badge-success" : "badge-warning"}`}>
            {data.status.replaceAll("_", " ")}
          </span>{" "}
          {data.isFeatured && <span className="badge badge-info">Featured</span>}
        </p>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-sm" disabled={update.isPending} onClick={() => setStatus("APPROVED")}>
            Approve
          </button>
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => setStatus("UNDER_REVIEW")}>
            Mark under review
          </button>
          <button className="btn danger btn-sm" disabled={update.isPending} onClick={() => setStatus("REJECTED")}>
            Reject
          </button>
          <button className="btn danger btn-sm" disabled={update.isPending} onClick={() => setStatus("SUSPENDED")}>
            Suspend
          </button>
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={toggleFeatured}>
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
      </div>
    </div>
  );
}

function Loader({ id }: { id: string }) {
  const vendor = useAdminVendor(id);
  if (vendor.isLoading) return <p className="muted">Loading vendor…</p>;
  if (vendor.isError || !vendor.data) return <AdminSignIn />;
  return <Detail key={vendor.data.id} initial={vendor.data} />;
}

export default function AdminVendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
