"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { VendorShell, VendorSignIn } from "@/components/VendorShell";
import ImageUploader from "@/components/ImageUploader";
import { useUpdateVendorProfile, useVendorProfile } from "@/lib/api/hooks";
import type { VendorProfile } from "@/lib/savora-api";

function ProfileEditor({ data }: { data: VendorProfile }) {
  const update = useUpdateVendorProfile();
  const [form, setForm] = useState({
    businessName: data.businessName ?? "",
    ownerName: data.ownerName ?? "",
    phone: data.phone ?? "",
    description: data.description ?? "",
    address: data.address ?? "",
    city: data.city ?? "",
    state: data.state ?? "",
    logoUrl: data.logoUrl ?? "",
    bannerImageUrl: data.bannerImageUrl ?? "",
    bankName: data.bankName ?? "",
    bankAccountName: data.bankAccountName ?? "",
    bankAccountNumber: data.bankAccountNumber ?? "",
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    try {
      await update.mutateAsync({
        businessName: form.businessName,
        ...(form.ownerName ? { ownerName: form.ownerName } : {}),
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.description ? { description: form.description } : {}),
        ...(form.address ? { address: form.address } : {}),
        ...(form.city ? { city: form.city } : {}),
        ...(form.state ? { state: form.state } : {}),
        ...(form.logoUrl ? { logoUrl: form.logoUrl } : {}),
        ...(form.bannerImageUrl ? { bannerImageUrl: form.bannerImageUrl } : {}),
        ...(form.bankName ? { bankName: form.bankName } : {}),
        ...(form.bankAccountName ? { bankAccountName: form.bankAccountName } : {}),
        ...(form.bankAccountNumber ? { bankAccountNumber: form.bankAccountNumber } : {}),
      });
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your profile.");
    }
  }

  return (
    <form className="form-card" onSubmit={submit} style={{ maxWidth: 760 }}>
      {saved && (
        <p className="auth-success" role="status">
          Profile saved.
        </p>
      )}
        <label>
          Business name
          <input value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} />
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
        <div className="two-col">
          <label>
            Address
            <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </label>
          <label>
            City
            <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
        </div>
        <label>
          State
          <input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
        </label>
        <ImageUploader label="Logo" value={form.logoUrl || null} onChange={(url) => setForm({ ...form, logoUrl: url ?? "" })} />
        <ImageUploader
          label="Banner image"
          value={form.bannerImageUrl || null}
          onChange={(url) => setForm({ ...form, bannerImageUrl: url ?? "" })}
        />
        <h3>Payout bank account</h3>
        <label>
          Bank name
          <input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} />
        </label>
        <label>
          Account name
          <input
            value={form.bankAccountName}
            onChange={(event) => setForm({ ...form, bankAccountName: event.target.value })}
          />
        </label>
        <label>
          Account number
          <input
            value={form.bankAccountNumber}
            onChange={(event) => setForm({ ...form, bankAccountNumber: event.target.value })}
          />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save profile"}
        </button>
        <p className="muted">
          <Link href={`/vendor/${data.slug}`}>View public page</Link>
        </p>
      </form>
  );
}

export default function VendorProfilePage() {
  const profile = useVendorProfile();

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;

  const data = profile.data;

  return (
    <VendorShell
      profile={data}
      title="Kitchen profile"
      sub={`Public page: ${data.slug ? `/vendor/${data.slug}` : "available after approval"} · Commission ${data.commissionRate ?? "—"}% · ★ ${data.ratingAverage.toFixed(1)} (${data.ratingCount})`}
    >
      <ProfileEditor key={data.id} data={data} />
    </VendorShell>
  );
}
