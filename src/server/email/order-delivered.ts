/**
 * "Order delivered" transactional email for Savora Food.
 *
 * Design tokens are read from the site stylesheet (app/globals.css), not
 * guessed: primary orange #FF6500, accent gold #F7B733, ink #302B27, muted
 * #716B65, line #E6DDD3, paper #FAF8F4, card #FFFDF9, money #C95A12,
 * success #1E8E3E, font Arial/Helvetica, card radius ~16px, button ~8px.
 *
 * Mail-client rules followed here:
 * - table-based layout, all CSS inline, 600px max width, fluid on mobile
 *   (a small <style> block enhances clients that support it; Outlook
 *   ignores it and still gets the fixed 600px layout);
 * - `color-scheme: light` + explicit backgrounds on every cell so dark-mode
 *   inverts stay readable; the logo sits on its own white badge so it never
 *   ends up as dark-on-dark;
 * - every dynamic value is HTML-escaped;
 * - a plain-text twin is always returned alongside the HTML.
 */

export type OrderDeliveredItem = {
  name: string;
  quantity: number;
  lineTotal: number;
};

export type OrderDeliveredInput = {
  orderNumber: string;
  vendorName: string;
  customerName?: string | null;
  items: OrderDeliveredItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  /** ISO timestamp of the hand-over; rendered in Africa/Lagos time. */
  deliveredAt: string;
  address: { fullAddress: string; city?: string | null; state?: string | null } | null;
  appUrl: string;
  logoUrl: string;
  rateUrl: string;
  trackUrl: string;
  supportUrl: string;
  termsUrl: string;
  privacyUrl: string;
  unsubscribeUrl: string;
};

export type BuiltEmail = {
  subject: string;
  htmlContent: string;
  textContent: string;
};

const ORANGE = "#FF6500";
const GOLD = "#F7B733";
const INK = "#302B27";
const MUTED = "#716B65";
const PAGE = "#FAF8F4";
const CARD = "#FFFDF9";
const TINT = "#FFF3E6";
const LINE = "#E6DDD3";
const GREEN = "#1E8E3E";
const GREEN_TINT = "#E7F6E7";
const MONEY = "#C95A12";
const SANS = "Arial, Helvetica, sans-serif";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatNaira(amount: number): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return `₦${safe.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export function formatDeliveredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function primaryButton(href: string, label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;">
  <tr>
    <td align="center" bgcolor="${ORANGE}" style="background:${ORANGE};border-radius:8px;">
      <a href="${esc(href)}" target="_blank" style="display:block;padding:14px 20px;font-family:${SANS};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

function secondaryButton(href: string, label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
  <tr>
    <td align="center" bgcolor="${CARD}" style="background:${CARD};border:1px solid ${LINE};border-radius:8px;">
      <a href="${esc(href)}" target="_blank" style="display:block;padding:13px 20px;font-family:${SANS};font-size:15px;font-weight:bold;color:${INK};text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

function totalsRow(label: string, value: string, strong = false): string {
  return `<tr>
    <td style="padding:5px 0;font-family:${SANS};font-size:14px;line-height:20px;color:${strong ? INK : MUTED};${strong ? "font-weight:bold;" : ""}">${esc(label)}</td>
    <td align="right" style="padding:5px 0;font-family:${SANS};font-size:14px;line-height:20px;color:${strong ? MONEY : INK};${strong ? "font-weight:bold;" : ""}white-space:nowrap;">${esc(value)}</td>
  </tr>`;
}

export function buildOrderDeliveredEmail(input: OrderDeliveredInput): BuiltEmail {
  const greeting = input.customerName?.trim() ? `Hi ${input.customerName.trim().split(" ")[0]},` : "Hi there,";
  const itemRows = input.items
    .map(
      (item) => `<tr>
    <td style="padding:7px 0;font-family:${SANS};font-size:14px;line-height:20px;color:${INK};">${esc(item.name)} <span style="color:${MUTED};">× ${item.quantity}</span></td>
    <td align="right" style="padding:7px 0;font-family:${SANS};font-size:14px;line-height:20px;color:${INK};white-space:nowrap;">${esc(formatNaira(item.lineTotal))}</td>
  </tr>`,
    )
    .join("");
  const addressLine = input.address
    ? [input.address.fullAddress, [input.address.city, input.address.state].filter(Boolean).join(", ")]
        .filter((part) => part && part.trim().length > 0)
        .join(" · ")
    : "No delivery address on file.";

  const bodyHtml = `
<div style="text-align:center;padding:4px 0 18px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${GREEN_TINT}" style="background:${GREEN_TINT};width:64px;height:64px;border-radius:50%;font-family:${SANS};font-size:30px;font-weight:bold;color:${GREEN};text-align:center;vertical-align:middle;">✓</td>
    </tr>
  </table>
