"use client";

import { FormEvent, useState } from "react";
import { RiderShell, RiderSignIn } from "@/components/RiderShell";
import ImageUploader from "@/components/ImageUploader";
import { useRiderProfile, useUpdateRiderProfile, useUploadRiderDocument } from "@/lib/api/hooks";
import type { RiderProfile } from "@/lib/savora-api";

const DOC_KINDS = ["DRIVERS_LICENSE", "PROOF_OF_IDENTITY", "PROFILE_PHOTO", "VEHICLE_DOCUMENT", "OTHER"] as const;

function ProfileEditor({ initial }: { initial: RiderProfile }) {
  const profile = useRiderProfile();
  const update = useUpdateRiderProfile();
  const uploadDoc = useUploadRiderDocument();
  const [form, setForm] = useState({
    name: initial.name ?? "",
    phone: initial.phone ?? "",
    vehicleType: initial.vehicleType ?? "",
    vehicleNumber: initial.vehicleNumber ?? "",
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [docKind, setDocKind] = useState<(typeof DOC_KINDS)[number]>("DRIVERS_LICENSE");
  const [docUrl, setDocUrl] = useState("");
  const [docMessage, setDocMessage] = useState("");

  const data = profile.data ?? initial;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    try {
      await update.mutateAsync({
        ...(form.name ? { name: form.name } : {}),
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.vehicleType ? { vehicleType: form.vehicleType } : {}),
        ...(form.vehicleNumber ? { vehicleNumber: form.vehicleNumber } : {}),
      });
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your profile.");
    }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDocMessage("");
    setError("");
    if (!docUrl) {
      setError("Upload a document image first.");
      return;
    }
    try {
      await uploadDoc.mutateAsync({ kind: docKind, url: docUrl });
      setDocUrl("");
      setDocMessage("Document submitted for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit the document.");
    }
  }

  if (profile.isLoading || !data) return <p className="muted">Loading…</p>;

  return (
    <>
      <form className="form-card" style={{ maxWidth: 720, marginBottom: 20 }} onSubmit={submit}>
        <h3 style={{ marginTop: 0 }}>Rider details</h3>
        {saved && (
          <p className="auth-success" role="status">
            Profile saved.
          </p>
        )}
        <label>
          Full name
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </label>
        <div className="two-col">
          <label>
            Vehicle type
            <input
              value={form.vehicleType}
              placeholder="Motorcycle, Bicycle, Car…"
              onChange={(event) => setForm({ ...form, vehicleType: event.target.value })}
            />
          </label>
          <label>
            Vehicle number
            <input
              value={form.vehicleNumber}
              onChange={(event) => setForm({ ...form, vehicleNumber: event.target.value })}
            />
          </label>
        </div>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save details"}
        </button>
      </form>

      <div className="form-card" style={{ maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>Verification documents</h3>
        <p className="muted">
          Status: <strong>{data.verificationStatus}</strong>
          {data.documentNote ? ` — ${data.documentNote}` : ""}
        </p>
        {(data.documents ?? []).length === 0 ? (
          <p className="muted">No documents uploaded yet.</p>
        ) : (
          (data.documents ?? []).map((doc) => (
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
        <form onSubmit={submitDocument} style={{ marginTop: 12 }}>
          <label>
            Document type
            <select value={docKind} onChange={(event) => setDocKind(event.target.value as typeof docKind)}>
              {DOC_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <ImageUploader label="Document image" value={docUrl || null} onChange={(url) => setDocUrl(url ?? "")} />
          {docMessage && (
            <p className="auth-success" role="status">
              {docMessage}
            </p>
          )}
          <button className="btn" disabled={uploadDoc.isPending}>
            {uploadDoc.isPending ? "Submitting…" : "Submit document"}
          </button>
        </form>
      </div>
    </>
  );
}

export default function RiderProfilePage() {
  const profile = useRiderProfile();

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <main className="page-shell">
        <section className="section container">
          <h1>Profile</h1>
          <p className="muted">Please sign in with your rider account.</p>
        </section>
      </main>
    );
  }

  return (
    <RiderShell profile={profile.data} title="Rider profile" sub="Keep your details and documents up to date.">
      <ProfileEditor key={profile.data.id} initial={profile.data} />
    </RiderShell>
  );
}
