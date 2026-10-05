import { notFound } from "next/navigation";
import { buildOtpEmail } from "@/server/email/auth-emails";
import { OTP_MINUTES } from "@/server/email";
import { EmailPreview, resolvePreviewAppUrl } from "../_preview";

export default function OtpEmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const appUrl = resolvePreviewAppUrl();
  const email = buildOtpEmail("482913", OTP_MINUTES, appUrl);
  return (
    <EmailPreview
      title="Verification code (preview-only, no live trigger)"
      subject={email.subject}
      htmlContent={email.htmlContent}
      textContent={email.textContent}
    />
  );
}
