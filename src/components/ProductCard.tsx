"use client";

import Link from "next/link";
import { addCartItem } from "@/lib/savora-api";

type ProductCardItem = {
  id?: string;
  slug?: string;
  name: string;
  vendor?: string;
  category?: string;
  price: number;
  oldPrice?: number;
  rating?: number;
  image: string;
  description?: string;
  location?: string;
};

export default function ProductCard({ item }: { item: ProductCardItem }) {
  async function addItem() {
    const token = window.localStorage.getItem("savora.accessToken");
    if (!token || !item.id) {
      window.location.href = "/auth";
      return;
    }
    try {
      await addCartItem(token, item.id);
      window.location.href = "/cart";
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not add this item to your cart");
    }
  }

  return (
    <article className="card" style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <img src={item.image} alt={item.name} />
        <button
          type="button"
          aria-label="Save item"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid #e6ddd3",
            background: "rgba(255,255,255,0.9)",
            display: "grid",
            placeItems: "center",
            fontSize: 18,
            color: "#5b544d",
            cursor: "pointer",
          }}
        >
          ♡
        </button>
      </div>
      <div className="card-body">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            {item.id ? <Link href={`/product/${item.id}`}><strong>{item.name}</strong></Link> : <strong>{item.name}</strong>}
            <p className="muted" style={{ margin: "6px 0 0" }}>{item.vendor}</p>
          </div>
          <span className="rating">★ {item.rating ?? 4.5}</span>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <div>
            <span className="price">₦{item.price.toLocaleString()}</span>
            {item.oldPrice ? <div className="muted"><del>₦{item.oldPrice.toLocaleString()}</del></div> : null}
          </div>
          <button type="button" className="btn" onClick={addItem} style={{ padding: "10px 16px", borderRadius: 12 }}>+ Add</button>
        </div>
      </div>
    </article>
  );
}
