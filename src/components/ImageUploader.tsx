"use client";

import { useState } from "react";
import { uploadImage } from "@/lib/savora-api";

const CLIENT_MAX_BYTES = 5 * 1024 * 1024;
const CLIENT_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export default function ImageUploader({ value, onChange, label }: {
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    // Instant client-side check (the API re-validates); only upload on success
    // so a failed upload can never leave a stale URL on the product.
    if (!CLIENT_ALLOWED.has(file.type)) {
      setError("Only JPEG, PNG, WebP or GIF images are allowed.");
      return;
    }
    if (file.size <= 0 || file.size > CLIENT_MAX_BYTES) {
      setError("Image must be smaller than 5 MB.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {value && (
        <p>
          <img src={value} alt="Preview" style={{ maxWidth: 220, borderRadius: 12, display: "block" }} />
        </p>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={busy}
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      {busy && <p className="muted">Uploading…</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {value && (
        <p>
          <button className="btn secondary btn-sm" type="button" onClick={() => onChange(null)}>
            Remove image
          </button>
        </p>
      )}
    </div>
  );
}
