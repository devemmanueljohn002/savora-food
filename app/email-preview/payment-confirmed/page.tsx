import { notFound } from "next/navigation";
import { buildPaymentConfirmedEmail } from "@/server/email/order-emails";
import { EmailPreview, resolvePreviewAppUrl } from "../_preview";

export default function PaymentConfirmedPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const appUrl = resolvePreviewAppUrl();
  const email = buildPaymentConfirmedEmail({
    orderNumber: "SV-20261005-E03F66",
    orderId: "preview-order-id",
    total: 13880.63,
    appUrl,
  });
  return (
    <EmailPreview
      title="Payment confirmed"
      subject={email.subject}
      htmlContent={email.htmlContent}
      textContent={email.textContent}
    />
  );
}
