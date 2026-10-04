import { getEnv } from "../env";
import { buildResetEmail } from "./templates.js";
import { buildOrderDeliveredEmail, type OrderDeliveredInput } from "./order-delivered";
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
  const { subject, htmlContent, textContent } = buildResetEmail(resetUrl, RESET_MINUTES);
  await sendEmail({ to, subject, text: textContent, html: htmlContent });
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your Savora Food email",
    text: `Welcome to Savora Food!\n\nPlease confirm your email address to finish creating your account. This link expires in 24 hours:\n\n${verifyUrl}\n\nIf you did not create an account with Savora Food, you can safely ignore this email.`,
  });
}

export async function sendVerificationReminderEmail(to: string, verifyUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Verify your Savora Food email",
    text: `It's been a little while since you joined Savora Food — your account is still waiting on email verification before it can be fully activated.\n\nConfirm your email now (link expires in 24 hours):\n\n${verifyUrl}\n\nIf you did not create an account with Savora Food, you can safely ignore this email.`,
  });
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
 * Sends the redesigned "Order delivered" email via the configured sender
 * (Brevo when BREVO_API_KEY is set). Links are built from APP_URL and the
 * footer carries a signed one-click unsubscribe link for this customer.
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
  const { appUrl, jwtSecret } = getEnv();
  try {
    const { db } = await import("../db");
    const rows = await db()<{ email_updates_opt_out: boolean | null }[]>`
      SELECT email_updates_opt_out FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (rows[0]?.email_updates_opt_out) return false;
  } catch {
    // preference unreadable (e.g. migration not yet applied) — send anyway.
  }
  const built = buildOrderDeliveredEmail({
    ...input,
    appUrl,
    logoUrl: `${appUrl}/savora-logo-wide.png`,
    rateUrl: `${appUrl}/dashboard?tab=orders`,
    trackUrl: `${appUrl}/track`,
    supportUrl: `${appUrl}/contact`,
    termsUrl: `${appUrl}/terms`,
    privacyUrl: `${appUrl}/privacy`,
    unsubscribeUrl: `${appUrl}/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(userId, jwtSecret))}`,
  });
  await sendEmail({ to, subject: built.subject, text: built.textContent, html: built.htmlContent });
  return true;
}