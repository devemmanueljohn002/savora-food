"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Store } from "lucide-react";
import PageShell from "@/components/PageShell";
import {
  getVendorOnboarding,
  updateVendorOnboarding,
  type VendorOnboarding,
} from "@/lib/savora-api";

type Status = "loading" | "ready" | "saving" | "saved" | "error";

export default function VendorOnboardingPage() {
  const [vendor, setVendor] = useState<VendorOnboarding | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    phone: "",
    description: "",
    address: "",
    city: "",
    state: "",
  });

  useEffect(() => {
    let cancelled = false;
    getVendorOnboarding()
      .then((row) => {
        if (cancelled) return;
        setVendor(row);
        setForm({
          businessName: row.businessName ?? "",
          ownerName: row.ownerName ?? "",
          phone: row.phone ?? "",
          description: row.description ?? "",
          address: row.address ?? "",
          city: row.city ?? "",
          state: row.state ?? "",
        });
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Could not load your vendor profile.";
        if (/401|sign in/i.test(message)) {
          window.location.href = "/login?next=/vendor/onboarding";
          return;
        }
        setError(message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("saving");
    try {
      const row = await updateVendorOnboarding({
        businessName: form.businessName,
        ...(form.ownerName ? { ownerName: form.ownerName } : {}),
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.description ? { description: form.description } : {}),
        ...(form.address ? { address: form.address } : {}),
        ...(form.city ? { city: form.city } : {}),
        ...(form.state ? { state: form.state } : {}),
      });
      setVendor(row);
      setStatus("saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your profile.");
      setStatus("ready");
    }
  }

  return (
    <PageShell>
      <div className="container section">
        <h1>Vendor onboarding</h1>
        <p className="section-sub">Tell customers about your kitchen. An admin reviews every kitchen before it goes live.</p>

        {status === "loading" && <p className="muted">Loading your vendor profile…</p>}
        {status === "error" && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        {vendor && (
          <div className="form-card" style={{ marginBottom: 20 }}>
            <p style={{ margin: 0 }}>
              <span className={`badge ${vendor.status === "APPROVED" ? "badge-success" : "badge-warning"}`}>
                {vendor.status}
              </span>{" "}
              <span className="muted">
                {vendor.status === "APPROVED"
                  ? "Your kitchen is live. Manage it from your dashboard."
                  : "Your kitchen is under review. You can keep editing the details below."}
              </span>
            </p>
            {vendor.status === "APPROVED" && (
              <p style={{ marginBottom: 0 }}>
                <Link className="btn" href="/vendor/dashboard">
                  Go to vendor dashboard
                </Link>
              </p>
            )}
          </div>
        )}

        {(status === "ready" || status === "saving" || status === "saved") && (
          <form className="form-card" onSubmit={submit}>
            {status === "saved" && (
              <p className="auth-success" role="status">
                Profile saved. {vendor?.status === "APPROVED" ? "Your live listing is updated." : "We will notify you once an admin approves your kitchen."}
              </p>
            )}
            <label>
              Business name
              <input
                required
                value={form.businessName}
                onChange={(event) => setForm({ ...form, businessName: event.target.value })}
              />
            </label>
            <label>
              Owner name
              <input value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <label>
              Address
              <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </label>
            <label>
              City
              <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </label>
            <label>
              State
              <input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn" disabled={status === "saving"}>
              <Store size={16} aria-hidden="true" /> {status === "saving" ? "Saving…" : "Save business profile"}
            </button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
