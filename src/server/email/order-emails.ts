/**
 * Order-lifecycle emails on the shared Savora layout: vendor NEW ORDER
 * (items table, subtotal, deduped address, Accept/Reject buttons into the
 * vendor dashboard order page — login required, never one-click) and the
 * customer payment confirmation. All user-supplied text is escaped; money
 * renders as ₦15,000; every link is absolute from appUrl.
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
  type BuiltEmail,
} from "./layout";

export type VendorOrderItem = {
  name: string;
  quantity: number;
  lineTotal: number;
};

export type VendorNewOrderInput = {
  orderNumber: string;
  orderId: string;
  customerName: string;
  items: VendorOrderItem[];
  foodSubtotal: number;
  address: { fullAddress: string | null; city?: string | null; state?: string | null } | null;
  appUrl: string;
};

function itemsTable(items: VendorOrderItem[]): string {
  const t = EMAIL_TOKENS;
  const rows = items
    .map(
      (item) => `<tr>
    <td style="padding:7px 0;font-family:${EMAIL_SANS};font-size:14px;line-height:20px;color:${t.ink};">${esc(item.name)} <span style="color:${t.muted};">× ${item.quantity}</span></td>
    <td align="right" style="padding:7px 0;font-family:${EMAIL_SANS};font-size:14px;line-height:20px;color:${t.ink};white-space:nowrap;">${esc(formatNaira(item.lineTotal))}</td>
  </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.tint}" style="background:${t.tint};border:1px solid ${t.line};border-radius:12px;margin:0 0 20px 0;">
  <tr>
    <td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows}
      </table>
    </td>
  </tr>
</table>`;
}

export function buildVendorNewOrderEmail(input: VendorNewOrderInput): BuiltEmail {
  const t = EMAIL_TOKENS;
  const base = input.appUrl.replace(/\/+$/, "");
  const orderUrl = `${base}/vendor/orders/${input.orderId}`;
  const firstName = input.customerName.trim().split(" ")[0] || "Customer";
  const itemsText =
    input.items.map((item) => `${item.name} × ${item.quantity} — ${formatNaira(item.lineTotal)}`).join("\n") || "—";

  const bodyHtml = `
${emailHeadline(`New order ${input.orderNumber}`)}
${emailCentered(`${firstName} just paid and is waiting on your confirmation. Accept to start preparing, or reject if you cannot fulfil it.`)}
${itemsTable(input.items)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
  <tr>
    <td style="padding:0 0 6px 0;font-family:${EMAIL_SANS};font-size:12px;line-height:16px;font-weight:bold;color:${t.muted};text-transform:uppercase;letter-spacing:0.04em;">Food subtotal</td>
    <td align="right" style="padding:0 0 6px 0;font-family:${EMAIL_SANS};font-size:16px;line-height:22px;font-weight:bold;color:${t.money};white-space:nowrap;">${esc(formatNaira(input.foodSubtotal))}</td>
  </tr>
  <tr>
    <td valign="top" style="font-family:${EMAIL_SANS};font-size:12px;line-height:16px;font-weight:bold;color:${t.muted};text-transform:uppercase;letter-spacing:0.04em;">Deliver to</td>
    <td align="right" valign="top" style="font-family:${EMAIL_SANS};font-size:14px;line-height:20px;color:${t.ink};">${esc(formatAddress(input.address))}</td>
  </tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;">
  <tr>
    <td align="center" bgcolor="${t.orange}" style="background:${t.orange};border-radius:8px;">
      <a href="${esc(orderUrl)}" target="_blank" style="display:block;padding:14px 20px;font-family:${EMAIL_SANS};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">Accept order</a>
    </td>
  </tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
  <tr>
    <td align="center" bgcolor="${t.card}" style="background:${t.card};border:1px solid ${t.line};border-radius:8px;">
      <a href="${esc(orderUrl)}" target="_blank" style="display:block;padding:13px 20px;font-family:${EMAIL_SANS};font-size:15px;font-weight:bold;color:${t.ink};text-decoration:none;border-radius:8px;">Reject order</a>
    </td>
  </tr>
</table>
<p style="margin:12px 0 0 0;font-family:${EMAIL_SANS};font-size:12px;line-height:18px;color:${t.muted};text-align:center;">You'll sign in to your vendor dashboard to confirm — links never accept an order by themselves.</p>
${emailSupportLine(base)}`;

  return {
    subject: `New order ${input.orderNumber} from ${firstName}`,
    htmlContent: emailShell({
      preheader: `New paid order ${input.orderNumber} from ${input.customerName.trim() || "a customer"} — accept or reject it.`,
      title: `New order ${input.orderNumber}`,
      bodyHtml,
      appUrl: base,
    }),
    textContent: [
      `NEW ORDER ${input.orderNumber}`,
      ``,
      `Customer: ${input.customerName.trim() || "Customer"}`,
      `Items:`,
      itemsText,
      `Food subtotal: ${formatNaira(input.foodSubtotal)}`,
      `Delivery address: ${formatAddress(input.address)}`,
      ``,
      `Accept the order to confirm, or reject it if you cannot fulfil it:`,
      orderUrl,
    ].join("\n"),
  };
}

export type PaymentConfirmedInput = {
  orderNumber: string;
  orderId: string;
  total: number;
  appUrl: string;
};

export function buildPaymentConfirmedEmail(input: PaymentConfirmedInput): BuiltEmail {
  const base = input.appUrl.replace(/\/+$/, "");
  const ordersUrl = `${base}/account/orders`;
  const bodyHtml = `
${emailHeadline(`Payment confirmed for ${input.orderNumber}`)}
${emailCentered(`Your payment of ${formatNaira(input.total)} was verified. The vendor has been notified and will start preparing your order.`)}
${emailCentered("You will receive a 4-digit delivery code once your rider picks it up — share it with the rider on arrival.", true)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px 0;">
  <tr>
    <td align="center" bgcolor="${EMAIL_TOKENS.orange}" style="background:${EMAIL_TOKENS.orange};border-radius:8px;">
      <a href="${esc(ordersUrl)}" target="_blank" style="display:block;padding:14px 20px;font-family:${EMAIL_SANS};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">View my order</a>
    </td>
  </tr>
</table>
${emailSupportLine(base)}`;

  return {
    subject: `Payment confirmed for ${input.orderNumber}`,
    htmlContent: emailShell({
      preheader: `Your payment of ${formatNaira(input.total)} was verified — the vendor is preparing your order.`,
      title: `Payment confirmed for ${input.orderNumber}`,
      bodyHtml,
      appUrl: base,
    }),
    textContent: [
      `Payment confirmed for ${input.orderNumber}`,
      ``,
      `Your payment of ${formatNaira(input.total)} was verified. The vendor has been notified and will start preparing your order. You will receive a 4-digit delivery code once your rider picks it up — share it with the rider on arrival.`,
      ``,
      `View your order: ${ordersUrl}`,
    ].join("\n"),
  };
}
