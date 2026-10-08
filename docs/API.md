# API Reference

Conventions: all JSON routes use envelope `ok(data, meta)` / `okMessage()` / `fail()` (`src/server/errors.ts:17-122`). Auth via `savora.access` cookie; guards in `src/server/auth/guard.ts` (`requireSession`, `requireCustomer`, `requireVendor`, `requireAdmin` = ADMIN+SUPER_ADMIN, `requireSuperAdmin`). **Rate limiting: none found** — only the `RATE_LIMITED (429)` code is defined (`errors.ts:23,34`); no middleware/Upstash. No `"use server"` server actions found.

Inputs/outputs below are from route + SDK reads; fine-grained schemas marked UNVERIFIED where the handler body was not fully read.

## Public (no auth)

| Method + path | Inputs | Outputs / notes |
|---|---|---|
| `GET /api/health` | — | liveness (added `4e173d7`) |
| `GET /api/categories`, `GET /api/locations` | — | storefront facets |
| `GET /api/products`, `GET /api/products/[slug]`, `GET /api/products/[slug]/reviews` | filters (q/city/sort/…); slug | catalog lists; reviews list (limit ≤50) |
| `GET /api/vendors`, `GET /api/vendors/[slug]`, `GET /api/vendors/[slug]/products` | search/city/category/sort/page | vendor lists/detail/products |
| `GET /api/catering/packages?limit≤48` | — | active packages |
| `GET /api/orders/track?number=` | order number | tracking view (UNVERIFIED exact shape) |
| `POST /api/auth/login` | `{identifier, password}` | 401 bad creds; 403 suspended; sets cookies |
| `POST /api/auth/register` | `{first, last, email, phone?, password 8–128, role=customer\|vendor\|rider}` | 201 + session; 409 duplicate; creates vendor/rider profile |
| `POST /api/auth/forgot-password` | `{email}` | always generic ok; sends 30-min mail if user exists |
| `POST /api/auth/reset-password` | `{token, password 8–128}` | 401 expired; revokes all sessions |
| `POST /api/auth/verify-email` | `{token}` | activates email |
| `POST /api/auth/verify-email/send` | `{email}` | generic ok; sends 24h mail if unverified |
| `POST /api/auth/refresh`, `POST /api/auth/logout` | cookies | rotate / revoke |
| `GET /api/auth`, `GET /api/auth/google`, `GET /api/auth/callback/google` | `?next`, `?code&state` | Google OAuth start/callback (UNVERIFIED `/api/auth` index purpose) |
| `POST /api/email/unsubscribe` | HMAC `{payload, sig}` 1yr TTL | opts out transactional updates |
| `POST /api/webhooks/paystack` | raw JSON + `x-paystack-signature` | 401 bad sig; charge.success + transfer.* handled |

## Customer (`requireCustomer`)

| Method + path | Inputs | Outputs / errors |
|---|---|---|
| `GET /api/auth/me` | cookie | public user payload (this one is `requireSession`) |
| `GET/DELETE /api/cart` | — | cart view / clear |
| `POST /api/cart/items` | `{productId, quantity}` (UNVERIFIED exact) | upsert; 4xx if unpurchasable |
| `PATCH/DELETE /api/cart/items/[itemId]` | `{quantity}` | set/remove |
| `POST /api/orders/checkout/quote` | `{addressId?, couponCode?}` | per-vendor totals preview, no writes |
| `POST /api/orders/checkout` | `{addressId uuid, deliveryInstructions≤2000, couponCode?}` | creates per-vendor `PENDING_PAYMENT` orders |
| `GET /api/orders`, `GET /api/orders/[id]` | `?page&limit` | own orders (UNVERIFIED filters) |
| `POST /api/orders/[id]/cancel` | — | only PENDING_PAYMENT/PAID else 409 |
| `GET /api/orders/reviewable?productId=` | uuid | delivered orders w/ reviewed flag |
| `POST /api/products/[slug]/reviews` | `{orderId uuid, rating 1–5, comment≤2000}` | 403 unless own DELIVERED order contains product; upsert 201 |
| `POST /api/payments/initialize` | `{orderId}` | `{authorization_url, reference}`; order must be PENDING_PAYMENT |
| `GET /api/payments/verify?reference=` | ref | idempotent; `{pendingConfirmation:true}` on DB race |
| `GET/POST /api/favorites`, (explicit `DELETE`) | `{productId?\|vendorId?}` toggle | `{favorited bool}`; 201 on create |
| `GET/POST /api/catering/requests`, `GET/PATCH /api/catering/requests/[id]` | package/event fields; `{accept\|cancel}` | SUBMITTED→QUOTED→BOOKED/DECLINED/CANCELLED |
| `GET/PATCH /api/notifications` | — | own notifications (this is `requireSession`) |
| `GET/POST /api/addresses`, `PATCH/DELETE /api/addresses/[id]` | address fields | own address book |
| `GET/PATCH /api/account`, `GET /api/account/overview`, `POST /api/account/password` | profile fields | own account |

