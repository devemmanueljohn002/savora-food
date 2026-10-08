"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageShell from "@/components/PageShell";
import BankCombobox from "@/components/BankCombobox";
import { usePayoutBanks, useRegisterAffiliate } from "@/lib/api/hooks";
import { resolvePayoutBankAccount } from "@/lib/savora-api";

export default function AffiliateRegisterPage() {
  const router = useRouter();
  const banks = usePayoutBanks();
  const register = useRegisterAffiliate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canVerify = bankCode !== "" && /^\d{10}$/.test(accountNumber) && !resolving;

  function handleBankChange(code: string) {
    setBankCode(code);
    setResolvedName(null);
  }

  function handleAccountNumberChange(digits: string) {
    setAccountNumber(digits.replace(/\D/g, "").slice(0, 10));
    setResolvedName(null);
  }

  async function verify() {
    setError("");
    setResolvedName(null);
    if (!bankCode) {
      setError("Select a bank first.");
      return;
    }
    if (!/^\d{10}$/.test(accountNumber)) {
      setError("Enter a valid 10-digit account number.");
      return;
    }
    setResolving(true);
    try {
      const result = await resolvePayoutBankAccount({ account_number: accountNumber, bank_code: bankCode });
      setResolvedName(result.accountName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not verify this account.");
    } finally {
      setResolving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (fullName.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number.");
      return;
    }
    if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
      setError("Add your bank details (bank + 10-digit account number).");
      return;
    }
    if (!resolvedName) {
      setError("Verify your bank account first.");
      return;
    }
    try {
      await register.mutateAsync({ fullName: fullName.trim(), phone: phone.trim(), accountNumber, bankCode });
      setMessage("Welcome aboard! Taking you to your dashboard…");
      router.push("/affiliate");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete registration.");
    }
  }

  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 640 }}>
        <h1 style={{ margin: "0 0 6px" }}>Become an Affiliate</h1>
        <p className="section-sub" style={{ marginTop: 0 }}>
          Share your referral link, earn commission on every qualifying order. Default rate: 5% of the item subtotal
          (excluding delivery fee, minus discounts).
        </p>
        <form className="form-card" onSubmit={submit}>
          <label>
            Full name
            <input value={fullName} placeholder="e.g. John Doe" onChange={(event) => setFullName(event.target.value)} required />
          </label>
          <label>
            Phone
            <input value={phone} inputMode="tel" placeholder="e.g. 0803 123 4567" onChange={(event) => setPhone(event.target.value)} required />
          </label>
          <h3>Bank details</h3>
          <p className="muted">Verified via Paystack before saving — one account per affiliate.</p>
          <label>
            Bank
            <BankCombobox
              id="affiliate-bank"
              banks={banks.data ?? null}
              loading={banks.isLoading}
              error={banks.isError ? (banks.error instanceof Error ? banks.error.message : "Could not load banks.") : null}
              onRetry={() => void banks.refetch()}
              value={bankCode}
              onChange={handleBankChange}
            />
          </label>
          <label>
            Account number
            <input
              value={accountNumber}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              placeholder="10-digit account number"
              onChange={(event) => handleAccountNumberChange(event.target.value)}
              required
            />
          </label>
          <button type="button" className="btn secondary" onClick={verify} disabled={!canVerify}>
            {resolving ? "Verifying…" : "Verify account"}
          </button>
          {resolvedName ? (
            <div className="confirm-box" role="status" style={{ marginTop: 12 }}>
              <span>
                Account verified: <strong>{resolvedName}</strong>
              </span>
            </div>
          ) : null}
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="auth-success" role="status">
              {message}
            </p>
          ) : null}
          <button className="btn" disabled={register.isPending || !resolvedName}>
            {register.isPending ? "Joining…" : "Join as affiliate"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          Already joined? <Link href="/affiliate">Open your dashboard</Link>
        </p>
      </section>
    </PageShell>
  );
}
