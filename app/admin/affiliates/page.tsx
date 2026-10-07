"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminShell, AdminSignIn, naira } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import {
  useAdminAffiliates,
  useAdminPayoutSettings,
  useAffiliateLeaderboard,
  useUpdateAdminAffiliate,
  useUpdateAdminPayoutSettings,
} from "@/lib/api/hooks";

function AffiliateActions({ id, status }: { id: string; status: string }) {
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState<"suspend" | "ban" | null>(null);
  const [error, setError] = useState("");
  const update = useUpdateAdminAffiliate(id);

  async function act(action: "suspend" | "ban" | "reactivate", value?: string) {
    setError("");
    try {
      await update.mutateAsync({ action, ...(value !== undefined ? { reason: value } : {}) });
      setShowReason(null);
      setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    }
  }

  if (status === "ACTIVE") {
    return (
      <span>
        <span style={{ display: "inline-flex", gap: 8 }}>
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => setShowReason("suspend")}>
            Suspend
          </button>
          <button className="btn danger btn-sm" disabled={update.isPending} onClick={() => setShowReason("ban")}>
            Ban
          </button>
        </span>
        {showReason ? (
          <span style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              value={reason}
              placeholder="Reason (required)"
              onChange={(event) => setReason(event.target.value)}
            />
            <button
              className="btn btn-sm"
              disabled={update.isPending || !reason.trim()}
              onClick={() => act(showReason, reason)}
            >
              Confirm
            </button>
          </span>
        ) : null}
        {error && <span className="auth-error">{error}</span>}
      </span>
    );
  }
  return (
    <span>
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-sm" disabled={update.isPending} onClick={() => act("reactivate")}>
          Reactivate
        </button>
      </span>
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function AffiliateCommissionSettings() {
  const settings = useAdminPayoutSettings();
  const update = useUpdateAdminPayoutSettings();
  const [form, setForm] = useState({
    mode: "PERCENT",
    pct: "",
    flat: "",
    min: "",
    daily: "",
    hold: "",
    attributionDays: "",
    subtractsDiscount: true,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings.data) {
      const v = settings.data;
      setForm({
        mode: v.affiliate_commission_mode === "FLAT" ? "FLAT" : "PERCENT",
        pct: String(num(v.affiliate_commission_pct, 5)),
        flat: String(num(v.affiliate_commission_flat_kobo, 0) / 100),
        min: String(num(v.affiliate_min_withdrawal_kobo, 300_000) / 100),
        daily: String(num(v.affiliate_daily_withdrawal_limit, 2)),
        hold: String(num(v.affiliate_hold_days, 0)),
        attributionDays: String(num(v.affiliate_attribution_days, 7)),
        subtractsDiscount: bool(v.affiliate_base_subtracts_discount, true),
      });
    }
  }, [settings.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await update.mutateAsync({
        affiliate_commission_mode: form.mode,
        affiliate_commission_pct: Number(form.pct),
        affiliate_commission_flat_kobo: Math.round(Number(form.flat) * 100),
        affiliate_min_withdrawal_kobo: Math.round(Number(form.min) * 100),
        affiliate_daily_withdrawal_limit: Number(form.daily),
        affiliate_hold_days: Number(form.hold),
        affiliate_attribution_days: Number(form.attributionDays),
        affiliate_base_subtracts_discount: form.subtractsDiscount,
      });
      setMessage("Affiliate settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    }
  }

  return (
    <form className="form-card" style={{ maxWidth: 760, marginBottom: 20 }} onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>Commission settings (CONFIGURABLE)</h3>
      <p className="muted">
        Stored in the DB — no redeploy needed. Base rule: item subtotal only, delivery fee never included.
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label>
          Commission mode
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="PERCENT">Percentage of base</option>
            <option value="FLAT">Flat amount per order</option>
          </select>
        </label>
        {form.mode === "PERCENT" ? (
          <label>
            Percentage (%)
            <input value={form.pct} inputMode="decimal" onChange={(e) => setForm({ ...form, pct: e.target.value })} required />
          </label>
        ) : (
          <label>
            Flat amount per order (₦)
            <input value={form.flat} inputMode="numeric" onChange={(e) => setForm({ ...form, flat: e.target.value })} required />
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={form.subtractsDiscount}
            onChange={(e) => setForm({ ...form, subtractsDiscount: e.target.checked })}
          />{" "}
          Subtract discounts from base
        </label>
        <label>
          Attribution window (days)
          <input value={form.attributionDays} inputMode="numeric" onChange={(e) => setForm({ ...form, attributionDays: e.target.value })} required />
        </label>
        <label>
          Minimum withdrawal (₦)
          <input value={form.min} inputMode="numeric" onChange={(e) => setForm({ ...form, min: e.target.value })} required />
        </label>
        <label>
          Daily withdrawal limit
          <input value={form.daily} inputMode="numeric" onChange={(e) => setForm({ ...form, daily: e.target.value })} required />
        </label>
        <label>
          Hold after delivery (days)
          <input value={form.hold} inputMode="numeric" onChange={(e) => setForm({ ...form, hold: e.target.value })} required />
        </label>
      </div>
      {message && <p className="auth-success" role="status">{message}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="btn" disabled={update.isPending || settings.isLoading}>
        {update.isPending ? "Saving…" : "Save affiliate settings"}
      </button>
    </form>
  );
}

export default function AdminAffiliatesPage() {
  const affiliates = useAdminAffiliates();
  const leaderboard = useAffiliateLeaderboard();

  if (affiliates.isError) return <AdminSignIn />;

  return (
    <AdminShell title="Affiliates" sub="Referral marketers, their sales, and payouts.">
      <AffiliateCommissionSettings />

      <h3>Monthly leaderboard (top 10)</h3>
      <Table
        loading={leaderboard.isLoading}
        rows={leaderboard.data ?? []}
        keyOf={(row) => row.affiliateId}
        emptyTitle="No sales this month"
        columns={[
          {
            key: "affiliate",
            header: "Affiliate",
            render: (row) => (
              <div>
                <strong>{row.fullName}</strong>
                <div className="muted-small">
                  {row.code} · {row.orders} orders
                </div>
              </div>
            ),
          },
          {
            key: "sales",
            header: "Sales",
            align: "right",
            render: (row) => <strong>{naira(row.sales)}</strong>,
          },
          {
            key: "earnings",
            header: "Earnings",
            align: "right",
            render: (row) => naira(row.earnings),
          },
        ]}
      />

      <h3 style={{ marginTop: 28 }}>All affiliates</h3>
      <Table
        loading={affiliates.isLoading}
        rows={affiliates.data ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No affiliates yet"
        columns={[
          {
            key: "affiliate",
            header: "Affiliate",
            render: (row) => (
              <div>
                <strong>{row.fullName}</strong>
                <div className="muted-small">
                  {row.code} · {row.email ?? "—"} · {row.phone ?? "—"}
                </div>
                {row.statusReason ? <div className="muted-small">Reason: {row.statusReason}</div> : null}
              </div>
            ),
          },
          {
            key: "referrals",
            header: "Referrals",
            align: "right",
            render: (row) => row.referrals,
          },
          {
            key: "sales",
            header: "Sales",
            align: "right",
            render: (row) => <strong>{naira(row.sales)}</strong>,
          },
          {
            key: "paid",
            header: "Paid",
            align: "right",
            render: (row) => naira(row.paid),
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span
                className={`badge ${row.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}
              >
                {row.status}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => <AffiliateActions id={row.id} status={row.status} />,
          },
        ]}
      />
    </AdminShell>
  );
}
