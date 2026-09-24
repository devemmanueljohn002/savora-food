"use client";

import Link from "next/link";
import PageShell from "@/components/PageShell";
import { useCart, useRemoveCartItem, useUpdateCartItem } from "@/lib/api/hooks";

export default function Page() {
  const { data: cart, isLoading, error } = useCart();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();

  const unauthorized = typeof error === "object" && error !== null && (error as { status?: number }).status === 401;

  if (unauthorized) {
    return (
      <PageShell>
        <section className="section container">
          <h1>Your cart</h1>
          <p>Please sign in to view your saved cart.</p>
          <Link className="btn" href="/login">Sign in</Link>
        </section>
      </PageShell>
    );
  }

  const items = cart?.items ?? [];

  return (
    <PageShell>
      <section className="section container">
        <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.1 }}>Your cart</h1>
        {error ? <p className="muted" role="alert">{error.message}</p> : null}

        {isLoading ? (
          <p className="muted">Loading your cart…</p>
        ) : (
          <div className="cart-grid" style={{ marginTop: 24 }}>
            <div>
              {items.length === 0 ? (
                <div className="card card-body">
                  <h2>Your cart is empty</h2>
                  <p className="muted">Hungry? Your next favourite meal is a few clicks away.</p>
                  <div className="row" style={{ gap: 10, marginTop: 12 }}>
                    <Link className="btn" href="/food">Browse food</Link>
                    <Link className="btn secondary" href="/cakes">Cakes</Link>
                  </div>
                </div>
              ) : (
                items.map((item) => (
                  <div className="card cart-item" key={item.id}>
                    <img
                      src={item.product.image ?? "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80"}
                      alt={item.product.name}
                    />
                    <div>
                      <h3>{item.product.name}</h3>
                      <p className="muted">{item.vendor.businessName}</p>
                      <p className="muted">₦{item.unitPrice.toLocaleString()} each</p>
                      <div className="quantity">
                        <button
                          type="button"
                          onClick={() => item.quantity > 1 && update.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                          disabled={item.quantity <= 1 || update.isPending}
                        >
                          −
                        </button>
                        <strong>{item.quantity}</strong>
                        <button type="button" onClick={() => update.mutate({ itemId: item.id, quantity: item.quantity + 1 })} disabled={update.isPending}>
                          +
                        </button>
                      </div>
                      <button type="button" className="muted" onClick={() => remove.mutate(item.id)} disabled={remove.isPending}>
                        Remove
                      </button>
                    </div>
                    <span className="price" style={{ marginLeft: "auto" }}>₦{item.lineTotal.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>

            <aside className="form-card summary">
              <h2>Order summary</h2>
              <p className="row"><span>Items</span><span>{cart?.itemCount ?? 0}</span></p>
              <p className="row"><span>Vendors</span><span>{cart?.vendorCount ?? 0}</span></p>
              <p className="row"><span>Subtotal</span><span>₦{(cart?.subtotal ?? 0).toLocaleString()}</span></p>
              <p className="muted" style={{ fontSize: 13 }}>Delivery fee is added at checkout based on your location.</p>
              <hr />
              {cart?.vendorCount && cart.vendorCount > 1 ? (
                <p className="muted" style={{ fontSize: 13 }}>
                  You’ll pay each vendor separately — one secure checkout per kitchen.
                </p>
              ) : null}
              <Link
                className="btn"
                href={items.length ? "/checkout" : "/food"}
                style={{ width: "100%", marginTop: 18, textAlign: "center", display: "block" }}
              >
                {items.length ? "Proceed to checkout" : "Browse food"}
              </Link>
            </aside>
          </div>
        )}
      </section>
    </PageShell>
  );
}