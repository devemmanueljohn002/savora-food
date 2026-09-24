import { getEnv } from "../env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

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
  await sendEmail({
    to,
    subject: "Reset your Savora Food password",
    text: `We received a request to reset your Savora Food password.\n\nOpen this link to set a new password (expires in 1 hour):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
  });
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