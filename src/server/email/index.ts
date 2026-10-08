import { getEnv } from "../env";
import { buildResetEmail, buildVerificationReminderEmail, buildVerifyEmail } from "./auth-emails";
import { buildOrderDeliveredEmail, type OrderDeliveredInput } from "./order-delivered";
import {
  buildPaymentConfirmedEmail,
  buildVendorNewOrderEmail,
  type PaymentConfirmedInput,
  type VendorNewOrderInput,
} from "./order-emails";
import { signUnsubscribeToken } from "./unsubscribe";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Token/code lifetimes in minutes. The SAME constants drive both the email
 * wording (via the template builders) and the real DB expiry, so the email
 * can never promise a different window than the backend enforces.
 */
export const RESET_MINUTES = 30;
export const OTP_MINUTES = 10;

export { buildResetEmail, buildVerificationReminderEmail, buildVerifyEmail };
export { buildOrderDeliveredEmail };
export { buildPaymentConfirmedEmail, buildVendorNewOrderEmail };
export type { PaymentConfirmedInput, VendorNewOrderInput };
export { OTP_MINUTES as OTP_MINUTES_ALIAS };

/**
 * Email dispatcher. Uses Brevo when BREVO_API_KEY is configured, else Resend
 * when RESEND_API_KEY is configured; otherwise logs the message to the console
 * so flows can be developed without SMTP.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const { brevoApiKey, resendApiKey, emailFrom } = getEnv();

  if (brevoApiKey) {
    await sendViaBrevo(message, brevoApiKey, emailFrom);
    return;
  }

  if (!resendApiKey) {
    console.log(`[email:dev] To: ${message.to} | Subject: ${message.subject}`);
    console.log(`[email:dev] ${message.text}`);
    return;
  }

  const from = emailFrom || "Savora Food <no-reply@savora.example>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend request failed (${res.status}): ${body}`);
  }
}

function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.*)<([^<>]+)>$/);
  if (match) {
    return { name: match[1].trim() || "Savora Food", email: match[2].trim() };
  }
  return { name: "Savora Food", email: from.trim() };
}

async function sendViaBrevo(message: EmailMessage, apiKey: string, emailFrom?: string): Promise<void> {
  const sender = parseSender(emailFrom || "Savora Food <no-reply@savora.example>");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      ...(message.html ? { htmlContent: message.html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo request failed (${res.status}): ${body}`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const { appUrl } = getEnv();
  try {
    const { subject, htmlContent, textContent } = buildResetEmail(resetUrl, RESET_MINUTES, appUrl);
    await sendEmail({ to, subject, text: textContent, html: htmlContent });
  } catch (error) {
    // Rendering must never skip the email: fall back to plain text.
    console.error("[email] reset render failed, sending text fallback:", error);
    await sendEmail({ to, subject: "Reset your Savora Food password", text: `Reset your password: ${resetUrl}` });
  }
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const { appUrl } = getEnv();
  try {
    const built = buildVerifyEmail(verifyUrl, appUrl);
    await sendEmail({ to, subject: built.subject, text: built.textContent, html: built.htmlContent });
  } catch (error) {
    console.error("[email] verify render failed, sending text fallback:", error);
    await sendEmail({ to, subject: "Verify your Savora Food email", text: `Verify your email: ${verifyUrl}` });
  }
}

export async function sendVerificationReminderEmail(to: string, verifyUrl: string): Promise<void> {
  const { appUrl } = getEnv();
  try {
    const built = buildVerificationReminderEmail(verifyUrl, appUrl);
    await sendEmail({ to, subject: built.subject, text: built.textContent, html: built.htmlContent });
  } catch (error) {
    console.error("[email] verify-reminder render failed, sending text fallback:", error);
    await sendEmail({ to, subject: "Verify your Savora Food email", text: `Verify your email: ${verifyUrl}` });
  }
}

export async function sendPaymentConfirmedEmail(to: string, orderNumber: string, orderId: string, total: number): Promise<void> {
  const { appUrl } = getEnv();
  try {
    const built = buildPaymentConfirmedEmail({ orderNumber, orderId, total, appUrl });
    await sendEmail({ to, subject: built.subject, text: built.textContent, html: built.htmlContent });
  } catch (error) {
    console.error("[email] payment-confirmed render failed, sending text fallback:", error);
    await sendEmail({ to, subject: `Payment confirmed for ${orderNumber}`, text: `Payment confirmed for ${orderNumber}.` });
  }
}

export async function sendVendorNewOrderEmail(
  to: string,
  input: Omit<VendorNewOrderInput, "appUrl">,
): Promise<void> {
  const { appUrl } = getEnv();
  try {
    const built = buildVendorNewOrderEmail({ ...input, appUrl });
    await sendEmail({ to, subject: built.subject, text: built.textContent, html: built.htmlContent });
  } catch (error) {
    console.error("[email] vendor-new-order render failed, sending text fallback:", error);
    await sendEmail({ to, subject: `New order ${input.orderNumber}`, text: `New paid order ${input.orderNumber}. Open ${appUrl}/vendor/orders/${input.orderId} to confirm.` });
  }
}

export type OrderDeliveredEmailInput = Omit<
  OrderDeliveredInput,
  | "appUrl"
  | "logoUrl"
  | "rateUrl"
  | "trackUrl"
  | "supportUrl"
  | "termsUrl"
  | "privacyUrl"
  | "unsubscribeUrl"
>;

/**
 * Sends the "Order delivered" email via the configured sender
 * (Brevo when BREVO_API_KEY is set). Links are built from APP_URL.
 * Transactional footer carries no unsubscribe link; the customer's
 * email-updates preference is still honored below.
 *
 * Call ONLY after the rider's delivery-confirmation transaction commits —
 * never on a status change alone. Returns false when the customer opted out
 * of order update emails (in-app notification still fires from the caller).
 * Fail-open on the preference read: a missing column/row must never swallow
 * a delivery receipt.
 */
export async function sendOrderDeliveredEmail(
  to: string,
  userId: string,
  input: OrderDeliveredEmailInput,
): Promise<boolean> {
  const { appUrl } = getEnv();
  try {
    const { db } = await import("../db");
    const rows = await db()<{ email_updates_opt_out: boolean | null }[]>`
      SELECT email_updates_opt_out FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (rows[0]?.email_updates_opt_out) return false;
  } catch {
    // preference unreadable (e.g. migration not yet applied) — send anyway.
  }
  try {
    const built = buildOrderDeliveredEmail({
      ...input,
      appUrl,
      logoUrl: `${appUrl}/savora-logo-wide.png`,
      rateUrl: `${appUrl}/dashboard?tab=orders`,
      trackUrl: `${appUrl}/track`,
      supportUrl: `${appUrl}/contact`,
      termsUrl: `${appUrl}/terms`,
      privacyUrl: `${appUrl}/privacy`,
    });
    await sendEmail({ to, subject: built.subject, text: built.textContent, html: built.htmlContent });
  } catch (error) {
    console.error("[email] delivered render failed, sending text fallback:", error);
    await sendEmail({ to, subject: "Your order was delivered", text: "Your Savora Food order was delivered. Enjoy!" });
  }
  return true;
}