## Vendor (`requireVendor`; some also allow ADMIN)

| Method + path | Notes |
|---|---|
| `GET/PATCH /api/vendor/onboarding` | onboarding state (VENDOR only) |
| `GET/POST /api/vendor/products`, `GET/PATCH/DELETE /api/vendor/products/[id]` | own catalog |
| `GET/POST /api/vendor/products/variants`, `PATCH /api/vendor/products/variants/[variantId]` | variants (DELETE UNVERIFIED) |
| `GET /api/vendor/orders`, `GET/PATCH /api/vendor/orders/[id]` | `accept/reject/advance/cancel` actions |
| `GET /api/vendor/catering`, `GET/PATCH /api/vendor/catering/[id]` | `{quote, decline}` |
| `GET/PATCH /api/vendor/profile` | own profile |
| `POST /api/vendor/profile-photo/upload`, `POST /api/vendor/profile-photo/finalize`, `GET /api/vendor/profile-photo/view` | S3 photo flow (view = `requireSession`) |
| `GET /api/vendor/analytics`, `GET /api/vendor/earnings` | stats (UNVERIFIED shapes) |
| `GET/POST /api/vendor/recipient`, `GET/POST /api/vendor/withdrawals` | `{accountNumber /^\d{10}$/, bankCode}`; `{amountKobo>0, idempotencyKey?}` |
| `GET /api/vendor/banks`, (resolve) | re-export of payouts banks |
| `POST /api/uploads` (`requireSession`) | generic image: 5 MB, jpeg/png/webp/gif → Cloudinary or local (Vercel-blocked) |

## Rider (`requireRole(DELIVERY_PARTNER[, ADMIN])`; jobs accept = DELIVERY_PARTNER only)

| Method + path | Notes |
|---|---|
| `GET /api/rider/jobs` | open board (`PREPARING, READY_FOR_PICKUP`) |
| `POST /api/rider/jobs/accept` | atomic first-claim `{orderId}` (UNVERIFIED exact field) |
| `POST /api/rider/jobs/decline`, `POST /api/rider/jobs/release` | dismiss / return job |
| `GET /api/rider/deliveries`, `GET/PATCH /api/rider/deliveries/[id]` | `going/arrived/pickup/in_transit/deliver/fail` |
| `POST /api/rider/locations` | lat/lng pings (UNVERIFIED exact) |
| `POST /api/rider/documents`, `GET/PATCH /api/rider/profile` | KYC-lite docs + profile |
| `GET /api/rider/earnings`, `GET/POST /api/rider/recipient`, `GET/POST /api/rider/withdrawals` | same wallet API as vendors |

## Shared payout helpers

| Method + path | Auth | Notes |
|---|---|---|
| `GET /api/payouts/banks`, `GET /api/payouts/banks/resolve` | VENDOR, DELIVERY_PARTNER, ADMIN, SUPER_ADMIN | bank list (24h cache) / account resolve |

## Admin (`requireAdminUser` = ADMIN + SUPER_ADMIN, most mutating write `auditLog`)

`GET /api/admin/overview`; `GET /api/admin/vendors|riders|customers|products|orders`; `GET/PATCH/DELETE /api/admin/vendors/[id]|riders/[id]|products/[id]|categories/[id]|coupons/[id]` (UNVERIFIED per-resource verbs — `GET/PATCH/DELETE` pattern + `GET/POST` on collections `categories|coupons|payouts`); `GET /api/admin/orders/[id]` (+settlements), `POST /api/admin/orders/[id]/cancel`, `POST /api/admin/orders/[id]/delivery-code`; `GET /api/admin/withdrawals`, `PATCH /api/admin/withdrawals/[id]` (approve/reject/bonus/penalty); legacy `GET/POST /api/admin/payouts`, `PATCH /api/admin/payouts/[id]`.

## Super-admin (`requireSuperAdmin`)

`GET/POST /api/super-admin/admins`, `PATCH /api/super-admin/admins/[id]`; `GET /api/super-admin/analytics`; `GET /api/super-admin/audit`; `GET/PATCH /api/super-admin/settings` (`KNOWN_KEYS` incl. `pricing_config`).

## Error model

`fail(code, message, status)`: `VALIDATION 400`, `UNAUTHORIZED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `CONFLICT 409`, `RATE_LIMITED 429` (defined, unenforced), `PAYMENT_REQUIRED 402`, `UPSTREAM 502`, `INTERNAL 500`. Transition violations → 409 with human text (`order-transitions.ts:27-33`).
