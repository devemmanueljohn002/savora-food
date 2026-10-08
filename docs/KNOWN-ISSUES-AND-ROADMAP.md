# Known Issues and Roadmap

Blunt list. Evidence: code reads + commit messages + grep. No filler.

## Known bugs / weak spots

1. **No rate limiting** (`src/server/errors.ts` defines 429, nothing enforces). Auth, OTP, mail-send, and verify endpoints are exposed.
2. **Dead order states.** `CONFIRMED` in `ORDER_STATUSES` but untransitionable (`order-transitions.ts:8-19`); vendor route comments it legacy. Order-status `REFUNDED` has no writer (paid cancels write `CANCELLED` + `payment_status REFUNDED`). Either wire or delete both.
3. **`payments.status` CHECK vs code mismatch.** Migration CHECK says `PENDING/SUCCESS/FAILED/REFUNDED` (`001_init.sql:322`); app `PAYMENT_STATUSES` says `PENDING/PAID/FAILED/REFUNDED` (`order-types.ts:59`). UNVERIFIED which column each governs — reconcile before touching either.
4. **Catering has no payment path.** Requests go SUBMITTED→QUOTED→BOOKED with no observed charge; `UNDER_REVIEW`/`ACCEPTED` request states and full quote-state coverage have no writers. Either build catering checkout or label it quote-only.
5. **Google sign-up is CUSTOMER-only** (`callback/google/route.ts:69-91`). Vendors/riders must use email or an admin conversion path (UNVERIFIED).
6. **`proxy.ts` passes through with no `JWT_SECRET`** (`:67-71`). Add startup fail-closed or alerting for prod.
7. **S3 pair for profile photos vs Cloudinary for everything else** — two upload systems, two credential sets, two failure modes. Product images break on Vercel without Cloudinary (`uploads/route.ts`, `product-images.ts:12-27`).
8. **`sharp` referenced for photo pipeline but not in `package.json` deps** (per evidence; run `npm ls sharp` to confirm) — build/runtime risk on fresh installs.
9. **Legacy `vendor_payouts` table + `POST /api/admin/payouts` aggregate math coexist with the wallet ledger.** UNVERIFIED which the admin UI uses — retire one.
10. **Migration prefix collision** (`005_otp_settlement` + `005_vendor_accept`). Works lexically today; rename to sequential on next schema change.
11. **`promotions` table + `vendor_staff` + `app/savora-backend/*` + `GET /api/auth` index purpose: UNVERIFIED** — confirm used or delete.
12. Only TODO-style comment found is the reconcile script's usage line; i.e. **TODOs live in commit messages, not code** — grep `TODO|FIXME` returns one hit (`scripts/reconcile-payments.ts:12`).

## Half-built / fake (IN-APP ONLY or PARTIAL)

- NIN/BVN verification: **does not exist** (zero `nin|bvn|kyc` hits). Any UI/marketing claiming it is false.
- Suggestions/autocomplete: **does not exist** (zero `suggest` hits); header search is a plain `?q=` push.
- Global minimum order: **none found** (only catering `minimum_guests`).
- Targeted single-rider offers: **removed** (`b0d7747`, `be8db17`); leftover references should be deleted if any remain (UNVERIFIED residue).
- `CONFIRMED` status badge in track UI may render for old rows that can never be produced again (UNVERIFIED rows exist).

## Missing tests (coverage UNVERIFIED — no coverage report found)

18 test files exist (`tests/`), but no coverage gate observed. Likely thin: webhook signature negative cases, transfer ambiguity matrix, coupon scoping, catering transitions, proxy role matrix, S3 finalize failures. Add per-file tests when touching money/auth.

## Prioritized next steps

1. Rate-limit auth + OTP + mail + payments/webhooks (HIGH, security).
2. Decide catering money path (HIGH, revenue correctness).
3. Kill or wire `CONFIRMED`/`REFUNDED`/legacy payouts; fix payment-status CHECK mismatch (MEDIUM, correctness).
4. Fail-closed proxy without `JWT_SECRET`; audit `raw_payload` redaction + document URL exposure (MEDIUM).
5. Unify uploads story for Vercel (Cloudinary required) or document self-host path (MEDIUM).
6. Vendor/rider Google onboarding or documented admin conversion (LOW-MEDIUM).
7. Rename `005_*` migration; add coverage gates on money/auth (LOW, hygiene).
