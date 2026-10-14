"use client";

import { use, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import VendorNav from "@/components/VendorNav";
import { VendorSignIn, naira, orderBadge } from "@/components/VendorShell";
import { useAdvanceVendorOrder, useAcceptVendorOrder, useCancelVendorOrder, useRejectVendorOrder, useVendorOrder, useVendorProfile } from "@/lib/api/hooks";

export default function VendorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <Detail params={params} />;
}

function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const profile = useVendorProfile();
  const order = useVendorOrder(id);
  const advance = useAdvanceVendorOrder(id);
  const accept = useAcceptVendorOrder(id);
  const reject = useRejectVendorOrder(id);
  const cancel = useCancelVendorOrder(id);
  const [note, setNote] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [error, setError] = useState("");

  if (profile.isLoading || order.isLoading) {
    return (
      <PageShell>
        <section className="section container">
          <p className="muted">Loading order…</p>
        </section>
      </PageShell>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;
  if (order.isError || !order.data) {
    return (
      <PageShell>
        <section className="section container">
          <h1>Order not found</h1>
          <p className="muted">This order does not belong to your kitchen.</p>
          <Link className="btn secondary" href="/vendor/orders">Back to orders</Link>
        </section>
      </PageShell>
    );
  }

  const detail = order.data;

  async function onAdvance() {
    setError("");
    try {
      await advance.mutateAsync(note.trim() || null);
      setNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the order.");
    }
  }

  async function onAccept() {
    setError("");
    try {
      await accept.mutateAsync(note.trim() || null);
      setNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not accept the order.");
    }
  }

  async function onReject() {
    setError("");
    try {
      await reject.mutateAsync(note.trim() || null);
      setConfirmingReject(false);
      setNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reject the order.");
    }
  }

  async function onCancel() {
    setError("");
    try {
      await cancel.mutateAsync(note.trim() || null);
      setConfirmingCancel(false);
      setNote("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel the order.");
    }
  }

  return (
    <PageShell>
      <section className="section container">
        <p>
          <Link href="/vendor/orders">← All orders</Link>
        </p>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0 }}>{detail.orderNumber}</h1>
            <p className="section-sub" style={{ marginTop: 8, marginBottom: 0 }}>
              {new Date(detail.createdAt).toLocaleString("en-NG")} · {detail.customer.name ?? "Customer"} ·{" "}
              {detail.customer.phone}
            </p>
          </div>
          <span className={`badge ${orderBadge(detail.status)}`}>{detail.status.replaceAll("_", " ")}</span>
        </div>
        <VendorNav />

        <div className="two-col">
          <div>
            <div className="card card-body">
              <h3 style={{ marginTop: 0 }}>Items ({detail.items.reduce((sum, item) => sum + item.quantity, 0)})</h3>
              {detail.items.map((item) => (
                <div className="row" key={item.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted" style={{ margin: "2px 0 0" }}>
                      {item.quantity} × {naira(item.unitPrice)}
                      {item.customInstructions ? ` · ${item.customInstructions}` : ""}
                    </p>
                  </div>
                  <strong>{naira(item.lineTotal)}</strong>
                </div>
              ))}
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">Subtotal</span>
                <span>{naira(detail.subtotal)}</span>
              </div>
              <div className="row">
                <span className="muted">Delivery fee</span>
                <span>{naira(detail.deliveryFee)}</span>
              </div>
              <div className="row">
                <span className="muted">Service fee</span>
                <span>{naira(detail.serviceFee ?? 0)}</span>
              </div>
              <div className="row">
                <span className="muted">Tax</span>
                <span>{naira(detail.tax ?? 0)}</span>
              </div>
              {detail.discount > 0 ? (
                <div className="row">
                  <span className="muted">Discount</span>
                  <span>−{naira(detail.discount)}</span>
                </div>
              ) : null}
              <div className="row">
                <strong>Total</strong>
                <strong className="price">{naira(detail.total)}</strong>
              </div>
            </div>

            <div className="card card-body" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Delivery</h3>
              <p style={{ margin: "4px 0" }}>
                {detail.address
                  ? `${detail.address.fullAddress}, ${detail.address.city ?? ""}, ${detail.address.state ?? ""}`
                  : "No address on file"}
              </p>
              {detail.deliveryInstructions && <p className="muted">Note: {detail.deliveryInstructions}</p>}
              {detail.preferredDeliveryTime && (
                <p className="muted">Requested for {new Date(detail.preferredDeliveryTime).toLocaleString("en-NG")}</p>
              )}
              <p className="muted">Payment: {detail.paymentStatus}</p>
            </div>
          </div>

          <div>
            <div className="form-card">
              <h3 style={{ marginTop: 0 }}>Update status</h3>
              {detail.status === "PAID" ? (
                <>
                  <p className="muted">
                    New paid order — <strong>accept</strong> to confirm it, or <strong>reject</strong> if you
                    cannot fulfil it. The customer is notified either way.
                  </p>
                  <label>
                    Note <span className="field-optional">(optional)</span>
                    <input
                      value={note}
                      placeholder="e.g. ready in 10 minutes"
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" disabled={accept.isPending} onClick={onAccept}>
                      {accept.isPending ? "Updating…" : "Accept order"}
                    </button>
                    <button className="btn danger" disabled={reject.isPending} onClick={() => setConfirmingReject(true)}>
                      Reject order
                    </button>
                  </span>
                </>
              ) : detail.status === "VENDOR_ACCEPTED" ? (
                <>
                  <p className="muted">
                    You accepted this order — <strong>move it to preparing</strong> when cooking starts, or{" "}
                    <strong>reject</strong> to cancel with a refund.
                  </p>
                  <label>
                    Note <span className="field-optional">(optional)</span>
                    <input
                      value={note}
                      placeholder="e.g. ready in 10 minutes"
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" disabled={advance.isPending} onClick={onAdvance}>
                      {advance.isPending ? "Updating…" : "Move to preparing"}
                    </button>
                    <button className="btn danger" disabled={reject.isPending} onClick={() => setConfirmingReject(true)}>
                      Reject order
                    </button>
                  </span>
                </>
              ) : detail.nextStatus ? (
                <>
                  <p className="muted">
                    Next step: <strong>{detail.nextStatus.replaceAll("_", " ")}</strong>
                  </p>
                  <label>
                    Note <span className="field-optional">(optional)</span>
                    <input
                      value={note}
                      placeholder="e.g. ready in 10 minutes"
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  <button className="btn" disabled={advance.isPending} onClick={onAdvance}>
                    {advance.isPending ? "Updating…" : `Move to ${detail.nextStatus.replaceAll("_", " ").toLowerCase()}`}
                  </button>
                </>
              ) : (
                <p className="muted">No further vendor actions available for this order.</p>
              )}
              {confirmingReject && (detail.status === "PAID" || detail.status === "VENDOR_ACCEPTED") && (
                <div style={{ marginTop: 12 }}>
                  <p className="muted">
                    Reject this order? It will be cancelled, the payment flagged for refund, and the customer
                    notified.
                  </p>
                  <span style={{ display: "flex", gap: 8 }}>
                    <button className="btn danger btn-sm" disabled={reject.isPending} onClick={onReject}>
                      {reject.isPending ? "Rejecting…" : "Confirm reject"}
                    </button>
                    <button className="btn secondary btn-sm" onClick={() => setConfirmingReject(false)}>
                      Keep order
                    </button>
                  </span>
                </div>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              {!["DELIVERED", "CANCELLED", "REFUNDED", "PAID", "VENDOR_ACCEPTED"].includes(detail.status) &&
                (confirmingCancel ? (
                  <div style={{ marginTop: 12 }}>
                    <p className="muted">Cancel this order? The customer will be notified.</p>
                    <span style={{ display: "flex", gap: 8 }}>
                      <button className="btn danger btn-sm" disabled={cancel.isPending} onClick={onCancel}>
                        {cancel.isPending ? "Cancelling…" : "Confirm cancel"}
                      </button>
                      <button className="btn secondary btn-sm" onClick={() => setConfirmingCancel(false)}>
                        Keep order
                      </button>
                    </span>
                  </div>
                ) : (
                  <p style={{ marginTop: 12 }}>
                    <button className="btn danger btn-sm" onClick={() => setConfirmingCancel(true)}>
                      Cancel order
                    </button>
                  </p>
                ))}
            </div>

            <div className="card card-body" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>History</h3>
              {detail.history.map((entry, index) => (
                <p key={index} className="muted" style={{ margin: "6px 0" }}>
                  <strong>{entry.status.replaceAll("_", " ")}</strong> ·{" "}
                  {new Date(entry.createdAt).toLocaleString("en-NG")}
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
