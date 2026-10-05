/**
 * Shared Savora Food transactional-email layout.
 *
 * Design tokens are read from the site stylesheet (app/globals.css), not
 * guessed: primary orange #FF6500, accent gold #F7B733, ink #302B27, muted
 * #716B65, line #E6DDD3, paper #FAF8F4, card #FFFDF9, money #C95A12,
 * success #1E8E3E, font Arial/Helvetica, card radius 16px, button radius 8px.
 *
 * Mail-client rules followed here:
 * - table-based layout, all CSS inline, 600px max width, fluid on mobile
 *   (a small <style> block enhances clients that support it; Outlook
 *   ignores it and still gets the fixed 600px layout);
 * - `color-scheme: light` + explicit backgrounds on every cell so dark-mode
 *   inverts stay readable; the logo sits on its own white badge on a light
 *   brand-cream strip so it never ends up as dark-on-dark;
 * - every dynamic value is HTML-escaped via esc();
 * - every builder returns { subject, htmlContent, textContent } — a
 *   plain-text twin always ships alongside the HTML;
 * - every link is absolute, built from the caller's appUrl (SITE_URL/APP_URL).
 *
 * Transactional footers carry NO unsubscribe link (order, security,
 * payments). The one-click unsubscribe route/token infra stays for
 * marketing/newsletter use only.
 */

export const EMAIL_TOKENS = {
  orange: "#FF6500",
  gold: "#F7B733",
  ink: "#302B27",
  muted: "#716B65",
  page: "#FAF8F4",
  card: "#FFFDF9",
  tint: "#FFF3E6",
  line: "#E6DDD3",
  money: "#C95A12",
  success: "#1E8E3E",
  successTint: "#E7F6E7",
} as const;

export const EMAIL_SANS = "Arial, Helvetica, sans-serif";

/** Logo served from the app itself so it always matches the live brand. */
export function logoUrlFor(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/savora-logo-wide.png`;
}

/** Escape every user-supplied value before it touches HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Whole naira render without decimals (₦15,000); kobo only when needed. */
export function formatNaira(amount: number): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return `₦${safe.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export type AddressInput = {
  fullAddress?: string | null;
  city?: string | null;
  state?: string | null;
};

/**
 * Build one address line from street/city/state without repeating parts.
 * Splits the street on commas, drops any part that case-insensitively equals
 * the city or state (a street is never exactly "Lagos"), then appends
 * city/state unless already present. Empty parts are skipped.
 */
export function formatAddress(input: AddressInput | null): string {
  if (!input) return "No delivery address on file.";
  const city = input.city?.trim() || "";
  const state = input.state?.trim() || "";
  const lower = (s: string) => s.toLowerCase();
  const streetParts = (input.fullAddress ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => lower(part) !== lower(city) && (state ? lower(part) !== lower(state) : true));
  const tail: string[] = [];
  if (city && !streetParts.some((part) => lower(part) === lower(city))) tail.push(city);
  if (state && lower(state) !== lower(city) && ![...streetParts, ...tail].some((part) => lower(part) === lower(state))) {
    tail.push(state);
  }
  const line = [...streetParts, ...tail].join(", ");
  return line || "No delivery address on file.";
}

/** Bulletproof primary CTA: table-based, inline styles, ~48px tall. */
export function primaryButton(href: string, label: string): string {
  const t = EMAIL_TOKENS;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;">
  <tr>
    <td align="center" bgcolor="${t.orange}" style="background:${t.orange};border-radius:8px;">
      <a href="${esc(href)}" target="_blank" style="display:block;padding:14px 20px;font-family:${EMAIL_SANS};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Outlined secondary CTA, same footprint as the primary. */
export function secondaryButton(href: string, label: string): string {
  const t = EMAIL_TOKENS;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
  <tr>
    <td align="center" bgcolor="${t.card}" style="background:${t.card};border:1px solid ${t.line};border-radius:8px;">
      <a href="${esc(href)}" target="_blank" style="display:block;padding:13px 20px;font-family:${EMAIL_SANS};font-size:15px;font-weight:bold;color:${t.ink};text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

export type EmailShellInput = {
  preheader: string;
  title: string;
  bodyHtml: string;
  appUrl: string;
};

/**
 * Full 600px-max transactional document: cream page, centered logo badge,
 * white content card, brand footer (tagline + Support/Terms/Privacy +
 * company name, no unsubscribe).
 */
export function emailShell(input: EmailShellInput): string {
  const t = EMAIL_TOKENS;
  const base = input.appUrl.replace(/\/+$/, "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(input.title)}</title>
<style>
@media only screen and (max-width: 620px) {
  .email-container { width: 100% !important; }
  .email-card { padding-left: 20px !important; padding-right: 20px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${t.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${t.page};">${esc(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.page}" style="background:${t.page};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-container" style="max-width:600px;">
        <tr>
          <td align="center" style="padding:0 0 18px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:12px;padding:10px 18px;">
                  <img src="${esc(logoUrlFor(base))}" alt="Savora Food" width="160" style="display:block;margin:0 auto;border:0;outline:none;height:auto;max-width:160px;">
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="${t.card}" class="email-card" style="background:${t.card};padding:32px 30px;border:1px solid ${t.line};border-radius:16px;">
            ${input.bodyHtml}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 20px 0 20px;font-family:${EMAIL_SANS};font-size:12px;line-height:19px;color:${t.muted};">
            Your Food. Your Choice. Delivered.<br>
            <a href="${esc(base)}/contact" style="color:${t.muted};text-decoration:underline;">Support</a>
            &nbsp;·&nbsp;<a href="${esc(base)}/terms" style="color:${t.muted};text-decoration:underline;">Terms</a>
            &nbsp;·&nbsp;<a href="${esc(base)}/privacy" style="color:${t.muted};text-decoration:underline;">Privacy</a><br>
            Savora Food<br>
            You received this email about activity on your Savora Food account.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function emailHeadline(text: string): string {
  const t = EMAIL_TOKENS;
  return `<h1 style="margin:0 0 10px 0;font-family:${EMAIL_SANS};font-size:24px;line-height:30px;font-weight:bold;color:${t.ink};text-align:center;">${esc(text)}</h1>`;
}

export function emailCentered(text: string, muted = false): string {
  const t = EMAIL_TOKENS;
  return `<p style="margin:0 0 10px 0;font-family:${EMAIL_SANS};font-size:15px;line-height:23px;color:${muted ? t.muted : t.ink};text-align:center;">${esc(text)}</p>`;
}

export function emailSupportLine(appUrl: string): string {
  const t = EMAIL_TOKENS;
  const base = appUrl.replace(/\/+$/, "");
  return `<p style="margin:18px 0 0 0;padding-top:16px;border-top:1px solid ${t.line};font-family:${EMAIL_SANS};font-size:13px;line-height:20px;color:${t.muted};text-align:center;">
  Something not right? <a href="${esc(base)}/contact" style="color:${t.orange};font-weight:bold;text-decoration:none;">Contact support</a>.
</p>`;
}

export function emailTextLink(href: string, label = href): string {
  const t = EMAIL_TOKENS;
  return `<p style="margin:0 0 6px 0;font-family:${EMAIL_SANS};font-size:12px;line-height:18px;color:${t.muted};word-break:break-all;">${esc(label)}: <a href="${esc(href)}" style="color:${t.orange};">${esc(href)}</a></p>`;
}

export type BuiltEmail = {
  subject: string;
  htmlContent: string;
  textContent: string;
};
