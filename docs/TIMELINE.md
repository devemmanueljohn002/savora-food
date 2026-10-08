# Timeline — Chronological history from git

Source: `git log --format='%H %ad %s' --date=short` (45 commits, `2026-09-04` → `2026-10-05`). Commit-message based; code diffs spot-checked for the largest commits. Anything not in git is marked UNVERIFIED.

## Phase 0 — Scaffold (2026-09-04)

| Date | Commit | What |
|---|---|---|
| 2026-09-04 | `659d558` | Initial commit from Create Next App |
| 2026-09-04 | `ee2a48e` | "main production" (UNVERIFIED contents) |
| 2026-09-05 | `b5a1305` | "with backend" (UNVERIFIED contents) |

## Phase 1 — Food delivery baseline (2026-09-24/25)

| Date | Commit | What |
|---|---|---|
| 2026-09-24 | `3845f53` | "Add food delivery feature" — merged via PR #1 (`c0f86ea`) from `emma-chris-feature` |
| 2026-09-25 | `c358d17` | Unify sign-in and sign-up on `/auth` page — merged via PR #2 (`531678e`) |

## Phase 2 — Production deploy prep (2026-10-02/03)

| Date | Commit | What |
|---|---|---|
| 2026-10-02 | `4e173d7` | Prepare production deploy on Vercel (Cloudinary uploads, admin-only seed, health check) |
| 2026-10-03 | `ac96b64` … `dca3e1e` … `de0fcbe` … `bb928a4` | Mobile menu work: standardized drawer auth, Lovable-style grouped drawer + bottom tab bar, slide-bar race fix, portal drawer to body |
| 2026-10-03 | `0c3ee0f` | Favorites heart wired to real API (toggle, auth redirect) |
| 2026-10-03 | `b43e500`, `920ffde`, `5a0b1e5`, `800c99c` | Account-tab tap fix, account icon → settings, drawer dedupe/48px rows, personalised home hero when signed in, 2-col mobile categories |

## Phase 3 — Money: payouts, email hardening (2026-10-03/04)

| Date | Commit | What |
|---|---|---|
| 2026-10-03 | `a37f843` | Vendor withdrawals via Paystack Transfers: wallet ledger, recipient flow, transfer webhook |
| 2026-10-03 | `ad60942` | Forgot-password tolerates mail-provider failure instead of bare 500 |
| 2026-10-04 | `aac788c` | Rider payouts on polymorphic wallet: same-txn delivery credit, per-owner policy, cooling, shared UI |
| 2026-10-04 | `62241c7`, `9bc08bb` | Templated reset email via Brevo (APP_URL enforced, 30-min expiry); fix reset-request 500 via minute-based `make_interval` expiry |
| 2026-10-04 | `3ad0e05` | Final email templates: hardcoded logo, orange button; drop `EMAIL_LOGO_URL` |
| 2026-10-04 | `55402a7`, `fc50225` | Vendor Payouts tab mobile-first redesign; tabs overflow fix |
| 2026-10-04 | `ce506ac` | Vendor profile photos on private S3: presigned POST, validated finalize, authorized view |
| 2026-10-04 | `029d169` | Docs: session work log 2026-10-04 |
| 2026-10-04 | `bfa4435` | Fix Vercel typecheck: `db()` template-tag call, version-proof sharp typing |
| 2026-10-04 | `feab089` | Role-aware routing: single route map, role-aware nav/header, proxy + client guards |

## Phase 4 — Dispatch evolution (2026-10-04)

Single-rider targeted offers were built, then replaced by an open board:

| Date | Commit | What |
|---|---|---|
| 2026-10-04 | `4c217dd` | Single-rider dispatch: offer-gated atomic accept, max-attempt escalation, live countdown |
| 2026-10-04 | `1500a08` | Rider jobs: lazy dispatch sweep for pending orders, retry state on feed failure |
| 2026-10-04 | `6c0e92f` | Fix riders seeing no jobs: sync status ↔ `is_online` presence |
| 2026-10-04 | `087ba03`, `d90dfa1` | Build fixes: move `couponDto` out of route module; rider presence toggle 500 (untyped param in `CASE WHEN`) |
| 2026-10-04 | `0b9bbd8` | Order-delivered email redesign + pickup-issued handover codes |
| 2026-10-04 | `50d8c38` | Harden order lifecycle: guarded writes, real refunds, timeouts, stock, settlement polish |
| 2026-10-04 | `1ca6a83` | Residue: pickup race guard, prune `CONFIRMED`, vendor open toggle + customer cancel UI |
| 2026-10-04 | `b0d7747` | **Open board dispatch: first-claim jobs board replaces targeted offers** |
| 2026-10-05 | `be8db17` | Lifecycle residue: single transition gate, hashed OTPs, unclaimed refunds, offer-engine cleanup |
| 2026-10-05 | `2dd6960` | Fix OTP verify reading unfetched hash column; persisted proof on pickup; handoff regression tests |

## Phase 5 — Polish: notifications, auth, payments, SEO, email (2026-10-05)

| Date | Commit | What |
|---|---|---|
| 2026-10-05 | `cf5904f` | Unify notification UI on Savora tokens: themed toasts, confirm modal, semantic colors |
| 2026-10-05 | `94c5b26` | Continue with Google sign-in (verified-email linking, customer default) |
| 2026-10-05 | `283ab78` | Fix `PENDING_PAYMENT → PAID`: idempotent Paystack verify + webhook with amount check (+ `scripts/reconcile-payments.ts`, migration `017_paystack_reference.sql`) |
| 2026-10-05 | `4e7bc67` | SEO readiness: metadata, sitemap, robots, JSON-LD, noindex layouts, `next/image` |
| 2026-10-05 | `d55a140` | Redesign transactional emails on shared Savora layout with previews (`app/email-preview/*`) |

## Notable bug fixes (recurring themes)

- Payments: verify/webhook idempotency + amount check (`283ab78`); reconcile script added.
- Dispatch: presence sync (`6c0e92f`), presence-toggle 500 (`d90dfa1`), OTP hash-column read (`2dd6960`).
- Email: reset 500s (`9bc08bb`), mail-failure tolerance (`ad60942`), APP_URL enforcement (`62241c7`).
- Mobile UI: drawer/menu race and clipping (`de0fcbe`, `bb928a4`), swallowed taps (`b43e500`), overflow (`fc50225`).
- Build: coupon DTO route export (`087ba03`), `db()` typing (`bfa4435`).

## Cannot be dated

- Contents of `ee2a48e` ("main production") and `b5a1305` ("with backend") — commit messages only, diffs not reviewed for this doc.
- `docs/build-log-2026-09-22.md` predates the earliest commit shown (2026-09-04 scaffold) — UNVERIFIED how it relates; see `DECISIONS.md`.
- Any work on branches never merged (only `emma-chris-feature` merges observed; remote branch still exists — UNVERIFIED whether it holds extra commits).
