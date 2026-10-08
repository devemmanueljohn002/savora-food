/**
 * Rider/delivery status emails on the shared Savora layout. These are the
 * HTML twins for the `notifyWithEmail` live path (going / arrived / pickup /
 * in_transit / delivered-notice / assign / release / delivery-code). All
 * user-supplied text is escaped; links are absolute and land on dashboards
 * that require login — never one-click actions.
 */
import {
  EMAIL_TOKENS,
  emailCentered,
  emailHeadline,
  emailShell,
  emailSupportLine,
  esc,
  type BuiltEmail,
} from "./layout";

export type RiderStatusEmailInput = {
  orderNumber: string;
  headline: string;
  body: string;
  appUrl: string;
  ctaUrl?: string;
  ctaLabel?: string;
};

export function buildRiderStatusEmail(input: RiderStatusEmailInput): BuiltEmail {
  const base = input.appUrl.replace(/\/+$/, "");
  const ctaUrl = input.ctaUrl ?? `${base}/track`;
  const ctaLabel = input.ctaLabel ?? "Track my order";
  const bodyHtml = `
${emailHeadline(input.headline)}
${emailCentered(input.body)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px 0;">
  <tr>
    <td align="center" bgcolor="${EMAIL_TOKENS.orange}" style="background:${EMAIL_TOKENS.orange};border-radius:8px;">
      <a href="${esc(ctaUrl)}" target="_blank" style="display:block;padding:14px 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(ctaLabel)}</a>
    </td>
  </tr>
</table>
${emailSupportLine(base)}`;

  return {
    subject: `${input.orderNumber}: ${input.headline}`,
    htmlContent: emailShell({
      preheader: `${input.orderNumber} — ${input.body}`,
      title: `${input.orderNumber}: ${input.headline}`,
      bodyHtml,
      appUrl: base,
    }),
    textContent: [`${input.orderNumber}: ${input.headline}`, ``, input.body, ``, `Track: ${ctaUrl}`].join("\n"),
  };
}
