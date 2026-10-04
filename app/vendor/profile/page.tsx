"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { VendorShell, VendorSignIn } from "@/components/VendorShell";
import ImageUploader from "@/components/ImageUploader";
import {
  useFinalizeProfilePhotoUpload,
  useProfilePhotoViewUrl,
  useRequestProfilePhotoUpload,
  useUpdateVendorProfile,
  useVendorProfile,
} from "@/lib/api/hooks";
import { postFileToS3 } from "@/lib/savora-api";
import type { VendorProfile } from "@/lib/savora-api";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1024;

/**
 * Downscale to ~1024px and re-encode via canvas. Canvas re-encoding drops
 * EXIF/GPS metadata. Convenience only — the server re-validates and
 * re-encodes every upload before it is stored.
 */
async function preparePhotoFile(file: File): Promise<{ blob: Blob; type: string }> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error("Only JPEG, PNG or WebP images are allowed.");
  }
  if (file.size <= 0 || file.size > PHOTO_MAX_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, type: file.type };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === "function") bitmap.close();
    const outType = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outType, 0.85));
    if (!blob) return { blob: file, type: file.type };
    return { blob, type: outType };
  } catch {
    return { blob: file, type: file.type };
  }
}

function ProfilePhotoSection({ hasPhoto }: { hasPhoto: boolean }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const viewUrl = useProfilePhotoViewUrl(hasPhoto || saved);
  const requestUpload = useRequestProfilePhotoUpload();
  const finalizeUpload = useFinalizeProfilePhotoUpload();

  async function pick(file: File | undefined) {
    if (!file || busy) return;
    setError("");
    setSaved(false);
    setBusy(true);
    setProgress(0);
    try {
      const prepared = await preparePhotoFile(file);
      const upload = await requestUpload.mutateAsync({
        contentType: prepared.type,
        sizeBytes: prepared.blob.size,
      });
      await postFileToS3(upload.url, upload.fields, prepared.blob, (fraction) => setProgress(fraction));
      setProgress(1);
      await finalizeUpload.mutateAsync({ key: upload.key });
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section className="form-card" style={{ maxWidth: 760, marginBottom: 24 }} aria-label="Profile photo">
      <h3 style={{ marginTop: 0 }}>Profile photo</h3>
      {hasPhoto || saved ? (
        viewUrl.data ? (
          <p>
            <img
              src={viewUrl.data.url}
              alt="Your kitchen profile photo"
              style={{ maxWidth: 220, borderRadius: 12, display: "block" }}
            />
          </p>
        ) : viewUrl.isError ? (
          <p className="auth-error" role="alert">
            Could not load your photo. Try reloading the page.
          </p>
        ) : (
          <p className="muted">Loading photo…</p>
        )
      ) : (
        <p className="muted">
          <strong>Add a profile photo</strong> so riders and customers can recognize your kitchen. This is optional —
          it never blocks orders or your account.
        </p>
      )}
      <label>
        {hasPhoto || saved ? "Change photo" : "Upload photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <p className="muted">JPEG, PNG or WebP · max 5 MB · resized to about 1024px.</p>
      {busy && <p className="muted">{progress === null ? "Uploading…" : `Uploading… ${Math.round(progress * 100)}%`}</p>}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="auth-success" role="status">
          Profile photo saved.
        </p>
      )}
      <p className="muted">
        Your photo is used for profile and recognition purposes only. It can be seen by you, by Savora Food admins,
        and by riders on your active orders. It is not government identity verification.
      </p>
    </section>
  );
}

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
      <ProfilePhotoSection hasPhoto={data.hasProfilePhoto} />
      <ProfileEditor key={data.id} data={data} />
    </VendorShell>
  );
}
