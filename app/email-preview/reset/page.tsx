import { notFound } from "next/navigation";
import { buildResetEmail } from "@/server/email/auth-emails";
import { RESET_MINUTES } from "@/server/email";
import { EmailPreview, resolvePreviewAppUrl } from "../_preview";

export default function ResetEmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const appUrl = resolvePreviewAppUrl();
  const email = buildResetEmail(`${appUrl}/reset-password?token=preview-token`, RESET_MINUTES, appUrl);
  return (
    <EmailPreview
      title="Reset password"
      subject={email.subject}
      htmlContent={email.htmlContent}
      textContent={email.textContent}
    />
  );
}