</div>
<h1 style="margin:0 0 10px 0;font-family:${SANS};font-size:24px;line-height:30px;font-weight:bold;color:${INK};text-align:center;">Your order has been delivered</h1>
<p style="margin:0 0 6px 0;font-family:${SANS};font-size:15px;line-height:23px;color:${INK};text-align:center;">${esc(greeting)} Enjoy your meal!</p>
<p style="margin:0 0 22px 0;font-family:${SANS};font-size:14px;line-height:21px;color:${MUTED};text-align:center;">
  Order <strong style="color:${INK};">${esc(input.orderNumber)}</strong> from <strong style="color:${INK};">${esc(input.vendorName)}</strong>
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${TINT}" style="background:${TINT};border:1px solid ${LINE};border-radius:12px;margin:0 0 20px 0;">
  <tr>
    <td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${itemRows}
        <tr><td colspan="2" style="padding:6px 0 2px 0;border-bottom:1px solid ${LINE};font-size:0;line-height:0;">&nbsp;</td></tr>
        ${totalsRow("Subtotal", formatNaira(input.subtotal))}
        ${totalsRow("Delivery fee", formatNaira(input.deliveryFee))}
        ${input.serviceFee > 0 ? totalsRow("Service fee", formatNaira(input.serviceFee)) : ""}
        ${input.tax > 0 ? totalsRow("Tax", formatNaira(input.tax)) : ""}
        ${input.discount > 0 ? totalsRow("Discount", `−${formatNaira(input.discount)}`) : ""}
        ${totalsRow("Total paid", formatNaira(input.total), true)}
      </table>
    </td>
  </tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
  <tr>
    <td width="50%" valign="top" style="padding:0 8px 0 0;font-family:${SANS};">
      <p style="margin:0 0 4px 0;font-size:12px;line-height:16px;font-weight:bold;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;">Delivered at</p>
      <p style="margin:0;font-size:14px;line-height:20px;color:${INK};">${esc(formatDeliveredAt(input.deliveredAt))}</p>
    </td>
    <td width="50%" valign="top" style="padding:0 0 0 8px;font-family:${SANS};">
      <p style="margin:0 0 4px 0;font-size:12px;line-height:16px;font-weight:bold;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;">Delivered to</p>
      <p style="margin:0;font-size:14px;line-height:20px;color:${INK};">${esc(addressLine)}</p>
    </td>
  </tr>
</table>
${primaryButton(input.rateUrl, "Rate your experience")}
<p style="margin:0 0 14px 0;font-family:${SANS};font-size:15px;letter-spacing:4px;color:${GOLD};text-align:center;">★★★★★</p>
${secondaryButton(input.trackUrl, "Track / view order")}
<p style="margin:18px 0 0 0;padding-top:16px;border-top:1px solid ${LINE};font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};text-align:center;">
  Something wrong with your order? <a href="${esc(input.supportUrl)}" style="color:${ORANGE};font-weight:bold;text-decoration:none;">Contact support</a>.
</p>`;

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your Savora order was delivered</title>
<style>
@media only screen and (max-width: 620px) {
  .email-container { width: 100% !important; }
  .email-card { padding-left: 20px !important; padding-right: 20px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};">Order ${esc(input.orderNumber)} from ${esc(input.vendorName)} was delivered. Rate your experience.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-container" style="max-width:600px;">
        <tr>
          <td align="center" style="padding:0 0 18px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:12px;padding:10px 18px;">
                  <img src="${esc(input.logoUrl)}" alt="Savora Food" width="168" style="display:block;margin:0 auto;border:0;outline:none;height:auto;max-width:168px;">
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="${CARD}" class="email-card" style="background:${CARD};padding:32px 30px;border:1px solid ${LINE};border-radius:16px;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 20px 0 20px;font-family:${SANS};font-size:12px;line-height:19px;color:${MUTED};">
            Your Food. Your Choice. Delivered.<br>
            <a href="${esc(input.supportUrl)}" style="color:${MUTED};text-decoration:underline;">Support</a>
            &nbsp;·&nbsp;<a href="${esc(input.termsUrl)}" style="color:${MUTED};text-decoration:underline;">Terms</a>
            &nbsp;·&nbsp;<a href="${esc(input.privacyUrl)}" style="color:${MUTED};text-decoration:underline;">Privacy</a><br>
            <a href="${esc(input.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe from order update emails</a><br>
            You received this email because you ordered on Savora Food.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textLines = [
    `Your order has been delivered — enjoy your meal!`,
    ``,
    `Order: ${input.orderNumber}`,
    `Vendor: ${input.vendorName}`,
    `Delivered at: ${formatDeliveredAt(input.deliveredAt)}`,
    `Delivered to: ${addressLine}`,
    ``,
    `Items:`,
    ...input.items.map((item) => `  - ${item.name} × ${item.quantity} — ${formatNaira(item.lineTotal)}`),
    `Subtotal: ${formatNaira(input.subtotal)}`,
    `Delivery fee: ${formatNaira(input.deliveryFee)}`,
    ...(input.serviceFee > 0 ? [`Service fee: ${formatNaira(input.serviceFee)}`] : []),
    ...(input.tax > 0 ? [`Tax: ${formatNaira(input.tax)}`] : []),
    ...(input.discount > 0 ? [`Discount: −${formatNaira(input.discount)}`] : []),
    `Total paid: ${formatNaira(input.total)}`,
    ``,
    `Rate your experience: ${input.rateUrl}`,
    `Track / view your order: ${input.trackUrl}`,
    ``,
    `Something wrong? Contact support: ${input.supportUrl}`,
    `Terms: ${input.termsUrl} | Privacy: ${input.privacyUrl}`,
    `Unsubscribe from order update emails: ${input.unsubscribeUrl}`,
  ];

  return {
    subject: `Your order ${input.orderNumber} was delivered`,
    htmlContent,
    textContent: textLines.join("\n"),
  };
}
