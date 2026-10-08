# Features

Status labels: **LIVE** (works end-to-end in code) · **PARTIAL** (works with gaps) · **PLANNED/IN-APP ONLY** (UI or constants without backend effect). Be honest — see `KNOWN-ISSUES-AND-ROADMAP.md` for the blunt list.

## 1. Authentication — LIVE (with gaps noted)

**Purpose:** identify users, keep sessions, separate 5 roles.

**Flow:**
- Email/phone + password register/login: `app/auth/page.tsx:41-147` (tabs + role picker) → `POST app/api/auth/register|login/route.ts`. Register validates with zod (`app/api/auth/register/route.ts:11-21`: phone `/^\+?[0-9]{7,15}$/`, password 8–128, role customer|vendor|rider) and auto-creates vendor (`createVendorProfile`, slug dedupe) or rider (`createDeliveryPartnerProfile`) profiles (`src/server/auth/store.ts:79-123`).
- Passwords: scrypt `N=16384,r=8,p=1` format `scrypt$N$r$p$salt$digest` (`src/server/auth/password.ts:21-47`).
- Sessions: short JWT access cookie `savora.access` (HS256, `iss` default `savora-food`, `aud savora-frontend`, TTL 30 min) + opaque rotating refresh cookie `savora.refresh` scoped to `/api/auth` (TTL 30 days) backed by `sessions` table (`src/server/auth/session.ts`, `session-flow.ts:13-30`, `store.ts:129-188`). Refresh rotates: new session + revoke old (`app/api/auth/refresh/route.ts:19-48`). Logout revokes + clears (`app/api/auth/logout/route.ts:7-23`).
- Google: `GET /api/auth/google` → Google authorize (`src/server/auth/google.ts:20-66`) → `GET /api/auth/callback/google` exchanges code, fetches profile, links by `google_sub` or verified email, else creates `CUSTOMER` with `email_verified_at=NOW()` and unusable password placeholder (`app/api/auth/callback/google/route.ts:33-101`, `google.ts:100-174`). Unverified Google email is rejected. **PARTIAL:** new Google users are always `CUSTOMER` — a vendor/rider cannot Google-register as their role (must register by email or be converted by admin — UNVERIFIED admin conversion path).
- Password reset: `POST forgot-password` always returns generic message, creates 30-min single-claim token, sends templated Brevo mail; mail failure is logged, not 500 (`app/api/auth/forgot-password/route.ts:9-48`, `src/server/auth/store.ts:190-237`, `src/server/email/index.ts:22-23 RESET_MINUTES=30`). `POST reset-password` consumes token, updates hash, revokes all sessions (`app/api/auth/reset-password/route.ts:8-34`).
- Email verification: 24h single-claim token sent fire-and-forget on register; resend endpoint is generic (`app/api/auth/register/route.ts:86-97`, `verify-email/route.ts`, `verify-email/send/route.ts`, `store.ts:241-294`).
- Role routing: `proxy.ts:33-51 PAGE_ROLES` + `proxy():61-89` (missing cookie → `/login?next=`; wrong role → role home). Matcher only covers `/account /cart /checkout /dashboard /vendor /admin /rider /super-admin` (`proxy.ts:92-93`). Role helpers: `src/lib/role-routes.ts:19-57`. **PARTIAL:** if `JWT_SECRET` is unset the proxy passes everything through (dev bypass, `proxy.ts:67-71`).

**Key files:** `proxy.ts`, `src/server/auth/*`, `app/api/auth/*`, `app/auth/page.tsx`, `app/login|register|forgot-password|reset-password|verify-email/page.tsx`.

**Edge cases:** suspended users get 403 (`login/route.ts:8-37`); `23505` email race → 409; Google `23505` race → link existing; OAuth errors mapped to `/auth?error=` values (`app/auth/page.tsx:53-60`).

## 2. Customer side

### Browsing / category / vendor / product pages — LIVE
Server components query `src/server/queries/catalog.ts` directly. Home (`app/page.tsx:94-101`) loads categories, featured products, top vendors, catering packages, locations in parallel. `app/food/page.tsx:17-38` (and `drinks|snacks|cakes` — same pattern, diff UNVERIFIED) parse filters then `listProducts({type,…})` + `listProductFacets`. `app/vendors/page.tsx:25-42` lists vendors + cities/categories. `app/vendor/[slug]/page.tsx:34-39` vendor + 48 products. `app/product/[slug]/page.tsx:40-48` product + 20 reviews + 4 related. Only `is_active` products of `APPROVED` vendors are listed (`catalog.ts:151-183`, `308-341`).

