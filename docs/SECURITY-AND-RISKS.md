# Security and Risks

Real findings only. Severity is the author's judgment: **HIGH** (exploitable / money / data loss), **MEDIUM** (hardening gap), **LOW** (hygiene). All with file references.

## HIGH

1. **No rate limiting anywhere.** Only the `RATE_LIMITED (429)` code exists (`src/server/errors.ts:23,34`); no middleware, no Upstash dep. Login, register, OTP-verify (5 attempts per order but unlimited orders), password-reset, resend-mail, and Paystack verify endpoints are brute-force / mail-bomb / cost-amplification targets.
2. **Proxy bypass when `JWT_SECRET` unset** (`proxy.ts:67-71` returns `next()`). Safe in prod if the var is always set, but any misconfigured env silently disables all page gates (route handlers still guard — defense in depth holds only where `require*` is actually called).
3. **`GET /api/payments/verify?reference=` is customer-callable with only a reference string.** It re-verifies server-side with Paystack + amount check (`app/api/payments/verify/route.ts:23`, `paystack.ts:132`), so forgery is not possible — but reference enumeration by another logged-in customer relies on `getOrderForUser` ownership scoping (UNVERIFIED exact scoping; confirm it covers `findPaymentByReference` path).
4. **`payments.raw_payload JSONB` may retain full gateway responses** (`001_init.sql`, `paystack.ts:162 createPaymentRecord`). UNVERIFIED whether PAN-adjacent fields are stripped before insert — audit before live traffic.

## MEDIUM

5. **Webhook claim ordering.** `paystack_webhook_events.event_key ON CONFLICT DO NOTHING` is claimed *after* live re-verification (`app/api/webhooks/paystack/route.ts:168`) — correct for correctness, but a flood of forged webhooks each triggers an outbound Paystack verify call (cost/DoS amplification; rate-limit + verify-before-claim would help).
6. **Document/photo URL exposure UNVERIFIED.** Vendor profile photos are properly private (S3 signed views). `vendor_documents.url` / `rider_documents.url` serving model was not confirmed — if public URLs, IDs are enumerable.
7. **Local upload fallback writes to `public/uploads/`** when Cloudinary is unset (`app/api/uploads/route.ts`), blocked on Vercel but live on other hosts with only extension/MIME checks (5 MB, jpeg/png/webp/gif) + random names — ensure no execution (no `svg`/mime-sniffing) wherever self-hosted.
8. **Refresh cookie scope `/api/auth`** (`session.ts:23-55`) is good; access JWT is `sameSite:lax`, `secure` prod-only, `httpOnly` — confirm `secure` + HSTS in prod env (dev `http://localhost` relies on lax only).
9. **Admin force-cancel is broad** (`app/api/admin/orders/[id]/cancel/route.ts:21` blocks only DELIVERED/CANCELLED/REFUNDED) incl. `OUT_FOR_DELIVERY` — operationally necessary but financially sensitive; every call is audit-logged, still: restrict to named admins + require reason (UNVERIFIED reason field).
10. **Google-linking account takeover shape.** Linking by verified email (`google.ts:156-174`) trusts Google's `email_verified`; password remains set (UNVERIFIED whether password login stays enabled post-link — if yes, a leaked password still works alongside Google).

## LOW / hygiene

11. **Verbose error surfaces.** Reset-request route logs errors (`9bc08bb`); forgot-password/register are generic (good). Confirm no stack traces leak in prod `fail()` paths.
12. **No PII encryption at rest** (phone/bank/address stored plaintext; hashes only for passwords/tokens/OTPs). Acceptable for MVP with access controls, but state it in privacy docs.
13. **Seed demo password pattern** in `scripts/seed.ts` (`Demo_User_123!` observed) — harmless if demo seed never runs in prod (guarded by `ALLOW_DEMO_SEED`), still rotate any reused secrets.
14. **Legacy payout endpoint + CONFIRMED/REFUNDED dead states** (see KNOWN-ISSUES) widen audit surface — remove or gate them.

## What's done right

- scrypt passwords + timing-safe compare; SHA-256 opaque tokens; single-claim reset/verify tokens; hashed delivery OTPs (never stored plaintext, `015`).
- Paystack: server-side re-verify + amount/currency/reference match on both verify and webhook; HMAC-SHA512 webhook check; conditional `UPDATE … WHERE PENDING_PAYMENT`; unique `paystack_reference`; reconcile script.
- Payouts: ambiguous transfer errors never auto-refund; idempotency keys; cooling locks; hold-before-available; audit logs on admin money actions.
- Uploads: S3 private bucket, server-generated keys, HEAD + genuine-decode + EXIF strip + resize + re-encode, short-lived signed views.
- Cookies `httpOnly`; role enforcement at proxy + handler; `audit_logs` on admin mutations.

## Personal data handling (NIN/BVN)

No NIN/BVN collected — nothing to breach. Highest-sensitivity stored data: bank account numbers/names, addresses, phones, `payments.raw_payload`. Access: owner + admin roles only (UNVERIFIED field-level: confirm admin list endpoints don't over-return bank fields). Logging of sensitive data: token/password hashes never logged (observed); verify `raw_payload` and webhook bodies aren't written to logs (UNVERIFIED).
