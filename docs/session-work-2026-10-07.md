# Session work — 2026-10-07: Paystack withdrawal hardening + affiliate marketers

Commit: `d09e9a1` ("Add Paystack withdrawal hardening and affiliate marketers").
Verified: `npm run typecheck` clean, `npm test` 21 files / 184 passed, migrations `021` + `022` applied to the dev DB.

## Scope

Two-phase spec against the existing Savora Food codebase. Rule compliance:
real DB data everywhere (no mocks), server-side ledger balances, single
admin role only (no new roles — affiliates keep their existing user role),
everything marked CONFIGURABLE lives in `platform_settings.payout_config`.

## Phase 1 — withdrawals (vendors + riders)

Pre-existing rail (`src/server/wallet.ts`, `src/server/payouts.ts`,
`src/server/payments/transfers.ts`, `PayoutPanel`) was extended, not duplicated.

- Minimums: vendor **₦10,000**, rider **₦5,000** (were ₦1,000 both) — `wallet.ts` `WITHDRAWAL_LIMITS` / `RIDER_POLICY_FALLBACK`, migration `021`.
- Daily limits, server-enforced: vendor 2/day, rider 3/day (`resolveDailyLimit`, `countTodayWithdrawals`, enforced in `requestWithdrawal`).
- Transfer-fee preview: flat `transfer_fee_kobo` (default ₦100) + bearer `transfer_fee_bearer` (`USER` = deducted, `SAVORA` = platform absorbs). Recipient gets `amount − fee` under `USER`; per-request `fee_kobo`/`net_kobo` snapshot on `withdrawals`.
- Email OTP before every withdrawal: new `withdrawal_otps` table + `src/server/withdrawal-otp.ts` (6-digit, 10-min, hashed, single-use, 5-attempt cap) + `POST /vendor|/rider/withdrawals/otp`.
- Paystack reasons per rail: `Savora Food Vendor Payout` / `Savora Food Rider Payout` (`transferReasonFor`).
- Debit-on-request + reverse-on-definitive-failure kept; ambiguous (timeout/5xx) still parks as PROCESSING. Insufficient platform float now reverses and returns a friendly message.
- History table is Date | Amount | Bank | Status (Pending / Successful / Failed).
- Admin `/admin/payouts`: withdrawal queue (approve/reject) + settings form for all CONFIGURABLE knobs, incl. Auto-Approve vs Manual-Approve toggle (`payout_approval_mode`; MANUAL parks everything).

## Phase 2 — affiliates

- Migration `022_affiliates.sql`: `affiliates` (unique code, bank/recipient columns mirroring vendors/riders), `affiliate_clicks`, `affiliate_commissions` (UNIQUE `order_id`), `orders.affiliate_code/_id`; owner-type CHECKs rebuilt to admit `AFFILIATE`; hold-uniqueness index re-scoped per owner so vendor + affiliate holds coexist per order.
- `src/server/affiliates.ts`: registration (same Paystack verify → recipient flow), attribution, commission engine, stats, admin list/leaderboard/suspend.
- Attribution: `/ref/CODE` (click log + 7-day cookie, newest click overwrites) + checkout `referralCode` field. **Confirmed defaults: typed code beats cookie; most recent click wins.**
- Commission: **confirmed default 5% of item subtotal only, delivery fee excluded, discounts subtracted** (₦6,000 → ₦300); admin-switchable to flat-per-order. Created only once PAID (webhook + verify + reconcile hooks), held pending until DELIVERED, auto-released on balance reads (`releaseAffiliateHolds`); reversed on refund/cancel (`refundOrderPayment` covers all three cancel paths) and on `charge.dispute.*` webhooks.
- Anti-fraud: self-referral blocked by user id + phone; suspended/banned affiliates earn nothing further.
- UI: `/affiliate/register`, `/affiliate` dashboard (link, code, WhatsApp/Facebook/native-share/copy-for-Instagram, clicks, orders, earnings, available/pending, conversion), wallet reuses `PayoutPanel` + shared withdraw/OTP; `/admin/affiliates` (referrals, sales, paid, suspend/ban with required reason, monthly top-10) + commission-settings form.

## Follow-ups done (same session)

1. Defaults confirmed as implemented; user-facing copy verified consistent (register page, dashboard, overview API).
2. Affiliate commission settings UI added to `/admin/affiliates` (mode, %, flat, discount toggle, attribution window, min, daily limit, post-delivery hold).
3. `charge.dispute.*` webhook auto-reverses commissions (idempotent via `paystack_webhook_events`); order/payment review stays with support.

## Setup (production)

- No new env vars. Needs: `PAYSTACK_SECRET_KEY`, email provider (`BREVO_API_KEY` or `RESEND_API_KEY`, else OTPs only log), `APP_URL`/`SITE_URL`.
- Run `npm run db:migrate` (applies `021`, `022`).
- Paystack webhook `{APP_URL}/api/webhooks/paystack`: enable Transfer + Charge + Dispute events. Top up the Paystack balance (transfers debit it).
- Smoke tests: bank save → OTP → withdraw; admin approve; `/ref/<CODE>` → checkout attribution → pay → pending commission → delivery release; test dispute/transfer webhooks.

## Notes

- `next build` fails on this dev box only (no Turbopack/sharp native bindings for android/arm64); unrelated to these changes, builds normally on hosted infra.
- Single admin role rule kept: `requireAdminUser` everywhere, no finance role added.