### Cart — LIVE
Client hooks (`src/lib/savora-api.ts:1683-1703`, `src/lib/api/hooks.ts`) over `GET/DELETE /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/[itemId]` (all `requireCustomer`). Server `src/server/queries/cart.ts:50-142`: `ensureCart`, `getCartView` (joins products+vendors → subtotal/itemCount/vendorCount), `assertPurchasable` (product active + available + vendor `APPROVED` + `is_open !== false`), upsert `(cart_id, product_id)`. UI (`app/cart/page.tsx:9-103`): qty steppers, line totals, subtotal, vendor count, "delivery fee added at checkout", multi-vendor "pay each vendor separately". Unauthenticated → sign-in prompt.

### Checkout + payment — LIVE
`app/checkout/page.tsx:18-50` (352-line client, totals UI UNVERIFIED in detail): address select + new-address form, coupon input, per-vendor quote lines; `?reference` switches to verify view. APIs: `POST /api/orders/checkout/quote` (preview, no writes) and `POST /api/orders/checkout` (`{addressId uuid, deliveryInstructions ≤2000, couponCode}`) → `expireStalePendingPayments` + `createOrdersFromCart` (`src/server/orders.ts:698`). One order per vendor (`groupCartByVendor:460-482`). Then `POST /api/payments/initialize` → Paystack URL → customer pays → `GET /api/payments/verify?reference=` or webhook `POST /api/webhooks/paystack` → `markOrderPaymentPaid` (see `BUSINESS-LOGIC.md`).

### Order tracking — LIVE
`app/track/page.tsx:16-50`: lookup by order number (`GET /api/orders/track`) + recent orders; 8 steps with `ORDER_RANK` map. Server `src/server/orders.ts:1003-1163` (`getOrderTrackingByNumber`, `deliveryProgressPct`).

### Favorites — LIVE
Heart buttons (`src/components/FavoriteButton.tsx`, 401 → `/auth`) over `GET/POST/DELETE /api/favorites` (`app/api/favorites/route.ts:41-174`): toggle semantics (existing → DELETE → `{favorited:false}`, else INSERT → 201). Dashboard favorites tab + `app/account/favorites/page.tsx:5` re-export (target UNVERIFIED).

### Dashboard — LIVE
`app/dashboard/page.tsx:23-60`: `RoleGuard` + tabs overview|orders|catering|favorites|notifications|profile; hooks `useAccount, useOrders, useCateringRequests, useFavorites, useConsumerOverview, useCancelOrder`; status badges (DELIVERED success, CANCELLED/REFUNDED danger, PENDING_PAYMENT warning).

## 3. Vendor side

### Onboarding + verification — PARTIAL
Register as vendor → profile `PENDING` → `/vendor/onboarding` (route protected `VENDOR` only, `proxy.ts:47`). Documents table `vendor_documents` (CAC_CERTIFICATE, PROOF_OF_IDENTITY, BUSINESS_LOGO, VENDOR_LICENSE, OTHER) exists (`migrations/001_init.sql`); vendor status flow `PENDING/UNDER_REVIEW/APPROVED/REJECTED/SUSPENDED` (same file). Approval itself is admin-side (UNVERIFIED exact UI/route — see `API.md` admin vendors). **No NIN/BVN step exists.**

### Product management + image uploads — LIVE (with Vercel caveat)
`GET/POST /api/vendor/products`, `GET/PATCH/DELETE /api/vendor/products/[id]`, variants `GET/POST /api/vendor/products/variants`, `PATCH /api/vendor/products/variants/[variantId]` (DELETE UNVERIFIED) — all `requireVendor`. Generic upload `POST /api/uploads` (`requireSession`, 5 MB, jpeg/png/webp/gif): Cloudinary when configured else local `public/uploads/YYYY/MM/` — **blocked on Vercel** with actionable error (`app/api/uploads/route.ts:7-68`, `src/server/cloudinary.ts:10-78`). Product image guard rejects ephemeral `/uploads/` URLs on Vercel (`src/server/product-images.ts:12-27`). Allowed remote hosts: `res.cloudinary.com, images.unsplash.com, placehold.co` (`next.config.ts:4-10`).

### Vendor profile photos — LIVE (S3 path, separate from product images)
Presigned POST → browser upload to `staging/:vendorId/:uuid` → `POST /finalize` (HEAD + genuine-decode, EXIF strip, resize ≤1024, re-encode to `vendors/:id/profile/:uuid`, store `profile_photo_key` only) → `GET /view` (short-lived URL, `requireSession`). Tables: `vendors.profile_photo_key`, `vendor_photo_cleanups`. (`src/server/storage/s3.ts|sigv4.ts|photos.ts`, migration `009`.)

