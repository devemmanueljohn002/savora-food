"use client";

import Link from "next/link";
import { useCart } from "@/lib/api/hooks";

/**
 * Sticky cart summary for vendor menu pages (right column on desktop,
 * stacked card on tablet/phone; phones also get the global bottom nav).
 */
export default function VendorCartSummary({ vendorName }: { vendorName: string }) {
  const { data: cart } = useCart();
  const count = cart?.itemCount ?? 0;
  const subtotal = cart?.subtotal ?? 0;

  return (
    <aside className="vendor-cart-summary" aria-label={`Your order from ${vendorName}`}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Your order</h2>
      <p className="muted" style={{ margin: "0 0 16px" }}>{vendorName}</p>
      <p className="row"><span>Items</span><strong>{count}</strong></p>
      <p className="row"><span>Subtotal</span><strong className="price">₦{subtotal.toLocaleString()}</strong></p>
      <p className="muted" style={{ fontSize: 13 }}>Delivery fee is added at checkout based on your location.</p>
      <Link
        className="btn"
        href={count > 0 ? "/checkout" : "/cart"}
        style={{ width: "100%", marginTop: 12, textAlign: "center", display: "block" }}
      >
        {count > 0 ? "Review & checkout" : "View cart"}
      </Link>
      <Link
        className="btn secondary"
        href="/food"
        style={{ width: "100%", marginTop: 8, textAlign: "center", display: "block" }}
      >
        Keep browsing
      </Link>
    </aside>
  );
}
