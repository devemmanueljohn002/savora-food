"use client";

import { useRef, useState } from "react";
import { CircleCheck, Info, Wallet } from "lucide-react";
import { formatNaira } from "@/components/VendorShell";
import BankCombobox from "@/components/BankCombobox";
import type { PayoutOverview, PayoutRecipient, PayoutWithdrawal, PaystackBankOption } from "@/lib/savora-api";

/**
 * Shared payout panel — one implementation for vendors AND riders.
 *
 * All money handling lives here: naira → kobo conversion, the per-submit
 * idempotency key (so a double-click cannot debit twice), and the withdrawal
 * status copy. Owner-specific data/hooks are injected by the page, so neither
 * rail gets a private copy of this logic.
 *
 * Flow: enter amount → preview fee → send email OTP → enter OTP → confirm.
 * Balances, minimums, fees and daily limits all come from the server
 * overview (never client-side math for the actual debit).
 */
export type PayoutPanelProps = {
  ownerType: "VENDOR" | "RIDER" | "AFFILIATE";
  overview?: PayoutOverview | null;
  account?: PayoutRecipient | null;
  banks?: PaystackBankOption[] | null;
  banksLoading?: boolean;
  banksError?: string | null;
  onRetryBanks?: () => void;
  /** Used when the overview query has not resolved yet. */
  availableKobo: number;
  pendingKobo: number;
  /** "vendor" / "rider" — used in copy only. */
  subject: string;
  saving: boolean;
  withdrawing: boolean;
  onResolveAccount: (input: { accountNumber: string; bankCode: string }) => Promise<{ accountName: string }>;
  onSaveAccount: (input: {
    accountNumber: string;
    bankCode: string;
  }) => Promise<{ accountName?: string; reused?: boolean }>;
  onRequestOtp: () => Promise<{ expiresAt: string }>;
  onWithdraw: (input: { amountKobo: number; idempotencyKey: string; otpCode: string }) => Promise<PayoutWithdrawal>;
};

export function withdrawalBadge(status: string): string {
  if (status === "SUCCESS") return "badge-success";
  if (status === "FAILED" || status === "REVERSED") return "badge-danger";
  return "badge-warning";
}

/** Spec labels: Pending / Successful / Failed. */
export function withdrawalDisplayStatus(status: string): string {
  if (status === "SUCCESS") return "Successful";
  if (status === "FAILED" || status === "REVERSED") return "Failed";
  return "Pending";
}

function describeStatus(result: PayoutWithdrawal): string {
  const prefix = `Withdrawal ${result.reference}`;
  switch (result.status) {
    case "PENDING":
      return `${prefix} submitted — awaiting finance approval.`;
    case "OTP":
      return `${prefix} needs OTP approval in the Paystack dashboard.`;
    case "PROCESSING":
      return `${prefix} is processing. Status updates automatically.`;
    case "SUCCESS":
      return `${prefix} completed.`;
    default:
      return `${prefix}: ${result.status}${result.failureReason ? ` — ${result.failureReason}` : ""}`;
  }
}

function maskAccount(num: string | null | undefined): string {
  if (!num) return "—";
  if (num.length <= 4) return num;
  return `•••• ${num.slice(-4)}`;
}