### Order acceptance/rejection — LIVE
`PATCH /api/vendor/orders/[id]` actions `accept` (PAID→VENDOR_ACCEPTED), `reject` (PAID/VENDOR_ACCEPTED→CANCELLED + refund), `advance` (VENDOR_ACCEPTED→PREPARING→READY_FOR_PICKUP), `cancel` (blocks DELIVERED/CANCELLED/REFUNDED + OUT_FOR_DELIVERY). All guarded writes + history + notifications; reject/cancel restore stock, release coupon, call `refundOrderPayment`. (`app/api/vendor/orders/[id]/route.ts`, `src/server/orders.ts`, `src/server/refunds.ts:15`.)

### Earnings + payouts — LIVE
`GET /api/vendor/earnings`, `GET/POST /api/vendor/withdrawals`, `GET/POST /api/vendor/recipient`, bank list/resolve passthroughs. Flow: delivered orders → `order_settlements PAYABLE` → `wallet_entries hold` → release after hold days → withdraw (Paystack transfer; large amounts park as `awaitingApproval`). Shared engine `src/server/payouts.ts`, ledger `src/server/wallet.ts`, rail `src/server/payments/transfers.ts`. Details in `BUSINESS-LOGIC.md`.

## 4. Rider side — LIVE

Onboarding: register as rider → profile `OFFLINE`/`is_online FALSE` (`store.ts:110-123`); documents `rider_documents` (DRIVERS_LICENSE, PROOF_OF_IDENTITY, PROFILE_PHOTO, VEHICLE_DOCUMENT, OTHER) via `POST /api/rider/documents` (sets PENDING); gate `verification_status APPROVED` (`src/server/dispatch.ts:105-117,309-326`, `src/server/riders.ts:14-34`). Presence toggle syncs `status ↔ is_online` (fix `6c0e92f`, migration `011`).
Job flow: open board — `BOARD_STATUSES = PREPARING, READY_FOR_PICKUP` (`dispatch.ts:57`); `GET /api/rider/jobs` (`findBoardJobs:231`); atomic first-claim `POST /api/rider/jobs/accept` (`claimBoardJob:299`: `UPDATE … WHERE delivery_partner_id IS NULL AND payment PAID`); dismiss/release (`dismissBoardJob:465`, `releaseBoardJob:479`); escalation of unclaimed (`escalateUnclaimedJobs:557`). Targeted-offer engine was removed (`b0d7747`, `be8db17`).
Status updates: `PATCH /api/rider/deliveries/[id]` actions `going|arrived|pickup|in_transit|deliver|fail` with `ORDER_JUMP` map; pickup issues the customer handover code; fail returns order to `READY_FOR_PICKUP` and may credit a cancelled-pickup fee (`wallet.ts:468`).
Delivery verification: 4-digit OTP (`generateDeliveryOtp:105`, `hashDeliveryCode dispatch.ts:45`), max 5 attempts (`DELIVERY_CODE_MAX_ATTEMPTS:352`), hashes only (`015_delivery_code_hash.sql`); deliver requires `PICKED_UP/IN_TRANSIT` + correct code, then same-transaction delivery + credit (`creditRiderDeliveryTx wallet.ts:409`).
Payouts: same polymorphic wallet as vendors with rider-specific policy keys/hold (see `BUSINESS-LOGIC.md`).

## 5. Catering marketplace — PARTIAL

Browse packages (`app/catering/page.tsx:17`, `CateringMarketplace.tsx:32`, `GET /api/catering/packages`); estimate = `guestCount × pricePerGuest`; submit → `POST /api/catering/requests` (package must be active + vendor APPROVED; creates `SUBMITTED`). Customer: `GET /api/catering/requests`, `GET/PATCH /api/catering/requests/[id]` (`accept` QUOTED→BOOKED, `cancel`). Vendor: `GET /api/vendor/catering`, `GET/PATCH /api/vendor/catering/[id]` (`quote` → upsert `catering_quotes` + request `QUOTED`; `decline` → `DECLINED`). **Gaps:** request statuses `UNDER_REVIEW`/`ACCEPTED` and quote statuses have no observed writers; **catering payment is not in the order/payment flow** (UNVERIFIED how booked catering is paid).

## 6. Search engine, filters, suggestions — LIVE (no suggestions)

`parseFilters` (`src/lib/catalog-params.ts:20-36`) sanitizes q/city/sort/category/vendorId (UUID-guarded)/maxPrice/minRating/page. `listProducts`/`listVendors` (`catalog.ts:151-341`) filter + sort (newest/rating/popular/price) + paginate (default 24, max 48). Facets (`listProductFacets:429-489`): vendors, categories, maxPrice. UI: `CatalogFilters.tsx:30-62`, `MarketplaceBrowser.tsx:12-18`, `HeaderSearch.tsx:11-15` (plain push to `/search?q=`). **No autocomplete/suggestions logic exists** (grep `suggest` = zero).

