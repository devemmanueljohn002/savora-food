import { notFound } from "next/navigation";
import { buildOrderDeliveredEmail } from "@/server/email/order-delivered";
import { getEnv } from "@/server/env";

function sample() {
  // APP_URL may be unset locally; fall back to the production origin used
  // by the logo so the preview still renders links and images.
  let appUrl = "https://savora-food.vercel.app";
  try {
    appUrl = getEnv().appUrl;
  } catch {
    // preview-only fallback
  }
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

const SWATCHES: [string, string][] = [
  ["Primary / buttons", "#FF6500"],
  ["Accent gold", "#F7B733"],
  ["Ink (text)", "#302B27"],
  ["Muted", "#716B65"],
  ["Line", "#E6DDD3"],
  ["Paper (page bg)", "#FAF8F4"],
  ["Card", "#FFFDF9"],
  ["Money", "#C95A12"],
  ["Success", "#1E8E3E"],
];

export default function DeliveredEmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const email = sample();
  return (
    <main className="page-shell">
      <section className="section container">
        <h1>Preview: Order delivered email</h1>
        <p className="muted">
          Subject: <strong>{email.subject}</strong> · Table layout, inline CSS, 600px max width. Tokens
          from <code>app/globals.css</code>:
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 20px" }}>
          {SWATCHES.map(([label, hex]) => (
            <span
              key={hex + label}
              className="badge"
              style={{ background: "#fff", border: "1px solid var(--line)" }}
              title={label}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 4,
                  background: hex,
                  marginRight: 6,
                  verticalAlign: "baseline",
                  border: "1px solid #00000022",
                }}
              />
              {hex}
            </span>
          ))}
        </div>
        <h2>HTML</h2>
        <iframe
          title="Order delivered email preview"
          srcDoc={email.htmlContent}
          style={{ width: "100%", height: 900, border: "1px solid var(--line)", borderRadius: 16 }}
        />
        <h2 style={{ marginTop: 28 }}>Plain text fallback</h2>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 20,
            fontSize: 14,
          }}
        >
          {email.textContent}
        </pre>
      </section>
    </main>
  );
}
