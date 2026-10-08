# Design System

Source of truth: `app/globals.css:1-75` (site) mirrored in `src/server/email/layout.ts:26-40` (email). No `tailwind.config.*` (Tailwind v4 CSS-first). Commit `cf5904f` unified toasts/confirms on these tokens.

## Theme tokens

| Token | Value | Used for |
|---|---|---|
| `--orange` | `#ff6500` | primary brand, buttons, focus rings, theme-color meta |
| `--gold` | `#f7b733` | secondary accent |
| `--ink` | `#302b27` | text |
| `--muted` | `#716b65` | secondary text |
| `--line` | `#e6ddd3` | borders |
| `--paper` | `#faf8f4` | page bg |
| `--card` | `#fffdf9` | card bg |
| `--success / bg / line` | `#1e8e3e` / `#e7f6e7` / `#bfe3bf` | success toasts/badges |
| `--danger (+bg)` | `#c0392b` / `#fdeaea` | errors, `btn.danger`, confirm danger |
| `--warning (+bg)` | `#b26a00` / `#fff3d6` | warnings, PENDING_PAYMENT badges |
| `--info (+bg)` | `#2364b7` / `#e7f0fb` | info toasts |
| Email extras | tint `#FFF3E6`, money `#C95A12` | order-mail highlights |

Fonts: site `Arial, Helvetica, sans-serif` (`globals.css:2`); email `EMAIL_SANS` same stack + `Courier New` for OTP codes. Radius: buttons 12 (sm 10), inputs 12, cards 22/16, modal 22, toast 14, badge/pill 999; email card 16 / button 8. Shadows: btn `0 3px 10px #ff650033`, card `0 6px 20px #6b4b2b0c`, modal `0 20px 60px #2d170955`, toast `0 10px 30px #2d170944`; focus `0 0 0 3px/2px #ff65001a`.

## Logo usage

`public/savora-logo-wide.png` (1200×630 OG image, `app/layout.tsx`), `/favicon.png` (icons). Email header uses a hardcoded logo + orange button (`3ad0e05`; `EMAIL_LOGO_URL` dropped). UNVERIFIED: full logo usage rules (clear space, min sizes) — none found in code.

## Component inventory (observed, not exhaustive)

- Shell: `Header.tsx`, `HeaderSearch.tsx`, `Footer.tsx`, `PageShell.tsx` (UNVERIFIED props).
- Commerce: `BuyBox.tsx` (qty 1–99), `AddToCart.tsx` (401→`/auth`), `FavoriteButton.tsx`, `ProductCard`/`VendorCard` (UNVERIFIED files), `CatalogFilters.tsx`, `CatalogSidebar.tsx`, `Marketplace*.tsx`, `CateringMarketplace.tsx`.
- Reviews: `ReviewForm.tsx`, `ReviewsList.tsx`.
- Feedback: `ui/toast.tsx` (`ToastProvider/useToast/useNotify`), `ui/confirm.tsx` (`ConfirmProvider/useConfirm()->Promise<boolean>`), mounted via `Providers.tsx` (`QueryClientProvider` stale 30s + Toast + Confirm).
- Badges (observed classes): `.badge-*`, `.btn.danger`, `.modal*`, `.toast-success/error/warning/info` mapping to the semantic tokens above.

## Notification design system

Two layers: persistent in-app `notifications` rows (`notifyUser`, `GET/PATCH /api/notifications`) + ephemeral themed toasts/confirms (5s auto-dismiss, `aria-live=polite`, `role=alert` on error, Esc-cancel confirm). Status→color: DELIVERED success, CANCELLED/REFUNDED danger, PENDING_PAYMENT warning (`dashboard/page.tsx`).

## Email layout system

Shared `emailShell` (`layout.ts:26-216`): 600px table, inline CSS, Savora header, orange CTA, footer without unsubscribe on transactional mail. Previews: `app/email-preview/*` (`_preview.tsx` + per-mail pages). Templates export `{subject, htmlContent, textContent}`.

## Mobile-first rules

Evidence from commits: 2-col categories on mobile, grouped drawer + bottom tab bar, 48px touch rows, portalled drawer (backdrop-filter fix), iOS zoom/overflow/small-type polish, mobile-first vendor Payouts tab, no-overflow containers (`dca3e1e`, `bb928a4`, `920ffde`, `5a0b1e5`, `800c99c`, `55402a7`, `fc50225`). UNVERIFIED: a written breakpoint/type-scale spec — none found.

## Accessibility notes

Good: `aria-live=polite` toast region, `role=alert` errors, `alertdialog` confirms, Esc handling, 48px targets, httpOnly session cookies (XSS-safe). UNVERIFIED/gaps: no focus-trap observed in confirm modal; color-contrast ratios not audited; keyboard/focus order across checkout UNVERIFIED; `alt` text coverage UNVERIFIED. See `SECURITY-AND-RISKS.md` and `KNOWN-ISSUES-AND-ROADMAP.md`.
