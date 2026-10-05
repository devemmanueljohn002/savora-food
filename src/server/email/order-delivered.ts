/**
 * "Order delivered" transactional email for Savora Food, built on the
 * shared layout (./layout) so every email carries the same header, tokens,
 * buttons and footer. Tokens match app/globals.css.
 *
 * Transactional footer: NO unsubscribe link (order emails are strictly
 * transactional). The opt-out read in sendOrderDeliveredEmail is unchanged —
 * only the footer link is gone. unsubscribeUrl stays an accepted (ignored)
 * input so existing callers keep compiling.
 */
import {
  EMAIL_SANS,
  EMAIL_TOKENS,
  emailCentered,
  emailHeadline,
  emailShell,
  emailSupportLine,
  esc,
  formatAddress,
  formatNaira,
  primaryButton,
  secondaryButton,
  type BuiltEmail,
} from "./layout";

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
  unsubscribeUrl?: string;
};

export { formatNaira };
export type { BuiltEmail };

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

function totalsRow(label: string, value: string, strong = false): string {
  const t = EMAIL_TOKENS;
  return `<tr>
    <td style="padding:5px 0;font-family:${EMAIL_SANS};font-size:14px;line-height:20px;color:${strong ? t.ink : t.muted};${strong ? "font-weight:bold;" : ""}">${esc(label)}</td>
    <td align="right" style="padding:5px 0;font-family:${EMAIL_SANS};font-size:14px;line-height:20px;color:${strong ? t.money : t.ink};${strong ? "font-weight:bold;" : ""}white-space:nowrap;">${esc(value)}</td>
  </tr>`;
}

export function buildOrderDeliveredEmail(input: OrderDeliveredInput): BuiltEmail {
  const t = EMAIL_TOKENS;
  const greeting = input.customerName?.trim() ? `Hi ${input.customerName.trim().split(" ")[0]},` : "Hi there,";
  const itemRows = input.items
    .map(
      (item) => `<tr>
    <td style="padding:7px 0;font-family:${EMAIL_SANS};font-size:14px;line-height:20px;color:${t.ink};">${esc(item.name)} <span style="color:${t.muted};">× ${item.quantity}</span></td>
    <td align="right" style="padding:7px 0;font-family:${EMAIL_SANS};font-size:14px;line-height:20px;color:${t.ink};white-space:nowrap;">${esc(formatNaira(item.lineTotal))}</td>
  </tr>`,
    )
    .join("");
  const addressLine = formatAddress(input.address);

  const bodyHtml = `
<div style="text-align:center;padding:4px 0 18px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${t.successTint}" style="background:${t.successTint};width:64px;height:64px;border-radius:50%;font-family:${EMAIL_SANS};font-size:30px;font-weight:bold;color:${t.success};text-align:center;vertical-align:middle;">✓</td>
    </tr>
  </table>
</div>
${emailHeadline("Your order has been delivered")}
${emailCentered(`${greeting} Enjoy your meal!`)}
<p style="margin:0 0 22px 0;font-family:${EMAIL_SANS};font-size:14px;line-height:21px;color:${t.muted};text-align:center;">
  Order <strong style="color:${t.ink};">${esc(input.orderNumber)}</strong> from <strong style="color:${t.ink};">${esc(input.vendorName)}</strong>
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.tint}" style="background:${t.tint};border:1px solid ${t.line};border-radius:12px;margin:0 0 20px 0;">
  <tr>
    <td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${itemRows}
        <tr><td colspan="2" style="padding:6px 0 2px 0;border-bottom:1px solid ${t.line};font-size:0;line-height:0;">&nbsp;</td></tr>
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
    <td width="50%" valign="top" style="padding:0 8px 0 0;font-family:${EMAIL_SANS};">
      <p style="margin:0 0 4px 0;font-size:12px;line-height:16px;font-weight:bold;color:${t.muted};text-transform:uppercase;letter-spacing:0.04em;">Delivered at</p>
      <p style="margin:0;font-size:14px;line-height:20px;color:${t.ink};">${esc(formatDeliveredAt(input.deliveredAt))}</p>
    </td>
    <td width="50%" valign="top" style="padding:0 0 0 8px;font-family:${EMAIL_SANS};">
      <p style="margin:0 0 4px 0;font-size:12px;line-height:16px;font-weight:bold;color:${t.muted};text-transform:uppercase;letter-spacing:0.04em;">Delivered to</p>
      <p style="margin:0;font-size:14px;line-height:20px;color:${t.ink};">${esc(addressLine)}</p>
    </td>
  </tr>
</table>
${primaryButton(input.rateUrl, "Rate your experience")}
<p style="margin:0 0 14px 0;font-family:${EMAIL_SANS};font-size:15px;letter-spacing:4px;color:${t.gold};text-align:center;">★★★★★</p>
${secondaryButton(input.trackUrl, "Track / view order")}
${emailSupportLine(input.appUrl)}`;

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
  ];

  return {
    subject: `Your order ${input.orderNumber} was delivered`,
    htmlContent: emailShell({
      preheader: `Order ${input.orderNumber} from ${input.vendorName} was delivered. Rate your experience.`,
      title: "Your Savora order was delivered",
      bodyHtml,
      appUrl: input.appUrl,
    }),
    textContent: textLines.join("\n"),
  };
}
