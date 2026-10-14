"use client";

import PayoutPanel from "@/components/PayoutPanel";
import { VendorShell, VendorSignIn, formatNaira } from "@/components/VendorShell";
import {
  useRequestVendorWithdrawal,
  useRequestVendorWithdrawalOtp,
  useSaveVendorRecipient,
  usePayoutBanks,
  useVendorEarnings,
  useVendorProfile,
  useVendorRecipient,
  useVendorWithdrawals,
} from "@/lib/api/hooks";
import { resolvePayoutBankAccount } from "@/lib/savora-api";

export default function VendorPayoutsPage() {
  const profile = useVendorProfile();
  const earnings = useVendorEarnings();
  const withdrawals = useVendorWithdrawals();
  const recipient = useVendorRecipient();
  const banks = usePayoutBanks();
  const saveRecipient = useSaveVendorRecipient();
  const requestWithdrawal = useRequestVendorWithdrawal();
  const requestOtp = useRequestVendorWithdrawalOtp();

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

  const wallet = withdrawals.data;
  const availableKobo = wallet?.availableKobo ?? earnings.data?.wallet?.availableKobo ?? 0;
  const pendingKobo = wallet?.pendingKobo ?? earnings.data?.wallet?.pendingKobo ?? 0;

  return (
    <VendorShell
      profile={profile.data}
      title="Earnings & payouts"
      sub={`Platform commission: ${earnings.data?.commissionRate ?? "—"}% of settled orders.`}
    >
      <div className="vendor-payouts">
      {earnings.isLoading ? (
        <p className="muted">Loading earnings…</p>
      ) : earnings.data ? (
        <>
          <div className="payout-stats">
            <div className="stat-card payout-stat-strong">
              <div className="stat-card-top">Available balance</div>
              <p className="stat-card-value">
                {formatNaira(earnings.data.wallet ? earnings.data.wallet.available : earnings.data.availableBalance)}
              </p>
            </div>
            <div className="stat-card">
              <div className="stat-card-top">Pending (hold period)</div>
              <p className="stat-card-value">{formatNaira(earnings.data.wallet?.pending ?? 0)}</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-top">Net · last 30 days ({earnings.data.last30Days.orders} orders)</div>
              <p className="stat-card-value">{formatNaira(earnings.data.last30Days.net)}</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-top">Total paid out</div>
              <p className="stat-card-value">{formatNaira(earnings.data.paidOut)}</p>
            </div>
          </div>

          <PayoutPanel
            ownerType="VENDOR"
            subject="vendor"
            overview={wallet ?? null}
            account={recipient.data ?? null}
            banks={banks.data ?? null}
            banksLoading={banks.isLoading}
            banksError={banks.isError ? (banks.error instanceof Error ? banks.error.message : "Could not load banks.") : null}
            onRetryBanks={() => void banks.refetch()}
            availableKobo={availableKobo}
            pendingKobo={pendingKobo}
            saving={saveRecipient.isPending}
            withdrawing={requestWithdrawal.isPending}
            onResolveAccount={async (input) =>
              resolvePayoutBankAccount({ account_number: input.accountNumber, bank_code: input.bankCode })
            }
            onSaveAccount={(input) => saveRecipient.mutateAsync(input)}
            onRequestOtp={() => requestOtp.mutateAsync()}
            onWithdraw={(input) => requestWithdrawal.mutateAsync(input)}
          />

          <h2 style={{ marginTop: 32 }}>Payout history</h2>
          {earnings.data.payouts.length === 0 ? (
            <div className="empty-state payout-empty">
              <p className="empty-state-title">No payouts yet</p>
              <p className="empty-state-desc">
                Settled earnings accumulate in your available balance. Payouts are processed by the Savora Food finance
                team.
              </p>
            </div>
          ) : (
            <div className="payout-list">
              {earnings.data.payouts.map((payout) => (
                <div className="payout-row" key={payout.id}>
                  <div className="payout-row-main">
                    <p className="payout-row-ref">{payout.reference}</p>
                    <p className="payout-row-sub">
                      {[payout.periodStart, payout.periodEnd].filter(Boolean).join(" → ") || "Ad-hoc"} · Gross{" "}
                      {formatNaira(payout.gross)} · Commission {formatNaira(payout.commission)}
                    </p>
                  </div>
                  <div className="payout-row-side">
                    <p className="payout-row-amt price">{formatNaira(payout.net)}</p>
                    <span
                      className={`badge ${payout.status === "PAID" ? "badge-success" : payout.status === "FAILED" ? "badge-danger" : "badge-warning"}`}
                    >
                      {payout.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="auth-error">Could not load earnings.</p>
      )}
      </div>
    </VendorShell>
  );
}