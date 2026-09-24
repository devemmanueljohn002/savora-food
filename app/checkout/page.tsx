"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageShell from "@/components/PageShell";
import {
  useAddresses,
  useCart,
  useCheckout,
  useCheckoutQuote,
  useCreateAddress,
  useInitializePayment,
  useVerifyPayment,
} from "@/lib/api/hooks";
import type { CheckoutOrderSummary, PaymentVerifyResult } from "@/lib/order-types";

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference");

  const verify = useVerifyPayment();
  const { data: cart, isLoading: cartLoading } = useCart();
  const { data: addresses } = useAddresses();
  const createAddress = useCreateAddress();
  const checkout = useCheckout();
  const initPay = useInitializePayment();

  const [verified, setVerified] = useState<PaymentVerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const [chosenAddressId, setChosenAddressId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ label: "Home", fullAddress: "", city: "Lagos", state: "Lagos", phone: "" });
  const [instructions, setInstructions] = useState("");
  const [orders, setOrders] = useState<CheckoutOrderSummary[] | null>(null);
  const [notice, setNotice] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");

  const items = cart?.items ?? [];
  const defaultAddressId = addresses?.find((address) => address.isDefault)?.id ?? addresses?.[0]?.id ?? "";
  const addressId = chosenAddressId ?? defaultAddressId;
  const quote = useCheckoutQuote(addressId || undefined, appliedCoupon || undefined);

  useEffect(() => {
    if (!reference || verified || verify.isPending) return;
    verify.mutate(reference, {
      onSuccess: setVerified,
      onError: (reason) => setVerifyError(reason instanceof Error ? reason.message : "Could not verify payment."),
    });
  }, [reference, verified, verify]);

  if (reference) {
    return (
      <div style={{ maxWidth: 640 }}>
        {!verified && !verifyError ? (
          <div className="card card-body">
            <h2>Confirming your payment…</h2>
            <p className="muted">Verifying your Paystack transaction with the server.</p>
          </div>
        ) : verifyError ? (
          <div className="card card-body">
            <h2>Payment verification failed</h2>
            <p className="muted" role="alert">{verifyError}</p>
            <p className="muted">If you were charged, the payment may still be processing. Contact support with your reference.</p>
            <Link className="btn" href="/checkout" style={{ marginTop: 12 }}>Back to checkout</Link>
          </div>
        ) : (
          <div className="card card-body">
            <h2>Payment confirmed</h2>
            <p>Order <strong>{verified!.orderNumber}</strong> has been paid and confirmed.</p>
            <p className="muted">The vendor has been notified and will start preparing your order.</p>
            <div className="row" style={{ gap: 10, marginTop: 16 }}>
              <Link className="btn" href="/checkout">Continue checkout</Link>
              <Link className="btn secondary" href="/food">Keep browsing</Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (cartLoading) {
    return <p className="muted">Loading checkout…</p>;
  }

  if (orders === null && items.length === 0) {
    return (
      <div className="card card-body">
        <h2>Your cart is empty</h2>
        <p className="muted">Add some items before checking out.</p>
        <Link className="btn" href="/food" style={{ marginTop: 12 }}>Browse food</Link>
      </div>
    );
  }

  async function placeOrders() {
    setNotice("");
    try {
      let selected = addressId;
      if (!selected || showNew) {
        const created = await createAddress.mutateAsync({
          label: form.label || "Home",
          fullAddress: form.fullAddress,
          city: form.city,
          state: form.state,
          phone: form.phone || undefined,
        });
        selected = created.id;
        setChosenAddressId(selected);
        setShowNew(false);
      }
      const result = await checkout.mutateAsync({
        addressId: selected,
        deliveryInstructions: instructions || undefined,
        ...(appliedCoupon ? { couponCode: appliedCoupon } : {}),
      });
      setOrders(result.orders);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not place your order.");
    }
  }

  async function pay(order: CheckoutOrderSummary) {
    setNotice("");
    try {
      const payment = await initPay.mutateAsync(order.id);
      router.push(payment.authorizationUrl);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not start payment.");
    }
  }

  if (orders !== null) {
    return (
      <div style={{ maxWidth: 680 }}>
        <h2>Pay for your orders</h2>
        <p className="muted">Each vendor is paid separately via secure Paystack checkout.</p>
        {orders.length === 0 ? (
          <p className="muted">No orders were created.</p>
        ) : (
          orders.map((order) => (
            <div className="form-card" key={order.id}>
              <p className="row">
                <strong>{order.vendorName}</strong>
                <span className="muted">{order.orderNumber}</span>
              </p>
              <p className="row"><span>Subtotal</span><span>₦{order.subtotal.toLocaleString()}</span></p>
              <p className="row"><span>Delivery</span><span>₦{order.deliveryFee.toLocaleString()}</span></p>
              <p className="row"><span>Service fee</span><span>₦{(order.serviceFee ?? 0).toLocaleString()}</span></p>
              <p className="row"><span>Tax</span><span>₦{(order.tax ?? 0).toLocaleString()}</span></p>
              {order.discount > 0 ? (
                <p className="row"><span>Discount{appliedCoupon ? ` (${appliedCoupon})` : ""}</span><span>−₦{order.discount.toLocaleString()}</span></p>
              ) : null}
              <p className="row"><span>Total</span><span className="price">₦{order.total.toLocaleString()}</span></p>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", textAlign: "center", marginTop: 14 }}
                onClick={() => pay(order)}
                disabled={initPay.isPending}
              >
                {initPay.isPending ? "Opening Paystack…" : `Pay ₦${order.total.toLocaleString()}`}
              </button>
            </div>
          ))
        )}
        {notice ? <p className="muted" role="alert" style={{ marginTop: 12 }}>{notice}</p> : null}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h2>Delivery details</h2>
      <div className="form-card" style={{ marginTop: 16 }}>
        {addresses && addresses.length > 0 && !showNew ? (
          <>
            <label htmlFor="address">Saved address</label>
            <select
              id="address"
              value={addressId}
              onChange={(event) => setChosenAddressId(event.target.value)}
            >
              {addresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label ?? "Address"}: {address.fullAddress}, {address.city}
                </option>
              ))}
            </select>
            <button type="button" className="btn secondary" style={{ marginTop: 10 }} onClick={() => setShowNew(true)}>
              Add a new address
            </button>
          </>
        ) : (
          <>
            {showNew && addresses && addresses.length > 0 ? (
              <button type="button" className="muted" style={{ marginBottom: 10 }} onClick={() => setShowNew(false)}>
                ← Use a saved address
              </button>
            ) : null}
            <label htmlFor="label">Label</label>
            <input id="label" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="e.g. Home, Office" />
            <label htmlFor="fullAddress">Delivery address</label>
            <textarea
              id="fullAddress"
              required
              value={form.fullAddress}
              onChange={(event) => setForm({ ...form, fullAddress: event.target.value })}
              placeholder="House number, street, area"
            />
            <label htmlFor="city">City</label>
            <input id="city" required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            <label htmlFor="state">State</label>
            <input id="state" required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
            <label htmlFor="phone">Phone</label>
            <input id="phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="0800 000 0000" />
          </>
        )}

        <label htmlFor="instructions" style={{ marginTop: 14 }}>Delivery instructions (optional)</label>
        <textarea
          id="instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Gate code, landmark, preferred time…"
        />
      </div>

      <div className="form-card summary" style={{ marginTop: 16 }}>
        <h2>Order summary</h2>
        <p className="row"><span>Items</span><span>{cart?.itemCount ?? 0}</span></p>
        <p className="row"><span>Vendors</span><span>{cart?.vendorCount ?? 0}</span></p>
        <p className="row"><span>Subtotal</span><span>₦{(cart?.subtotal ?? 0).toLocaleString()}</span></p>
        {quote.data ? (
          <>
            <p className="row"><span>Delivery fee</span><span>₦{quote.data.deliveryFee.toLocaleString()}</span></p>
            <p className="row"><span>Service fee</span><span>₦{quote.data.serviceFee.toLocaleString()}</span></p>
            <p className="row"><span>Tax</span><span>₦{quote.data.tax.toLocaleString()}</span></p>
            {quote.data.discount > 0 ? (
              <p className="row"><span>Discount</span><span>−₦{quote.data.discount.toLocaleString()}</span></p>
            ) : null}
            <p className="row"><span>Estimated total</span><span className="price">₦{quote.data.total.toLocaleString()}</span></p>
          </>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <label htmlFor="coupon">Discount code</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              id="coupon"
              value={couponInput}
              placeholder="e.g. WELCOME10"
              style={{ textTransform: "uppercase" }}
              onChange={(event) => setCouponInput(event.target.value)}
            />
            <button
              type="button"
              className="btn secondary btn-sm"
              disabled={!couponInput.trim() || quote.isFetching}
              onClick={() => setAppliedCoupon(couponInput.trim().toUpperCase())}
            >
              Apply
            </button>
            {appliedCoupon ? (
              <button
                type="button"
                className="btn ghost btn-sm"
                onClick={() => {
                  setAppliedCoupon("");
                  setCouponInput("");
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
          {appliedCoupon && quote.isError ? (
            <p className="auth-error" role="alert" style={{ marginTop: 8 }}>
              {quote.error instanceof Error ? quote.error.message : "Coupon could not be applied."}{" "}
              <button
                type="button"
                className="btn ghost btn-sm"
                onClick={() => {
                  setAppliedCoupon("");
                  setCouponInput("");
                }}
              >
                Clear
              </button>
            </p>
          ) : null}
          {appliedCoupon && quote.data && quote.data.discount > 0 ? (
            <div style={{ marginTop: 8 }}>
              <p className="auth-success" role="status">
                {quote.data.coupon?.code} saves you ₦{quote.data.discount.toLocaleString()} (
                {quote.data.coupon?.type === "PERCENT"
                  ? `${quote.data.coupon.value}% off`
                  : `₦${quote.data.coupon?.value.toLocaleString()} off`}
                {quote.data.coupon?.vendorName ? ` · ${quote.data.coupon.vendorName} only` : ""}).
              </p>
              {quote.data.lines
                .filter((line) => line.couponApplied)
                .map((line) => (
                  <p className="row" key={line.vendorId}>
                    <span>{line.vendorName} discount</span>
                    <span>−₦{line.discount.toLocaleString()}</span>
                  </p>
                ))}
            </div>
          ) : null}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Delivery fee is added per order based on your delivery city.
        </p>
        <button
          type="button"
          className="btn"
          style={{ width: "100%", marginTop: 18 }}
          onClick={placeOrders}
          disabled={checkout.isPending || items.length === 0}
        >
          {checkout.isPending ? "Creating orders…" : "Place order & continue to payment"}
        </button>
      </div>

      {notice ? <p className="muted" role="alert" style={{ marginTop: 12 }}>{notice}</p> : null}
    </div>
  );
}

export default function Page() {
  return (
    <PageShell>
      <section className="section container">
        <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.1 }}>Checkout</h1>
        <Suspense fallback={<p className="muted">Loading checkout…</p>}>
          <CheckoutInner />
        </Suspense>
      </section>
    </PageShell>
  );
}