import { notFound } from "next/navigation";
import { buildVendorNewOrderEmail } from "@/server/email/order-emails";
import { EmailPreview, resolvePreviewAppUrl } from "../_preview";

export default function VendorNewOrderPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const appUrl = resolvePreviewAppUrl();
  const email = buildVendorNewOrderEmail({
    orderNumber: "SV-20261005-E03F66",
    orderId: "preview-order-id",
    customerName: "Emma Adeyemi",
    items: [
      { name: "Smoky Party Jollof Rice", quantity: 2, lineTotal: 5000 },
      { name: "Grilled Turkey", quantity: 1, lineTotal: 3500 },
      { name: "<b>Chapman</b> & chilled", quantity: 2, lineTotal: 3000 },
    ],
    foodSubtotal: 11500,
    address: {
      fullAddress: "14 Admiralty Way, Lekki Phase 1, Lagos",
      city: "Lagos",
      state: "Lagos State",
    },
    appUrl,
  });
  return (
    <EmailPreview
      title="Vendor NEW ORDER"
      subject={email.subject}
      htmlContent={email.htmlContent}
      textContent={email.textContent}
    />
  );
}
