# Decisions

Recorded reasons only; where the reason isn't in code/history it says so.

1. **Next.js App Router + Route Handlers as the whole backend** (no separate server, no `"use server"` actions found). Reason: not recorded (UNVERIFIED — likely speed/simplicity; Vercel deploy prep `4e173d7` assumes it).
2. **Postgres + hand-written SQL migrations** (`scripts/migrate.ts`, `001–017`). No ORM. Reason: not recorded; effect is full control of constraints/indexes (e.g. guarded status writes, unique idempotency keys).
3. **Short JWT access (30 min) + rotating opaque refresh (30 days)** (`session.ts`, `session-flow.ts`, `refresh/route.ts`). Reason: not recorded; standard XSS/replay trade-off (httpOnly cookies, `/api/auth`-scoped refresh).
4. **Single enforced order state machine** (`order-transitions.ts`, `be8db17`). Reason: stated in code — every writer must pass `assertOrderTransition` (or equivalent `WHERE` predicate); races become 409s.
5. **Open board dispatch replaced targeted single-rider offers** (`b0d7747`, `be8db17`). Reason: not recorded in messages beyond the replacement itself; effect is first-claim atomicity (`claimBoardJob`) over offer/escalation complexity.
6. **Paystack for both payments and transfers; server-side re-verify + amount check on every path incl. webhooks** (`paystack.ts:132`, `283ab78`). Reason: stated — fix `PENDING_PAYMENT→PAID` races/forgery; `reconcile-payments.ts` as backstop.
7. **Polymorphic wallet `(owner_type, owner_id)` shared by vendors and riders** (`008`, `aac788c`, `a37f843`). Reason: stated — same ledger, per-owner policy (hold days, limits, cooling).
8. **Holds before availability + cooling on bank change + auto-approve threshold** (`wallet.ts:47-70`). Reason: not recorded (UNVERIFIED — presumably fraud/refund absorption); tunable via `payout_config`.
9. **Brevo preferred, Resend fallback, dev console-log; mail failures never 500 user flows** (`email/index.ts:33-104`, `ad60942`). Reason: stated — tolerate provider failure; `APP_URL` enforced after broken-link incident (`62241c7`).
10. **Private S3 for vendor profile photos; Cloudinary for generic uploads** (`ce506ac`, `cloudinary.ts`). Reason: stated — profile photos must never be public; product images accept CDN URLs (`next.config.ts`).
11. **Catering as quote flow outside the order/payment machine.** Reason: not recorded (UNVERIFIED — possibly intentional quote-only MVP; payment path missing).
12. **Service fee 5%, tax 7.5%, commission 10%, rider 100% of delivery fee** (`orders.ts:50`, `money.ts:12`). Reasons: not recorded — **owner must confirm these are the intended live economics** (see README confidence section).
13. **Proxy named `proxy.ts` (not `middleware.ts`) with role map + dev bypass without `JWT_SECRET`.** Reason: not recorded (UNVERIFIED — Next 16 convention and/or local-dev convenience).
14. **SEO via metadata + sitemap/robots + JSON-LD with noindex on private layouts** (`4e7bc67`). Reason: stated — launch readiness.
15. **Shared email layout + in-repo previews; drop `EMAIL_LOGO_URL`** (`3ad0e05`, `d55a140`). Reason: stated — hardcoded logo/orange button consistency.
