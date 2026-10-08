"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminShell, AdminSignIn, naira } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm";
import {
  useAdminPayouts,
  useAdminPayoutSettings,
  useAdminVendors,
  useAdminWithdrawals,
  useCreateAdminPayout,
  useReviewAdminWithdrawal,
  useUpdateAdminPayout,
  useUpdateAdminPayoutSettings,
} from "@/lib/api/hooks";

function PayoutActions({ id, status }: { id: string; status: string }) {
  const update = useUpdateAdminPayout(id);
  const confirm = useConfirm();
  const [error, setError] = useState("");

  async function set(next: "PROCESSING" | "PAID" | "FAILED") {
    setError("");
    if (next === "PAID") {
      const ok = await confirm({
        title: "Mark payout as paid?",
        body: "Confirm the transfer already left the account before marking it paid.",
        confirmLabel: "Mark paid",
      });
      if (!ok) return;
    }
    if (next === "FAILED") {
      const ok = await confirm({
        title: "Mark payout as failed?",
        body: "The vendor will need a new payout to be settled.",
        confirmLabel: "Mark failed",
        danger: true,
      });
      if (!ok) return;
    }
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

function WithdrawalActions({ id, status, reference, amount, ownerName }: { id: string; status: string; reference: string; amount: number; ownerName: string }) {
  const review = useReviewAdminWithdrawal(id);
  const confirm = useConfirm();
  const [error, setError] = useState("");

  async function act(action: "approve" | "reject") {
    setError("");
    if (action === "approve") {
      const ok = await confirm({
        title: "Approve withdrawal?",
        body: `Approve ${naira(amount)} to ${ownerName} (${reference})? This sends the Paystack transfer.`,
        confirmLabel: "Approve & send",
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: "Reject withdrawal?",
        body: `Reject ${naira(amount)} to ${ownerName} (${reference})? The amount returns to their available balance.`,
        confirmLabel: "Reject",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await review.mutateAsync({ action });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  if (status !== "PENDING") return <span className="muted-small">—</span>;
  return (
    <span>
      <span style={{ display: "inline-flex", gap: 8 }}>
        <button className="btn btn-sm" disabled={review.isPending} onClick={() => act("approve")}>
          Approve &amp; send
        </button>
        <button className="btn danger btn-sm" disabled={review.isPending} onClick={() => act("reject")}>
          Reject
        </button>
      </span>
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function WithdrawalSettings() {
  const settings = useAdminPayoutSettings();
  const update = useUpdateAdminPayoutSettings();
  const [form, setForm] = useState({
    vendorMin: "",
    riderMin: "",
    vendorDaily: "",
    riderDaily: "",
    fee: "",
    bearer: "USER",
    mode: "AUTO",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings.data) {
      const v = settings.data;
      setForm({
        vendorMin: String(num(v.min_withdrawal_kobo, 1_000_000) / 100),
        riderMin: String(num(v.rider_min_withdrawal_kobo, 500_000) / 100),
        vendorDaily: String(num(v.vendor_daily_withdrawal_limit, 2)),
        riderDaily: String(num(v.rider_daily_withdrawal_limit, 3)),
        fee: String(num(v.transfer_fee_kobo, 10_000) / 100),
        bearer: v.transfer_fee_bearer === "SAVORA" ? "SAVORA" : "USER",
        mode: v.payout_approval_mode === "MANUAL" ? "MANUAL" : "AUTO",
      });
    }
  }, [settings.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await update.mutateAsync({
        min_withdrawal_kobo: Math.round(Number(form.vendorMin) * 100),
        rider_min_withdrawal_kobo: Math.round(Number(form.riderMin) * 100),
        vendor_daily_withdrawal_limit: Number(form.vendorDaily),
        rider_daily_withdrawal_limit: Number(form.riderDaily),
        transfer_fee_kobo: Math.round(Number(form.fee) * 100),
        transfer_fee_bearer: form.bearer,
        payout_approval_mode: form.mode,
      });
      setMessage("Withdrawal settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    }
  }

  return (
    <form className="form-card" style={{ maxWidth: 720, marginBottom: 20 }} onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>Withdrawal settings (CONFIGURABLE)</h3>
      <p className="muted">Stored in the DB (payout_config) — no redeploy needed.</p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label>
          Vendor minimum (₦)
          <input className="input" value={form.vendorMin} inputMode="numeric" onChange={(e) => setForm({ ...form, vendorMin: e.target.value })} required />
        </label>
        <label>
          Rider minimum (₦)
          <input className="input" value={form.riderMin} inputMode="numeric" onChange={(e) => setForm({ ...form, riderMin: e.target.value })} required />
        </label>
        <label>
          Vendor daily limit
          <input className="input" value={form.vendorDaily} inputMode="numeric" onChange={(e) => setForm({ ...form, vendorDaily: e.target.value })} required />
        </label>
        <label>
          Rider daily limit
          <input className="input" value={form.riderDaily} inputMode="numeric" onChange={(e) => setForm({ ...form, riderDaily: e.target.value })} required />
        </label>
        <label>
          Transfer fee (₦)
          <input className="input" value={form.fee} inputMode="numeric" onChange={(e) => setForm({ ...form, fee: e.target.value })} required />
        </label>
        <label>
          Fee paid by
          <select className="input" value={form.bearer} onChange={(e) => setForm({ ...form, bearer: e.target.value })}>
            <option value="USER">Deducted from user</option>
            <option value="SAVORA">Savora absorbs</option>
          </select>
        </label>
        <label>
          Approval mode
          <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="AUTO">Auto-Approve (threshold)</option>
            <option value="MANUAL">Manual-Approve (all)</option>
          </select>
        </label>
      </div>
      {message && <p className="auth-success" role="status">{message}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="btn" disabled={update.isPending || settings.isLoading}>
        {update.isPending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export default function AdminPayoutsPage() {
  const payouts = useAdminPayouts();
  const vendors = useAdminVendors({ status: "APPROVED", limit: 100 });
  const create = useCreateAdminPayout();
  const [vendorId, setVendorId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [wStatus, setWStatus] = useState("");
  const [wOwner, setWOwner] = useState("");
  const withdrawals = useAdminWithdrawals({
    ...(wStatus ? { status: wStatus } : {}),
    ...(wOwner ? { owner_type: wOwner } : {}),
  });

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
      <WithdrawalSettings />

      <h3>Withdrawal requests (vendors + riders)</h3>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <select value={wStatus} onChange={(e) => setWStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSING">Processing</option>
          <option value="SUCCESS">Successful</option>
          <option value="FAILED">Failed</option>
          <option value="REVERSED">Reversed</option>
        </select>
        <select value={wOwner} onChange={(e) => setWOwner(e.target.value)} aria-label="Filter by owner">
          <option value="">Vendors + Riders</option>
          <option value="VENDOR">Vendors</option>
          <option value="RIDER">Riders</option>
        </select>
      </div>
      <Table
        loading={withdrawals.isLoading}
        rows={withdrawals.data ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No withdrawal requests"
        columns={[
          {
            key: "ref",
            header: "Date · Reference",
            render: (row) => (
              <div>
                <strong>{row.reference}</strong>
                <div className="muted-small">
                  {new Date(row.createdAt).toLocaleString()} · {row.ownerType} · {row.ownerName}
                </div>
              </div>
            ),
          },
          {
            key: "bank",
            header: "Bank",
            render: (row) => (
              <div>
                {row.accountNumber ? `•••• ${row.accountNumber.slice(-4)}` : "—"}
                {row.accountName ? <div className="muted-small">{row.accountName}</div> : null}
              </div>
            ),
          },
          {
            key: "amount",
            header: "Amount",
            align: "right",
            render: (row) => <strong>{naira(row.amount)}</strong>,
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span
                className={`badge ${row.status === "SUCCESS" ? "badge-success" : row.status === "FAILED" || row.status === "REVERSED" ? "badge-danger" : "badge-warning"}`}
              >
                {row.status}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => <WithdrawalActions id={row.id} status={row.status} reference={row.reference} amount={row.amount} ownerName={row.ownerName ?? row.ownerType} />,
          },
        ]}
      />

      <form className="form-card" style={{ maxWidth: 640, marginBottom: 20, marginTop: 24 }} onSubmit={submit}>
        <h3 style={{ marginTop: 0 }}>Create payout (legacy vendor rail)</h3>
        <p className="muted">Computes the unsettled balance (gross − commission − fees − prior payouts).</p>
        <label>
          Vendor
          <select className="input" value={vendorId} onChange={(event) => setVendorId(event.target.value)} required>
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
