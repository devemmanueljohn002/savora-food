import { notifyUser } from "./vendors";
import { sendEmail } from "./email";

/** Fan-out: always in-app, plus email when an address is available. Failures never throw. */
export async function notify(input: {
  userId: string;
  email?: string | null;
  type?: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}): Promise<void> {
  await notifyUser({
    userId: input.userId,
    type: input.type ?? "ORDER",
    title: input.title,
    body: input.body ?? null,
    data: input.data ?? {},
  }).catch(() => undefined);
  if (input.email) {
    await sendEmail({ to: input.email, subject: input.title, text: input.body ?? input.title }).catch(
      () => undefined,
    );
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
