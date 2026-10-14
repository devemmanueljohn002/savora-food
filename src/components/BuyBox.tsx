"use client";

import { useState } from "react";
import AddToCart from "./AddToCart";

export default function BuyBox({ productId, disabled = false }: { productId: string; disabled?: boolean }) {
  const [quantity, setQuantity] = useState(1);

  return (
    <>
    <div className="row" style={{ gap: 12, marginTop: 20, flexWrap: "wrap" }}>
      <div className="quantity" role="group" aria-label="Quantity">
        <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={disabled || quantity <= 1} aria-label="Decrease quantity">
          −
        </button>
        <strong>{quantity}</strong>
        <button type="button" onClick={() => setQuantity((q) => Math.min(99, q + 1))} disabled={disabled} aria-label="Increase quantity">
          +
        </button>
      </div>
      <AddToCart productId={productId} quantity={quantity} label="Add to cart" className="btn" disabled={disabled} />
    </div>
    {/* Phones: sticky bottom action bar (same quantity + action). */}
    <div className="sticky-action-bar" role="region" aria-label="Add to cart">
      <AddToCart productId={productId} quantity={quantity} label={quantity > 1 ? `Add ${quantity} to cart` : "Add to cart"} className="btn" disabled={disabled} />
    </div>
    </>
  );
}