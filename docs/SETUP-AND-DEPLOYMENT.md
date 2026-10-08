# Setup and Deployment

## Run locally from scratch

Prereqs: Node 18+ (UNVERIFIED exact version — no `.nvmrc`/engines found), Postgres (any reachable instance), npm.

```bash
npm install
cp .env.example .env.local   # then fill values below
npm run db:migrate
npm run db:seed:admin         # admins only (safe)
npm run dev                   # http://localhost:3000
```

Useful: `npm test` (vitest run), `npm run typecheck` (`tsc --noEmit`), `npm run lint`, `npm run build`/`start`, `npm run db:reconcile -- --dry-run`.

### Termux/Android

No Termux-specific code or scripts found in the repo (no `termux` hits expected; `AGENTS.md` is the only platform-adjacent file and contains Next.js agent rules only). Standard `npm install / dev / migrate / seed` applies. Caveats (UNVERIFIED on-device): Postgres must be reachable (local Termux postgres or remote URL in `DATABASE_URL`); `sharp`-based photo finalize and `next build` are memory-heavy on phones — prefer running migrate/seed/dev, and deploy builds on Vercel.

## Environment variables (NAMES only — no values)

| Name | For |
|---|---|
| `APP_URL` | REQUIRED. Public frontend origin; builds email links + Paystack callback. `http://localhost:3000` local, `https://…` prod (`resolveAppUrl`, `src/server/env.ts:44-54`) |
| `SITE_URL` | Canonical/OG/sitemap origin; falls back to `APP_URL` |
| `DATABASE_URL` | REQUIRED. Postgres connection string |
| `JWT_SECRET` | REQUIRED. Session signing secret (long random) |
| `JWT_ISSUER` | Token issuer (default `savora-food`) |
| `ACCESS_TOKEN_TTL_MINUTES` | Access JWT TTL (default 30) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh TTL (default 30) |
| `PAYSTACK_SECRET_KEY` | REQUIRED for payments. Verify/refund/transfers server-side |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key (UNVERIFIED client use) |
| `BREVO_API_KEY` | Email provider, preferred |
| `RESEND_API_KEY` | Email fallback |
| `EMAIL_FROM` | Verified sender, e.g. `Savora Food <no-reply@domain>` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `CLOUDINARY_FOLDER` | Generic uploads (default folder `savora`) |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Private vendor-photo bucket (least-privilege `vendors/*` + `staging/*`) |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | Admin seed identity |
| `SUPER_ADMIN_SEED_EMAIL` / `SUPER_ADMIN_SEED_PASSWORD` | Super-admin seed identity |
| `RIDER_SEED_EMAIL` / `RIDER_SEED_PASSWORD` | Demo rider (seen in env grep; UNVERIFIED in `.env.example`) |
| `ALLOW_DEMO_SEED` / `SEED_ADMIN_ONLY` | Seed safety flags |
| `API_URL` | API base override (default `/api`) |

`getEnv()` (`src/server/env.ts:61-102`) throws at request/script time (never import time) when `DATABASE_URL`/`JWT_SECRET`/`APP_URL` are missing, so `next build` works unconfigured.

## Database setup and migrations

- `npm run db:migrate` → `tsx scripts/migrate.ts`: loads `.env.local`→`.env`, ensures `schema_migrations`, applies `src/server/migrations/*.sql` in sorted order inside a transaction. 18 files (`001_init`…`017_paystack_reference`); note `005_otp_settlement` and `005_vendor_accept` share a prefix (UNVERIFIED ordering sensitivity — sorted lexically).
- Fresh DB: migrate then `db:seed:admin`. Existing DB: migrate is additive (UNVERIFIED rollback story — no down migrations).

## Seeding