export default function PayoutPanel(props: PayoutPanelProps) {
  const { account, banks, overview, subject } = props;
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [amount, setAmount] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);

  const canVerify = bankCode !== "" && /^\d{10}$/.test(accountNumber) && !resolving;

  function handleBankChange(code: string) {
    setBankCode(code);
    setResolvedName(null);
    setResolveError(null);
  }

  function handleAccountNumberChange(raw: string) {
    setAccountNumber(raw.replace(/\D/g, "").slice(0, 10));
    setResolvedName(null);
    setResolveError(null);
  }

  // One key per submit attempt, minted in the click handler (not render), so a
  // double-click reuses it and the server treats the 2nd POST as a duplicate.
  const idempotencyRef = useRef<string | null>(null);
  function nextIdempotencyKey(): string {
    if (!idempotencyRef.current) {
      idempotencyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return idempotencyRef.current;
  }

  async function handleResolve() {
    setResolveError(null);
    setResolvedName(null);
    if (!/^\d{10}$/.test(accountNumber)) {
      setResolveError("Enter a valid 10-digit account number.");
      return;
    }
    if (!bankCode) {
      setResolveError("Select a bank first.");
      return;
    }
    setResolving(true);
    try {
      const result = await props.onResolveAccount({ accountNumber, bankCode });
      setResolvedName(result.accountName);
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : "Could not verify this account.");
    } finally {
      setResolving(false);
    }
  }

  async function handleSave() {
    setFormError(null);
    setFormNote(null);
    try {
      const result = await props.onSaveAccount({ accountNumber, bankCode });
      setResolvedName(result.accountName ?? resolvedName);
      setFormNote(
        result.reused
          ? "Bank account already saved."
          : `Bank account verified${result.accountName ? ` (${result.accountName})` : ""} and saved.`,
      );
      idempotencyRef.current = null;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save bank account.");
    }
  }

  const amountNaira = Number(amount);
  const amountKobo = Number.isFinite(amountNaira) && amountNaira > 0 ? Math.round(amountNaira * 100) : 0;
  const feeKobo = overview?.fee?.feeKobo ?? 10_000;
  const feeBearer = overview?.fee?.bearer ?? "USER";
  const netKobo = feeBearer === "SAVORA" ? amountKobo : Math.max(0, amountKobo - feeKobo);
  const minKobo = overview?.limits.minKobo ?? 0;
  const belowMin = amountKobo > 0 && minKobo > 0 && amountKobo < minKobo;
  const aboveAvailable = amountKobo > 0 && amountKobo > props.availableKobo;

  function handleContinue() {
    setFormError(null);
    setFormNote(null);
    if (!Number.isFinite(amountNaira) || amountNaira <= 0) {
      setFormError("Enter a valid amount in naira.");
      return;
    }
    if (belowMin) {
      setFormError(
        `Minimum withdrawal is ${formatNaira((overview?.limits.min ?? minKobo / 100))}.`,
      );
      return;
    }
    if (aboveAvailable) {
      setFormError("Amount is above your available balance.");
      return;
    }
    setStep("confirm");
  }

  async function handleSendOtp() {
    setFormError(null);
    setSendingOtp(true);
    try {
      await props.onRequestOtp();
      setOtpSent(true);
      setFormNote("Code sent to your email. Enter it below to confirm.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not send the code.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleWithdraw() {
    setFormError(null);
    setFormNote(null);
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setFormError("Enter the 6-digit code sent to your email.");
      return;
    }
    try {
      const result = await props.onWithdraw({
        amountKobo,
        idempotencyKey: nextIdempotencyKey(),
        otpCode: otpCode.trim(),
      });
      setFormNote(describeStatus(result));
      setAmount("");
      setOtpCode("");
      setOtpSent(false);
      setStep("form");
      idempotencyRef.current = null;
    } catch (error) {
      // Keep the key on failure: an immediate retry hits the server's duplicate
      // path (existing row returned) instead of a second deduction.
      setFormError(error instanceof Error ? error.message : "Withdrawal failed.");
    }
  }

  const holdDays = overview?.limits.holdDays ?? 0;
  const daily = overview?.daily;
  const approvalMode = overview?.approvalMode ?? "AUTO";

  return (
    <div className="payout-panel">
      <h2 style={{ marginTop: 32 }}>Wallet</h2>
      <div className="payout-stats" style={{ marginBottom: 12 }}>
        <div className="stat-card payout-stat-strong">
          <div className="stat-card-top">Available for Withdrawal</div>
          <p className="stat-card-value">{formatNaira(props.availableKobo / 100)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">Pending Balance</div>
          <p className="stat-card-value">{formatNaira(props.pendingKobo / 100)}</p>
          <p className="muted-small">Earnings from orders not yet delivered.</p>
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>Withdraw to bank</h2>
      <div className="card card-body payout-form-card" style={{ padding: 20 }}>
        <div className="payout-chips" role="group" aria-label="Balance limits">
          <div className="payout-chip">
            <span className="payout-chip-label">Available</span>
            <span className="payout-chip-value">{formatNaira(props.availableKobo / 100)}</span>
          </div>
          <div className="payout-chip">
            <span className="payout-chip-label">Min</span>
            <span className="payout-chip-value">{overview ? formatNaira(overview.limits.min) : "—"}</span>
          </div>
          <div className="payout-chip">
            <span className="payout-chip-label">Max</span>
            <span className="payout-chip-value">{overview ? formatNaira(overview.limits.max) : "—"}</span>
          </div>
          {daily ? (
            <div className="payout-chip">
              <span className="payout-chip-label">Daily</span>
              <span className="payout-chip-value">
                {daily.remaining}/{daily.limit} left
              </span>
            </div>
          ) : null}
        </div>
        {props.pendingKobo > 0 ? (
          <p className="muted" style={{ margin: "0 0 4px" }}>
            {formatNaira(props.pendingKobo / 100)} still in hold.
          </p>
        ) : null}
        {account?.verified ? (
          <div className="confirm-box" role="status" style={{ marginTop: 12 }}>
            <CircleCheck aria-hidden="true" />
            <span>
              Saved account: <strong>{account.accountName}</strong> · {account.accountNumber}
            </span>
          </div>
        ) : (
          <p className="muted" style={{ margin: "12px 0 0" }}>
            Verify your bank account below before withdrawing.
          </p>
        )}
        {account?.coolingActive ? (
          <div className="cooling-box" role="alert" style={{ marginTop: 12 }}>
            <Info aria-hidden="true" />
            <span>
              For your protection, withdrawals are paused for {account.coolingHours}h after a bank account change
              {account.coolingEndsAt ? ` — available again ${new Date(account.coolingEndsAt).toLocaleString()}` : ""}.
            </span>
          </div>
        ) : null}

        <div className="payout-field" style={{ marginTop: 16 }}>
          <label className="field-label" htmlFor="payout-bank">
            Bank
          </label>
          <BankCombobox
            id="payout-bank"
            banks={banks}
            loading={props.banksLoading ?? false}
            error={props.banksError ?? null}
            onRetry={props.onRetryBanks}
            value={bankCode}
            onChange={handleBankChange}
          />
        </div>

        <div className="payout-field">
          <label className="field-label" htmlFor="payout-account">
            Account number
          </label>
          <input
            id="payout-account"
            className="input"
            value={accountNumber}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
            placeholder="10-digit account number"
            onChange={(event) => handleAccountNumberChange(event.target.value)}
          />
        </div>

        <div className="payout-actions">
          <button className="btn btn-secondary" type="button" onClick={handleResolve} disabled={!canVerify}>
            {resolving ? "Verifying…" : "Verify account"}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={handleSave}
            disabled={props.saving || !resolvedName}
            title={resolvedName ? "Save verified account" : "Verify the account first"}
          >
            {props.saving ? "Saving…" : "Save account"}
          </button>
        </div>
        {resolvedName ? <p className="auth-success">Account name: {resolvedName}</p> : null}
        {resolveError ? <p className="auth-error">{resolveError}</p> : null}

        {step === "form" ? (
          <>
            <div className="payout-field" style={{ marginTop: 4 }}>
              <label className="field-label" htmlFor="payout-amount">
                Amount (₦)
              </label>
              <div className="amount-wrap">
                <span className="amount-prefix" aria-hidden="true">
                  ₦
                </span>
                <input
                  id="payout-amount"
                  className="input"
                  value={amount}
                  inputMode="decimal"
                  placeholder="e.g. 10000"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
            </div>
            <button
              className="btn btn-block btn-tall"
              type="button"
              onClick={handleContinue}
              disabled={account?.coolingActive === true}
            >
              Continue
            </button>
          </>
        ) : (
          <div className="confirm-box" style={{ marginTop: 16, display: "block" }}>
            <p style={{ margin: "0 0 8px" }}>
              {feeBearer === "SAVORA" ? (
                <>
                  You will receive <strong>{formatNaira(netKobo / 100)}</strong> (Savora covers the{" "}
                  {formatNaira(feeKobo / 100)} Paystack charge).
                </>
              ) : (
                <>
                  You will receive <strong>{formatNaira(netKobo / 100)}</strong> ({formatNaira(feeKobo / 100)}{" "}
                  Paystack charge).
                </>
              )}
            </p>
            {approvalMode === "MANUAL" ? (
              <p className="muted-small" style={{ margin: "0 0 8px" }}>
                An admin will review this request before the transfer is sent.
              </p>
            ) : null}
            {!otpSent ? (
              <button
                className="btn btn-block"
                type="button"
                onClick={handleSendOtp}
                disabled={sendingOtp || props.withdrawing}
              >
                {sendingOtp ? "Sending code…" : "Send confirmation code"}
              </button>
            ) : (
              <>
                <label className="field-label" htmlFor="payout-otp">
                  6-digit email code
                </label>
                <input
                  id="payout-otp"
                  className="input"
                  value={otpCode}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
                />
                <div className="payout-actions" style={{ marginTop: 12 }}>
                  <button className="btn secondary" type="button" onClick={() => setStep("form")}>
                    Back
                  </button>
                  <button
                    className="btn btn-block btn-tall"
                    type="button"
                    onClick={handleWithdraw}
                    disabled={props.withdrawing || account?.coolingActive === true}
                  >
                    {props.withdrawing ? "Submitting…" : "Confirm withdrawal"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {formError ? <p className="auth-error">{formError}</p> : null}
        {formNote ? <p className="auth-success">{formNote}</p> : null}
        <div className="info-box" style={{ marginTop: 14 }}>
          <Info aria-hidden="true" />
          <span>
            Withdrawals under {overview ? formatNaira(overview.limits.autoApproveBelow) : "the threshold"} are sent
            automatically; larger ones need finance approval.
            {holdDays > 0
              ? ` ${subject === "rider" ? "Delivery fees" : "Earnings"} unlock after a ${holdDays}-day hold.`
              : ""}
          </span>
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>Withdrawal history</h2>
      {(overview?.withdrawals ?? []).length === 0 ? (
        <div className="empty-state payout-empty">
          <p className="empty-state-icon" aria-hidden="true">
            <Wallet />
          </p>
          <p className="empty-state-title">No withdrawals yet</p>
          <p className="empty-state-desc">
            {subject === "rider" ? "Delivery fees" : "Settled earnings"} unlock after the hold period, then you can
            withdraw them here.
          </p>
        </div>
      ) : (
        <div className="card card-body" style={{ overflowX: "auto", padding: 0 }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Date</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "left" }}>Bank</th>
                <th style={{ textAlign: "right" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.withdrawals ?? []).map((w) => (
                <tr key={w.id}>
                  <td>{new Date(w.createdAt).toLocaleString()}</td>
                  <td style={{ textAlign: "right" }} className="price">
                    {formatNaira(w.amount)}
                    {w.failureReason ? <div className="muted-small">{w.failureReason}</div> : null}
                  </td>
                  <td>
                    {w.accountNumber ? maskAccount(w.accountNumber) : "—"}
                    {w.bankCode ? <span className="muted-small"> · {w.bankCode}</span> : null}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`badge ${withdrawalBadge(w.status)}`}>{withdrawalDisplayStatus(w.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
