"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { useAddresses, useCreateAddress, useDeleteAddress, useUpdateAddress } from "@/lib/api/hooks";
import type { AddressInput } from "@/lib/order-types";

const EMPTY: AddressInput & { isDefault?: boolean } = {
  label: "",
  recipientName: "",
  phone: "",
  fullAddress: "",
  city: "",
  state: "",
  country: "Nigeria",
  landmark: "",
  isDefault: false,
};

export default function AccountAddressesPage() {
  const addresses = useAddresses();
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const unauthorized =
    addresses.isError &&
    typeof addresses.error === "object" &&
    addresses.error !== null &&
    "status" in addresses.error &&
    (addresses.error as { status?: number }).status === 401;

  function startEdit(id: string) {
    const row = addresses.data?.find((address) => address.id === id);
    if (!row) return;
    setEditingId(id);
    setForm({
      label: row.label ?? "",
      recipientName: row.recipientName ?? "",
      phone: row.phone ?? "",
      fullAddress: row.fullAddress,
      city: row.city,
      state: row.state,
      country: row.country,
      landmark: row.landmark ?? "",
      isDefault: row.isDefault,
    });
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, input: form });
        setMessage("Address updated.");
      } else {
        await create.mutateAsync(form);
        setMessage("Address added.");
      }
      cancelEdit();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this address.");
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this address?")) return;
    setError("");
    try {
      await remove.mutateAsync(id);
      if (editingId === id) cancelEdit();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this address.");
    }
  }

  if (unauthorized) {
    return (
      <PageShell>
        <section className="section container">
          <h1>Addresses</h1>
          <p className="muted">Please sign in to manage your delivery addresses.</p>
          <Link className="btn" href="/auth?next=/account/addresses">Sign in</Link>
        </section>
      </PageShell>
    );
  }

  const busy = create.isPending || update.isPending;

  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 760 }}>
        <h1>Delivery addresses</h1>
        <p className="section-sub">Save the places you order to most often.</p>

        {addresses.isLoading ? (
          <p className="muted">Loading addresses…</p>
        ) : (addresses.data?.length ?? 0) === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No addresses yet</p>
            <p className="empty-state-desc">Add your first delivery address below.</p>
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "1fr", marginBottom: 24 }}>
            {addresses.data?.map((address) => (
              <div className="card card-body" key={address.id}>
                <div className="row">
                  <div>
                    <strong>{address.label || "Address"}</strong>{" "}
                    {address.isDefault && <span className="badge badge-success">Default</span>}
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {address.recipientName} · {address.phone}
                    </p>
                    <p style={{ margin: "4px 0 0" }}>
                      {address.fullAddress}, {address.city}, {address.state}
                    </p>
                  </div>
                  <span style={{ display: "flex", gap: 8 }}>
                    <button className="btn secondary btn-sm" type="button" onClick={() => startEdit(address.id)}>
                      Edit
                    </button>
                    <button
                      className="btn danger btn-sm"
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => onDelete(address.id)}
                    >
                      Delete
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <form className="form-card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>{editingId ? "Edit address" : "Add a new address"}</h3>
          <label>
            Label
            <input
              placeholder="Home, Office…"
              value={form.label ?? ""}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
            />
          </label>
          <label>
            Recipient name
            <input
              value={form.recipientName ?? ""}
              onChange={(event) => setForm({ ...form, recipientName: event.target.value })}
            />
          </label>
          <label>
            Phone
            <input value={form.phone ?? ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
          <label>
            Street address
            <input
              required
              value={form.fullAddress}
              onChange={(event) => setForm({ ...form, fullAddress: event.target.value })}
            />
          </label>
          <label>
            City
            <input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
          <label>
            State
            <input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
          </label>
          <label>
            Landmark <span className="field-optional">(optional)</span>
            <input value={form.landmark ?? ""} onChange={(event) => setForm({ ...form, landmark: event.target.value })} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.isDefault ?? false}
              onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
            />
            Make default address
          </label>
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
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : editingId ? "Update address" : "Add address"}
            </button>
            {editingId && (
              <button className="btn secondary" type="button" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </span>
        </form>
      </section>
    </PageShell>
  );
}
