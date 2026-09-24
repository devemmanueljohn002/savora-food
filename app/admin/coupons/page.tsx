"use client";

import { FormEvent, useState } from "react";
import { AdminShell, AdminSignIn } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useAdminCoupons, useCreateAdminCoupon, useDeleteAdminCoupon, useUpdateAdminCoupon } from "@/lib/api/hooks";

function CouponActions({ id, isActive }: { id: string; isActive: boolean }) {
  const update = useUpdateAdminCoupon(id);
  const remove = useDeleteAdminCoupon();

  async function toggle() {
    try {
      await update.mutateAsync({ isActive: !isActive });
    } catch {
      // Surfaced by refetch state; errors are rare here.
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this coupon?")) return;
    await remove.mutateAsync(id);
  }

  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <button className="btn secondary btn-sm" disabled={update.isPending} onClick={toggle}>
        {isActive ? "Deactivate" : "Activate"}
      </button>
      <button className="btn danger btn-sm" disabled={remove.isPending} onClick={onDelete}>
        Delete
      </button>
    </span>
  );
}

export default function AdminCouponsPage() {
  const coupons = useAdminCoupons();
  const create = useCreateAdminCoupon();
  const [form, setForm] = useState({ code: "", type: "PERCENT", value: "", maxUses: "" });
  const [error, setError] = useState("");

  if (coupons.isError) return <AdminSignIn />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await create.mutateAsync({
        code: form.code,
        type: form.type as "PERCENT" | "FIXED",
        value: Number(form.value),
        ...(form.maxUses ? { maxUses: Number.parseInt(form.maxUses, 10) } : {}),
      });
      setForm({ code: "", type: "PERCENT", value: "", maxUses: "" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the coupon.");
    }
  }

  return (
    <AdminShell title="Coupons" sub="Discount codes for checkout (Phase 7 wires them into totals).">
      <form className="form-card" style={{ maxWidth: 640, marginBottom: 20 }} onSubmit={submit}>
        <h3 style={{ marginTop: 0 }}>Create coupon</h3>
        <div className="two-col">
          <label>
            Code
            <input required value={form.code} placeholder="WELCOME10" onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="PERCENT">Percent %</option>
              <option value="FIXED">Fixed ₦</option>
            </select>
          </label>
        </div>
        <div className="two-col">
          <label>
            Value
            <input required type="number" min={0} step="0.01" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
          </label>
          <label>
            Max uses <span className="field-optional">(optional)</span>
            <input type="number" min={1} step={1} value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: event.target.value })} />
          </label>
        </div>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create coupon"}
        </button>
      </form>

      <Table
        loading={coupons.isLoading}
        rows={coupons.data ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No coupons yet"
        columns={[
          {
            key: "code",
            header: "Code",
            render: (row) => (
              <div>
                <strong>{row.code}</strong>
                <div className="muted-small">
                  {row.type === "PERCENT" ? `${row.value}%` : `₦${row.value.toLocaleString("en-NG")}`} · Used{" "}
                  {row.usedCount}
                  {row.maxUses ? `/${row.maxUses}` : ""} · {row.vendorName ?? "Platform-wide"}
                </div>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span className={`badge ${row.isActive ? "badge-success" : "badge-warning"}`}>
                {row.isActive ? "Active" : "Inactive"}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => <CouponActions id={row.id} isActive={row.isActive} />,
          },
        ]}
      />
    </AdminShell>
  );
}