## 7. Notifications — LIVE (two layers)

- In-app persistent: `notifications` table + `notifyUser` (`src/server/vendors.ts:44`) + `GET/PATCH /api/notifications` (`requireSession`).
- Ephemeral toasts/confirms: `ToastProvider/useToast/useNotify` (tones success|error|warning|info, 5s dismiss, `aria-live=polite`, `role=alert` on error) + `ConfirmProvider/useConfirm()->Promise<boolean>` (Esc cancels, danger red) — `src/components/ui/toast.tsx:1-93`, `ui/confirm.tsx:1-118`, wired in `Providers.tsx:8-30` → `app/layout.tsx:3,41`. Unified on Savora tokens (`cf5904f`). Details in `DESIGN-SYSTEM.md`.

## 8. Email system — LIVE (best-effort)

Provider: Brevo if `BREVO_API_KEY`, else Resend if `RESEND_API_KEY`, else dev `console.log` (`src/server/email/index.ts:33-104`). Sender `EMAIL_FROM` else `Savora Food <no-reply@savora.example>`. All templates `{subject, htmlContent, textContent}` on shared 600px `emailShell` (`layout.ts:26-216`). Previews at `app/email-preview/*` (verify, reset, OTP, payment-confirmed, delivered, vendor-new-order).

| Email | Trigger | Template fn |
|---|---|---|
| Verify email (24h) | register; resend endpoint | `buildVerifyEmail` (`auth-emails.ts:20-54`) |
| Password reset (30 min) | forgot-password | `buildResetEmail` (`:129-165`) |
| OTP/handshake code (10 min) | delivery code issue (UNVERIFIED exact send site) | `buildOtpEmail` (`:92-127`) |
| Payment confirmed | `markOrderPaymentPaid` (`orders.ts:1380-1394`) | `buildPaymentConfirmedEmail` (`order-emails.ts:127`) |
| Vendor new order | same, per vendor (`:1428-1449`) | `buildVendorNewOrderEmail` (`:58`) |
| Order delivered | post-commit in deliver action (`rider/deliveries/[id]/route.ts:436-437`) | `buildOrderDeliveredEmail` (`order-delivered.ts:81`) |

Fallback: mail failures are logged / fire-and-forget; forgot-password never 500s on mail failure; delivered-mail honors `users.email_updates_opt_out` (default FALSE, migration `012`), sending anyway if the column is unreadable (`email/index.ts:163-190`). Transactional footers carry no unsubscribe (`layout.ts:21-23`). Public unsubscribe uses HMAC tokens (`unsubscribe.ts:20-50`, `POST /api/email/unsubscribe`).

## 9. SEO — LIVE

Root metadata (`app/layout.tsx:11-35`): `metadataBase`, title template, description, `/favicon.png`, theme `#ff6500`, OG `savora-logo-wide.png` 1200×630, twitter card. Per-page titles/descriptions/canonicals + JSON-LD (Organization on home; Restaurant on vendor pages only when `ratingCount>0`; Product with NGN offers + stock). `app/sitemap.ts:8-62` (force-dynamic, 1h revalidate; statics + ≤2000 vendors + ≤5000 products; DB fail → statics only). `app/robots.ts:4-35` (allows `/`, disallows account/cart/checkout/orders/dashboards/auth/search/api + vendor/rider/admin internals; sitemap absolute URL). Protected/auth layouts add noindex (`4e7bc67`).

## 10. Reviews/ratings, pricing, fees — LIVE (formulas in BUSINESS-LOGIC.md)

- Reviews: `POST /api/products/[slug]/reviews` (`requireCustomer`, `{orderId uuid, rating 1–5, comment ≤2000}`): order must be own + `DELIVERED` + contain product; upsert on `(user_id,order_id,product_id,vendor_id)`; `GET` lists approved (limit ≤50). Eligibility helper `GET /api/orders/reviewable?productId=`. Averages via DB triggers `refresh_product_rating()/refresh_vendor_rating()` (`001_init.sql:388-439`). UI: `ReviewForm.tsx` (hides when nothing reviewable), `ReviewsList.tsx`.
- Pricing: service fee 5% default (or FLAT), tax 7.5% on `(subtotal − discount + serviceFee)` (`orders.ts:50-84, 412-457`). Delivery fee from `locations` by city else 0 (`:684-694`). Coupons PERCENT (capped 100) / FIXED (capped subtotal), vendor-scoped, atomic `used_count+1` (`:538-578, 630-746`). Split: 10% vendor commission, rider gets 100% of delivery fee by default, platform keeps service fee but not tax (`money.ts:12-88`). No global minimum order found (only `catering_packages.minimum_guests`).
