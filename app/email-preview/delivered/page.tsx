import { notFound } from "next/navigation";
import { buildOrderDeliveredEmail } from "@/server/email/order-delivered";
import { EmailPreview, resolvePreviewAppUrl } from "../_preview";

function sample() {
  const appUrl = resolvePreviewAppUrl();
  return buildOrderDeliveredEmail({
    orderNumber: "SV-20261004-A1B2C3",
    vendorName: "Mama Tolu's Kitchen",
    customerName: "Adaeze Okafor",
    items: [
      { name: "Smoky Party Jollof Rice", quantity: 2, lineTotal: 5000 },
      { name: "Grilled Turkey", quantity: 1, lineTotal: 3500 },
      { name: "Chapman", quantity: 2, lineTotal: 3000 },
    ],
    subtotal: 11500,
    deliveryFee: 900,
    serviceFee: 575,
    tax: 905.63,
    discount: 0,
    total: 13880.63,
    deliveredAt: new Date().toISOString(),
    address: { fullAddress: "14 Admiralty Way, Lekki Phase 1", city: "Lagos", state: "Lagos" },
    appUrl,
    logoUrl: `${appUrl}/savora-logo-wide.png`,
    rateUrl: `${appUrl}/dashboard?tab=orders`,
    trackUrl: `${appUrl}/track`,
    supportUrl: `${appUrl}/contact`,
    termsUrl: `${appUrl}/terms`,
    privacyUrl: `${appUrl}/privacy`,
    unsubscribeUrl: `${appUrl}/unsubscribe?token=preview-token`,
  });
}

export default function DeliveredEmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const email = sample();
  return (
    <EmailPreview
      title="Order delivered email"
      subject={email.subject}
      htmlContent={email.htmlContent}
      textContent={email.textContent}
    />
  );
}
