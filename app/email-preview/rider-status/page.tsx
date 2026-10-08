import { notFound } from "next/navigation";
import { buildRiderStatusEmail } from "@/server/email/rider-emails";
import { EmailPreview, resolvePreviewAppUrl } from "../_preview";

export default function RiderStatusEmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const appUrl = resolvePreviewAppUrl();
  const email = buildRiderStatusEmail({
    orderNumber: "SV-20261004-A1B2C3",
    headline: "Rider on the way to vendor",
    body: "Adaeze is going to the vendor to pick up your order.",
    appUrl,
  });
  return (
    <EmailPreview
      title="Rider status email (going / arrived / pickup / in_transit)"
      subject={email.subject}
      htmlContent={email.htmlContent}
      textContent={email.textContent}
    />
  );
}
