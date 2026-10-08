import { notifyUser } from "./vendors";
import { sendEmail } from "./email";

/**
 * Fan-out: always in-app, plus email when an address is available. Failures
 * never throw. The email twin is HTML + plain text rendered on the shared
 * Savora layout; if rendering throws, we fall back to plain text so the
 * notification still goes out.
 */
export async function notify(input: {
  userId: string;
  email?: string | null;
  type?: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
}): Promise<void> {
  await notifyUser({
    userId: input.userId,
    type: input.type ?? "ORDER",
    title: input.title,
    body: input.body ?? null,
    data: input.data ?? {},
  }).catch(() => undefined);
  if (!input.email) return;
  const text = input.body ?? input.title;
  try {
    const { getEnv } = await import("./env");
    const appUrl = getEnv().appUrl;
    const { buildRiderStatusEmail } = await import("./email/rider-emails");
    const orderNumber =
      typeof input.data?.orderNumber === "string"
        ? (input.data.orderNumber as string)
        : typeof input.data?.orderId === "string"
          ? "Order update"
          : "Order update";
    const built = buildRiderStatusEmail({
      orderNumber,
      headline: input.title,
      body: text,
      appUrl,
      ...(input.ctaUrl ? { ctaUrl: input.ctaUrl } : {}),
      ...(input.ctaLabel ? { ctaLabel: input.ctaLabel } : {}),
    });
    await sendEmail({ to: input.email, subject: built.subject, text: built.textContent, html: built.htmlContent }).catch(
      () => undefined,
    );
  } catch {
    // Rendering failed (or env unreadable in an edge context): plain-text fallback.
    await sendEmail({ to: input.email, subject: input.title, text }).catch(() => undefined);
  }
}

export async function lookupContact(userId: string): Promise<{ email: string | null }> {
  try {
    const { db } = await import("./db");
    const rows = await db()<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId} LIMIT 1`;
    return { email: rows[0]?.email ?? null };
  } catch {
    return { email: null };
  }
}

export async function notifyWithEmail(
  userId: string,
  message: { title: string; body?: string | null; data?: Record<string, unknown> | null; type?: string },
): Promise<void> {
  const contact = await lookupContact(userId);
  await notify({ userId, email: contact.email, ...message });
}
