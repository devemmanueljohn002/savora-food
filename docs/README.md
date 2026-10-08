# Savora Food — Documentation Index

Two readers: **developers** (maintain it) and the **owner** (plain-English product view). All claims are code-evidence based with file citations; unverifiable points say `UNVERIFIED`. No secret values appear — env var NAMES only.

| Doc | For | Contents |
|---|---|---|
| [PROJECT-OVERVIEW.md](PROJECT-OVERVIEW.md) | everyone | what it is, users + journeys, stack, services, architecture diagram, folders |
| [TIMELINE.md](TIMELINE.md) | everyone | git-history chronology (45 commits, 2026-09-04 → 2026-10-05), phases, notable fixes |
| [FEATURES.md](FEATURES.md) | everyone | every feature: purpose, flow, files, rules, edge cases, LIVE/PARTIAL/PLANNED status |
| [BUSINESS-LOGIC.md](BUSINESS-LOGIC.md) | dev + owner (money) | order lifecycle + transition map, Paystack sequence, payouts, verification, pricing formulas, permissions matrix |
| [DATA-MODEL.md](DATA-MODEL.md) | dev | every table, ER diagram, sensitive-data handling |
| [API.md](API.md) | dev | every route: method, path, auth/role, inputs/outputs/errors |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | dev + design | tokens, logo, components, notifications, email layout, mobile, a11y |
| [SETUP-AND-DEPLOYMENT.md](SETUP-AND-DEPLOYMENT.md) | dev + ops | local run (incl. Termux notes), env names, migrate/seed, Vercel, Paystack/OAuth/webhooks, go-live checklist |
| [SECURITY-AND-RISKS.md](SECURITY-AND-RISKS.md) | dev + owner | real findings with severity + files; what's done right; NIN/BVN note |
| [KNOWN-ISSUES-AND-ROADMAP.md](KNOWN-ISSUES-AND-ROADMAP.md) | everyone | blunt bugs, fake/half-built list, next steps |
| [DECISIONS.md](DECISIONS.md) | everyone | key technical/product decisions + stated vs unrecorded reasons |
| [GLOSSARY.md](GLOSSARY.md) | everyone | domain + Nigerian terms (NIN, BVN, kobo, ₦…) |

Prior docs kept as-is: `build-log-2026-09-22.md`, `session-work-2026-10-04.md`.

## Documentation confidence

**Verified (read directly):** `package.json`, `.env.example`, `proxy.ts`, `src/server/env.ts`, `order-transitions.ts`, `orders.ts` (head), `db.ts` shape, `auth/*` + `auth` routes, `payments/*`, `email/*` names, `migrations/` file list + `001` table shapes, `sitemap.ts`/`robots.ts`/`layout` metadata, `role-routes.ts`, `catalog` query filters, cart/checkout/rider/vendor route inventory (via listing + targeted reads), full `git log` (45 commits), `wallet.ts`/`payouts.ts`/`transfers.ts` (via detailed subagent reads), test file list.

**Could not fully verify (spot-check or grep only):** exact bodies of some route handlers (cancel/track/detail, addresses, notifications, admin CRUD per-resource, super-admin analytics), full 352-line checkout page math, `drinks|snacks|cakes` diffs vs `food`, `app/savora-backend/*` purpose, `promotions`/`vendor_staff` usage, live DB values (`pricing_config`, `payout_config`, `order_config`), document-URL serving model, `sharp` install state, `tailwind` preflight activity, Terms/Privacy/Contact/About page specifics.

**Needs the owner's input (not in code):**
1. Are the money defaults intended live economics — 5% service fee, 7.5% tax, 10% commission, rider 100% of delivery fee, holds (vendor 2d / rider 1d), limits (₦1k–₦500k, auto-approve <₦50k), 24h bank-change cooling?
2. Catering: quote-only or must it take payment? What are the timeout/refund rules?
3. Vendor/rider approval SLA + required documents (esp. any real NIN/BVN expectation the business has)?
4. Refund policy wording for the 30m/6h/24h auto-timers — are these customer-facing promises?
5. Which admin UI (legacy `vendor_payouts` vs wallet ledger) is canonical?
6. Custom domain + sender domain (for `SITE_URL`/`EMAIL_FROM`) and Paystack live timelines.
