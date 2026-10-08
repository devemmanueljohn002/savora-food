"use client";

import Link from "next/link";
import { useState } from "react";
import PageShell from "@/components/PageShell";
import PayoutPanel from "@/components/PayoutPanel";
import { formatNaira } from "@/components/VendorShell";
import {
  useAffiliateOverview,
  useAffiliateProfile,
  useAffiliateRecipient,
  useAffiliateWithdrawals,
  usePayoutBanks,
  useRequestAffiliateWithdrawal,
  useRequestAffiliateWithdrawalOtp,
  useSaveAffiliateRecipient,
} from "@/lib/api/hooks";
import { resolvePayoutBankAccount } from "@/lib/savora-api";

function shareUrls(link: string, code: string) {
  const text = encodeURIComponent(`Order food on Savora Food with my code ${code}! ${link}`);
  const url = encodeURIComponent(link);
  return {
    whatsapp: `https://wa.me/?text=${text}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
  };
}

export default function AffiliateDashboardPage() {
  const profile = useAffiliateProfile();
  const overview = useAffiliateOverview();
  const withdrawals = useAffiliateWithdrawals();
  const recipient = useAffiliateRecipient();
  const banks = usePayoutBanks();
  const saveRecipient = useSaveAffiliateRecipient();
  const requestWithdrawal = useRequestAffiliateWithdrawal();
  const requestOtp = useRequestAffiliateWithdrawalOtp();
  const [copied, setCopied] = useState(false);

  if (profile.isLoading || overview.isLoading) {
    return (
      <PageShell>
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </PageShell>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <PageShell>
        <section className="section container" style={{ maxWidth: 640 }}>
          <h1> Affiliates</h1>
          <p className="muted">You have not joined the affiliate program yet.</p>
          <Link className="btn" href="/affiliate/register">
            Become an Affiliate
          </Link>
        </section>
      </PageShell>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <PageShell>
        <section className="section container">
          <p className="auth-error">Could not load your affiliate dashboard.</p>
        </section>
      </PageShell>
    );
  }

  const data = overview.data;
  const wallet = withdrawals.data;
  const links = shareUrls(data.affiliate.referralLink, data.affiliate.code);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(data.affiliate.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: "Savora Food", text: `Order with my code ${data.affiliate.code}`, url: data.affiliate.referralLink });
    } catch {
      // user dismissed — nothing to do
    }
  }

  return (
    <PageShell>
      <section className="section container">
        <h1 style={{ margin: "0 0 6px" }}>Affiliate Dashboard</h1>
        <p className="section-sub" style={{ marginTop: 0 }}>
          {data.affiliate.fullName} · Code <strong>{data.affiliate.code}</strong>
        </p>

        <div className="card card-body" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Your referral link</h3>
          <p className="row" style={{ wordBreak: "break-all" }}>
            <strong>{data.affiliate.referralLink}</strong>
          </p>
          <div className="payout-actions">
            <a className="btn secondary btn-sm" href={links.whatsapp} target="_blank" rel="noreferrer">
              Share on WhatsApp
            </a>
            <a className="btn secondary btn-sm" href={links.facebook} target="_blank" rel="noreferrer">
              Share on Facebook
            </a>
            <button className="btn secondary btn-sm" type="button" onClick={copyLink}>
              {copied ? "Copied!" : "Copy link (paste in Instagram Story)"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <button className="btn secondary btn-sm" type="button" onClick={nativeShare}>
                More…
              </button>
            ) : null}
          </div>
          <p className="muted-small">
            Shoppers can also enter <strong>{data.affiliate.code}</strong> at checkout. A typed code beats a link
            click; the most recent click wins between links. Commission:{" "}
            {data.commission.mode === "FLAT"
              ? `${formatNaira(data.commission.flat)} per qualifying order`
              : `${data.commission.pct}% of ${data.commission.baseRule}`}
          </p>
        </div>

        <div className="payout-stats">
          <div className="stat-card">
            <div className="stat-card-top">Link clicks</div>
            <p className="stat-card-value">{data.stats.clicks.toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <div className="stat-card-top">Orders attributed</div>
            <p className="stat-card-value">{data.stats.orders.toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <div className="stat-card-top">Conversion rate</div>
            <p className="stat-card-value">{data.stats.conversionRate}%</p>
          </div>
          <div className="stat-card">
            <div className="stat-card-top">Total earnings</div>
            <p className="stat-card-value">{formatNaira(data.stats.earnings)}</p>
          </div>
          <div className="stat-card payout-stat-strong">
            <div className="stat-card-top">Available balance</div>
            <p className="stat-card-value">{formatNaira(data.wallet.available)}</p>
          </div>
          <div className="stat-card">
            <div className="stat-card-top">Pending balance</div>
            <p className="stat-card-value">{formatNaira(data.wallet.pending)}</p>
            <p className="muted-small">Commission on undelivered orders.</p>
          </div>
        </div>

        <PayoutPanel
          ownerType="AFFILIATE"
          subject="affiliate"
          overview={wallet ?? null}
          account={recipient.data ?? null}
          banks={banks.data ?? null}
          banksLoading={banks.isLoading}
          banksError={banks.isError ? (banks.error instanceof Error ? banks.error.message : "Could not load banks.") : null}
          onRetryBanks={() => void banks.refetch()}
          availableKobo={wallet?.availableKobo ?? data.wallet.availableKobo}
          pendingKobo={wallet?.pendingKobo ?? data.wallet.pendingKobo}
          saving={saveRecipient.isPending}
          withdrawing={requestWithdrawal.isPending}
          onResolveAccount={async (input) =>
            resolvePayoutBankAccount({ account_number: input.accountNumber, bank_code: input.bankCode })
          }
          onSaveAccount={(input) => saveRecipient.mutateAsync(input)}
          onRequestOtp={() => requestOtp.mutateAsync()}
          onWithdraw={(input) => requestWithdrawal.mutateAsync(input)}
        />
      </section>
    </PageShell>
  );
}
