"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { CartView, getCart, removeCartItem, updateCartItem } from "@/lib/savora-api";

export default function Page() {
  const [cart, setCart] = useState<CartView | null>(null); const [error, setError] = useState("");
  const token = typeof window !== "undefined" ? localStorage.getItem("savora.accessToken") : null;
  useEffect(() => { if (!token) return; getCart(token).then(setCart).catch(reason => setError(reason instanceof Error ? reason.message : "Could not load cart")); }, [token]);
  if (!token) return <PageShell><section className="section container"><h1>Your cart</h1><p>Please sign in to view your saved cart.</p><Link className="btn" href="/auth">Sign in</Link></section></PageShell>;
  const items = cart?.items || [];
  return <PageShell><section className="container"><h1 style={{ paddingTop: 25 }}>Your cart</h1>{error && <p role="alert">{error}</p>}<div className="cart-grid"><div>{items.length === 0 ? <div className="card card-body"><h2>Your cart is empty</h2><Link className="btn" href="/food">Browse food</Link></div> : items.map(item => <div className="card cart-item" key={item.id}><img src={item.product.image || "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80"} alt={item.product.name} /><div><h3>{item.product.name}</h3><p className="muted">{item.vendor.businessName || item.vendor.name}</p><div className="quantity"><button type="button" onClick={() => item.quantity > 1 && updateCartItem(token, item.id, item.quantity - 1).then(setCart)}>−</button> {item.quantity} <button type="button" onClick={() => updateCartItem(token, item.id, item.quantity + 1).then(setCart)}>+</button></div><button type="button" className="muted" onClick={() => removeCartItem(token, item.id).then(setCart)}>Remove</button></div><span className="price" style={{ marginLeft: "auto" }}>₦{Number(item.lineTotal).toLocaleString()}</span></div>)}</div><aside className="form-card summary"><h2>Order summary</h2><p className="row"><span>Subtotal</span><span>₦{Number(cart?.subtotal || 0).toLocaleString()}</span></p><hr /><h2 className="row"><span>Total</span><span className="price">₦{Number(cart?.subtotal || 0).toLocaleString()}</span></h2><Link className="btn" href={items.length ? "/checkout" : "/food"} style={{ width: "100%", marginTop: 24, textAlign: "center" }}>{items.length ? "Proceed to checkout" : "Browse food"}</Link></aside></div></section></PageShell>;
}
