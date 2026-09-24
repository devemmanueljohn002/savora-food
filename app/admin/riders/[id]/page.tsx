"use client";

import { FormEvent, use, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { AdminNav, AdminSignIn, naira } from "@/components/AdminShell";
import { useAdminRider, useUpdateAdminRider } from "@/lib/api/hooks";
import type { AdminRiderDetail } from "@/lib/savora-api";

function Detail({ initial }: { initial: AdminRiderDetail }) {
  const rider = useAdminRider(initial.id);
  const update = useUpdateAdminRider(initial.id);
  const [note, setNote] = useState(initial.documentNote ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const data = rider.data ?? initial;

  async function verify(status: "APPROVED" | "REJECTED", reviewDocuments: boolean) {
    setError("");
    setMessage("");
    try {
      await update.mutateAsync({
        verificationStatus: status,
        ...(reviewDocuments ? { reviewDocuments: status } : {}),
        ...(note !== (data.documentNote ?? "") ? { documentNote: note || null } : {}),
      });
      setMessage(status === "APPROVED" ? "Rider approved and notified." : "Rider rejected and notified.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  async function setStatus(status: "ACTIVE" | "OFFLINE" | "SUSPENDED") {
    setError("");
    setMessage("");
    try {
      await update.mutateAsync({ status });
      setMessage(`Status set to ${status.toLowerCase()}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await update.mutateAsync({ documentNote: note || null });
      setMessage("Note saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the note.");
    }
  }

  return (
    <div className="two-col">
      <div className="card card-body">
        <h3 style={{ marginTop: 0 }}>{data.name}</h3>
        <p className="muted">
          {data.userEmail} · {data.phone ?? "no phone"}
        </p>
        <p className="muted">
          {data.vehicleType ?? "No vehicle"} {data.vehicleNumber ? `· ${data.vehicleNumber}` : ""}
        </p>
        <p className="muted">
          ★ {data.ratingAverage.toFixed(1)} ({data.ratingCount}) · {data.delivered} trips · {naira(data.earned)} earned
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
              <span className={`badge ${doc.status === "APPROVED" ? "badge-success" : doc.status === "REJECTED" ? "badge-danger" : "badge-warning"}`}>
                {doc.status}
              </span>
            </p>
          ))
        )}
      </div>

      <div className="form-card">
        <h3 style={{ marginTop: 0 }}>Moderation</h3>
        <p>
          <span className={`badge ${data.verificationStatus === "APPROVED" ? "badge-success" : "badge-warning"}`}>
            {data.verificationStatus}
          </span>{" "}
          <span className="badge">{data.status}</span>
        </p>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-sm" disabled={update.isPending} onClick={() => verify("APPROVED", true)}>
            Approve + docs
          </button>
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => verify("APPROVED", false)}>
            Approve only
          </button>
          <button className="btn danger btn-sm" disabled={update.isPending} onClick={() => verify("REJECTED", true)}>
            Reject + docs
          </button>
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => setStatus(data.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED")}>
            {data.status === "SUSPENDED" ? "Unsuspend" : "Suspend"}
          </button>
        </span>
        <form onSubmit={saveNote} style={{ marginTop: 16 }}>
          <label>
            Reviewer note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <button className="btn btn-sm" disabled={update.isPending}>
            Save note
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
  const rider = useAdminRider(id);
  if (rider.isLoading) return <p className="muted">Loading rider…</p>;
  if (rider.isError || !rider.data) return <AdminSignIn />;
  return <Detail key={rider.data.id} initial={rider.data} />;
}

export default function AdminRiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 960 }}>
        <p>
          <Link href="/admin/riders">← All riders</Link>
        </p>
        <h1 style={{ marginTop: 0 }}>Rider review</h1>
        <AdminNav />
        <Loader id={id} />
      </section>
    </PageShell>
  );
}
