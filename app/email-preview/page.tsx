import { notFound } from "next/navigation";
import Link from "next/link";

const PREVIEWS = [
  ["/email-preview/verify", "Verify email"],
  ["/email-preview/reset", "Reset password"],
  ["/email-preview/otp", "Verification code (preview-only)"],
  ["/email-preview/vendor-new-order", "Vendor NEW ORDER"],
  ["/email-preview/payment-confirmed", "Payment confirmed"],
  ["/email-preview/delivered", "Order delivered"],
] as const;

export default function EmailPreviewIndexPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="page-shell">
      <section className="section container">
        <h1>Email previews (dev only)</h1>
        <p className="muted">Every transactional email on the shared Savora layout, with HTML + plain-text twins.</p>
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, padding: 0, listStyle: "none" }}>
          {PREVIEWS.map(([href, label]) => (
            <li key={href}>
              <Link className="order-row" href={href}>
                <span className="order-row-title">{label}</span>
                <span className="muted">{href}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