`scripts/seed.ts:666-1022` refuses demo seed unless `ALLOW_DEMO_SEED=1` or `--admin-only`. `npm run db:seed:admin` (`--admin-only`) upserts ADMIN + SUPER_ADMIN only. Full `npm run db:seed` (dev only) creates demo customer/rider, 6 vendors + pending `fresh-bites`, 15 products, categories/locations/catering, demo orders `SV-DEMO-100*`, reviews, variants, coupons (`WELCOME10/SAVE1500/ROYAL5`), payout + notifications. Demo customer password pattern `Demo_User_123!` observed in evidence (UNVERIFIED current value — read the script before sharing).

## Scripts

| Script | Command |
|---|---|
| dev / build / start / lint / typecheck / test | `next dev` / `next build` / `next start` / `eslint` / `tsc --noEmit` / `vitest run` |
| `db:migrate` | `tsx scripts/migrate.ts` |
| `db:seed` / `db:seed:admin` | `tsx scripts/seed.ts` / `… --admin-only` |
| `db:reconcile` | `tsx scripts/reconcile-payments.ts [--dry-run] [--limit 50] [--reference SV-XXX]` |

Tests: `vitest.config.mts` (node, `tests/**/*.test.ts`, `@→src`); 18 files incl. `auth, catalog, dispatch, board-dispatch, lifecycle-guards, orders, otp-handoff, google-auth, email-templates, order-delivered, seo, withdrawals, rider-payouts, vendor-profile-photo, product-images, role-routes, app-url, workflow` + `fixtures/photo-valid-1x1.png`.

## Deploy on Vercel

1. Import repo; set env vars per environment (preview vs production): at minimum `APP_URL` (per-env URL), `SITE_URL`, `DATABASE_URL` (pooled — `prepare:false` is pooler-friendly, `db.ts`), `JWT_SECRET`, `PAYSTACK_SECRET_KEY` (+public), one email key + `EMAIL_FROM`, Google pair if used, Cloudinary and/or S3 sets.
2. Run migrations against prod DB (`db:migrate` with prod `DATABASE_URL`), then `db:seed:admin` once.
3. `npm run build` must pass `typecheck`-adjacent strictness (see fixes `087ba03`, `bfa4435`).

### Paystack test vs live

Key switch only — no code flag found (UNVERIFIED dashboard-side webhook/keys rotation procedure). Test with test secret + test cards, verify `charge.success` → order `PAID`, then swap to live key. Re-run `db:reconcile --dry-run` after switching.

### Google OAuth redirect URIs

Register exactly `{APP_URL}/api/auth/callback/google` per environment (documented in `.env.example:31-33`). Mismatch → `/auth?error=…`.

### Webhook URLs to register

- Paystack: `{APP_URL}/api/webhooks/paystack` for `charge.success` (payments) and `transfer.*` (payouts). No signature secret to register — verification is HMAC-SHA512 with the Paystack secret (`paystack.ts:152`).

### Domain setup

Point domain to Vercel, then set `SITE_URL` (+ `APP_URL` if the app origin changes) to the custom domain. No code change needed (design intent per `.env.example:11-13`).

## Go-live checklist

- [ ] `APP_URL`/`SITE_URL` = production origin (https); no `http://` in prod.
- [ ] `DATABASE_URL` pooled Postgres; `db:migrate` applied; `db:seed:admin` done; demo seed OFF.
- [ ] `JWT_SECRET` long random, unique per env; Google redirect URI registered.
- [ ] Paystack LIVE secret set; webhook URL registered; test charge + refund + transfer verified; `db:reconcile --dry-run` clean.
- [ ] Email: one provider key + verified `EMAIL_FROM`; test verify/reset/order mails; previews at `/email-preview`.
- [ ] Uploads: Cloudinary configured (generic images break on Vercel otherwise); S3 private bucket + IAM least-privilege for vendor photos.
- [ ] Admin accounts log in; vendor approval + rider verification + withdrawal approval flows walked through.
- [ ] `npm run build` green; `/api/health` OK; sitemap/robots reachable.
- [ ] Rate limiting / abuse controls decided (currently none — see `SECURITY-AND-RISKS.md`).
- [ ] Owner inputs answered (pricing/commission/hold values, refund policy — see `docs/README.md` confidence section).
