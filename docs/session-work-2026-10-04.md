# Savora Food — Session Work Log (2026-10-04)

Payouts, transactional email, and vendor profile photos, on the existing Next.js 16 + PostgreSQL codebase. All commits pushed to `main` (up to `ce506ac`); working tree work below is uncommitted.

## 1. Vendor withdrawals via Paystack Transfers (`a37f843`, 16 files)
- Wallet ledger: `vendor_wallets`, `vendor_wallet_entries`, `vendor_withdrawals` (migration `007_vendor_withdrawals.sql`), integer-kobo balances, immutable entries.
- Recipient resolve/create flow against Paystack; deduct-then-transfer orchestration with idempotency keys; auto-approve threshold vs finance approval.
- Transfer webhook: raw-body HMAC-SHA512 verification, event-key dedup, terminal-state replay safety, failed/reversed reversal restoring balances.
- Vendor UI: bank verify/save, withdrawal form, history; 61 tests passing at the time.

## 2. Forgot-password mail tolerance (`ad60942`)
- Mail-provider failure returns generic success (no email-enumeration leak), real error logged server-side with user context.

## 3. Rider payouts on polymorphic wallet (`aac788c`, 22 files, +2170/−734)
- Migration `008_polymorphic_wallets.sql`: vendor tables renamed to `wallets`/`wallet_entries`/`withdrawals` with `(owner_type, owner_id)`; legacy kinds mapped, originals kept in `meta.legacy_kind`.
- `src/server/wallet.ts` rewritten around `Owner = { type: VENDOR|RIDER, id }`; entry kinds `delivery_fee/tip/bonus/penalty/withdrawal/withdrawal_reversal`; `assertOwner` cross-type guard.
- Rider fee credited in the SAME transaction as confirmed delivery (OTP-gated via `requireDeliveryConfirmed`), frozen to `deliveries.rider_fee_kobo`, exactly one `delivery_fee` entry per delivery (unique index + `ON CONFLICT DO NOTHING`); guarded `UPDATE … WHERE status IN (…)` defeats double-completion.
- Fee formula unchanged (percentage: `deliveryFee × riderShareOfDeliveryFeePct / 100`, test-locked against `computeMoneySplit`); cancel-before-pickup earns 0, cancel-after-pickup earns configurable partial (default 50% — flagged assumption).
- Per-owner hold/min/max/auto-approve + 24h bank-change cooling for both rails; penalties may push balances negative, withdrawals blocked until positive.
- Shared `src/server/payouts.ts` service and `PayoutPanel` UI (no vendor/rider duplication); admin approve/reject/bonus/penalty for both rails. 75/75 tests.

## 4. APP_URL enforcement + templated reset email (`62241c7`, +307/−8)
- `APP_URL` required (throws if missing), trailing slashes stripped, prod-http warning (`src/server/env.ts`).
- `getPayoutSettings()` raw accessor — `normalizePayoutConfig` was silently dropping hold/limit/cooling keys.
- `src/server/email/templates.js` added byte-identical plus `.d.ts` shim; `RESET_MINUTES = 30`, `OTP_MINUTES = 10` shared constants; reset DB expiry 1h → 30 min.

## 5. Reset-request 500 fix (`9bc08bb`)
- Root cause (proven by live-DB probe): `make_interval(hours => 0.5)` does not resolve — hours is integer-typed. Store takes `expiresMinutes` + `make_interval(mins => …)`; verified ~30.0 min expiry, probe row deleted.
- Route logs message + stack (`[auth] forgot-password request failed`), still generic to client; frontend copy → "30 minutes".

## 6. Final email templates (`3ad0e05`, +59/−47)
- Hardcoded logo `https://savora-food.vercel.app/savora-logo-wide.png`, orange `#F26B00` button; `EMAIL_LOGO_URL` removed from code/tests/`.env.example`.
- Earlier production mail finding (kept for ops): Brevo rejected sends with 401 IP-allowlist (`authorised_ips`); Gmail From addresses risk spam filtering.

## 7. Vendor Payouts tab redesign (`55402a7`, +198/−97, UI-only)
- Mobile-first: 2×2 stat grid (4-col desktop, Available strongest), full-width withdraw card (Available/Min/Max chips, labels above inputs, ₦-prefix amount, 16px/48px inputs, 52px request button), tinted info/confirm/cooling boxes, ellipsis-safe history rows, compact empty states, header wrap fix, tabs scroll inside container.
- Shared `formatNaira` (`Intl en-NG NGN`, always 2 decimals); legacy `naira()` untouched elsewhere. Zero logic changes; rider Earnings inherits the improved shared panel.

## 8. Tabs overflow fix (`fc50225`, 1 line CSS)
- Removed negative margins that made `.vendor-tabs` 8px wider than the page container.

## 9. Vendor profile photos on private S3 (`ce506ac`, 15 files, +1606/−1)
- Dependency-free SigV4 (`src/server/storage/sigv4.ts`) — verified byte-for-byte against official AWS canonical-request/string-to-sign vectors and botocore's S3 presign signature. (Mirror `.authz` files carry one identical signature across tests with provably different canonical requests — treated as corrupt, documented.)
- Presigned POST (exact key + type + 1B–5MB range, 5-min expiry) — chosen over PUT because S3 cannot sign Content-Length.
- Finalize: prefix check → HEAD → download → pure header sniff → sharp re-encode (≤1024px, EXIF/GPS stripped, `.rotate()`) → row-locked DB swap → staged/old cleanup ledger. DB stores the key only.
- View: vendor-own / admin-lookup / assigned-rider-on-active-order, else 403; 5-min presigned GET.
- Migration `009_vendor_profile_photos.sql` applied and verified; profile UI with progress + consent note (recognition-only, never "verified"); `.env.example` gained `S3_*` names only.
- Verification: `tsc` clean, ESLint clean, **105 passed / 4 skipped (sharp-gated) / 0 failed**; secrets grep clean.

## Still requiring human action (not code)
- Vercel: `APP_URL=https://savora-food.vercel.app` (Production + redeploy); Brevo IP-allowlist fix.
- AWS: apply bucket/IAM/CORS/lifecycle from the photo report; set `S3_*` vars; redeploy. No live S3 call has run yet.
- Confirm `savora-logo-wide.png` serves; phone-check Payouts tab at 360/390px.
