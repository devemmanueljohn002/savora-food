import { notFound } from "next/navigation";
import { buildVerifyEmail } from "@/server/email/auth-emails";
import { EmailPreview, resolvePreviewAppUrl } from "../_preview";

export default function VerifyEmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const appUrl = resolvePreviewAppUrl();
  const email = buildVerifyEmail(`${appUrl}/verify-email?token=preview-token`, appUrl);
  return (
    <EmailPreview
      title="Verify email"
      subject={email.subject}
      htmlContent={email.htmlContent}
      textContent={email.textContent}
    />
  );
}
