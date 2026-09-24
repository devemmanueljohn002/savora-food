"use client";

import { FormEvent, useState } from "react";
import { AdminShell, AdminSignIn, naira } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useAdminPayouts, useAdminVendors, useCreateAdminPayout, useUpdateAdminPayout } from "@/lib/api/hooks";

function PayoutActions({ id, status }: { id: string; status: string }) {
  const update = useUpdateAdminPayout(id);
  const [error, setError] = useState("");

  async function set(next: "PROCESSING" | "PAID" | "FAILED") {
    setError("");
    try {
      await update.mutateAsync({ status: next });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <span>
      <span style={{ display: "inline-flex", gap: 8 }}>
        {status === "PENDING" && (
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => set("PROCESSING")}>
            Process
          </button>
        )}
        {(status === "PENDING" || status === "PROCESSING") && (
          <button className="btn btn-sm" disabled={update.isPending} onClick={() => set("PAID")}>
            Mark paid
          </button>
        )}
        {(status === "PENDING" || status === "PROCESSING") && (
          <button className="btn danger btn-sm" disabled={update.isPending} onClick={() => set("FAILED")}>
            Fail
          </button>
        )}
      </span>
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}

export default function AdminPayoutsPage() {
  const payouts = useAdminPayouts();
  const vendors = useAdminVendors({ status: "APPROVED", limit: 100 });
  const create = useCreateAdminPayout();
  const [vendorId, setVendorId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (payouts.isError) return <AdminSignIn />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payout = await create.mutateAsync({ vendorId });
      setMessage(`Payout ${payout.reference} created for ${naira(payout.net)}.`);
      setVendorId("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the payout.");
    }
  }

  return (
    <AdminShell title="Payouts" sub="Settle vendor balances from settled orders.">
      <form className="form-card" style={{ maxWidth: 640, marginBottom: 20 }} onSubmit={submit}>
        <h3 style={{ marginTop: 0 }}>Create payout</h3>
        <p className="muted">Computes the unsettled balance (gross − commission − fees − prior payouts).</p>
        <label>
          Vendor
          <select value={vendorId} onChange={(event) => setVendorId(event.target.value)} required>
            <option value="">Choose a vendor…</option>
            {(vendors.data?.items ?? []).map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.businessName}
              </option>
            ))}
          </select>
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
        <button className="btn" disabled={create.isPending || !vendorId}>
          {create.isPending ? "Creating…" : "Create payout"}
        </button>
      </form>

      <Table
        loading={payouts.isLoading}
        rows={payouts.data ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No payouts yet"
        columns={[
          {
            key: "ref",
            header: "Reference",
            render: (row) => (
              <div>
                <strong>{row.reference}</strong>
                <div className="muted-small">
                  {row.vendorName} · Gross {naira(row.gross)} · Commission {naira(row.commission)}
                </div>
              </div>
            ),
          },
          {
            key: "net",
            header: "Net",
            align: "right",
            render: (row) => <strong>{naira(row.net)}</strong>,
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span className={`badge ${row.status === "PAID" ? "badge-success" : row.status === "FAILED" ? "badge-danger" : "badge-warning"}`}>
                {row.status}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => <PayoutActions id={row.id} status={row.status} />,
          },
        ]}
      />
    </AdminShell>
  );
}
