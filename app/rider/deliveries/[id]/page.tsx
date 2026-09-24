"use client";

import { use, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { RiderNav } from "@/components/RiderShell";
import { RiderSignIn, deliveryBadge, naira } from "@/components/RiderShell";
import { useRiderDelivery, useRiderDeliveryAction, useRiderProfile } from "@/lib/api/hooks";

function Detail({ id }: { id: string }) {
  const delivery = useRiderDelivery(id);
  const action = useRiderDeliveryAction(id);
  const [note, setNote] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [confirmFail, setConfirmFail] = useState(false);

  async function run(next: "going" | "arrived" | "pickup" | "in_transit" | "deliver" | "fail") {
    setError("");
    try {
      await action.mutateAsync({
        action: next,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(next === "deliver" && otp.trim() ? { otp: otp.trim() } : {}),
      });
      setNote("");
      setOtp("");
      setConfirmFail(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  if (delivery.isLoading) return <p className="muted">Loading delivery…</p>;
  if (delivery.isError || !delivery.data) {
    return (
      <>
        <p className="auth-error">Delivery not found.</p>
        <Link className="btn secondary" href="/rider/deliveries">Back to deliveries</Link>
      </>
    );
  }

  const detail = delivery.data;
  const active = ["ASSIGNED", "GOING_TO_VENDOR", "ARRIVED_AT_VENDOR", "PICKED_UP", "IN_TRANSIT"].includes(
    detail.status,
  );

  return (
    <>
      <div className="two-col">
        <div>
          <div className="card card-body">
            <div className="row">
              <h3 style={{ margin: 0 }}>Pickup</h3>
              <span className={`badge ${deliveryBadge(detail.status)}`}>{detail.status.replaceAll("_", " ")}</span>
            </div>
            <p>
              <strong>{detail.vendor.name}</strong>
              {detail.vendor.phone ? ` · ${detail.vendor.phone}` : ""}
            </p>
            <p className="muted">Order {detail.order.orderNumber} · {detail.order.total ? naira(detail.order.total) : ""} collected by customer</p>
            <h3>Dropoff</h3>
            <p>
              <strong>{detail.customer.name ?? "Customer"}</strong>
              {detail.customer.phone ? ` · ${detail.customer.phone}` : ""}
            </p>
            <p className="muted">
              {detail.address
                ? `${detail.address.fullAddress}, ${detail.address.city ?? ""}, ${detail.address.state ?? ""}`
                : "No address on file"}
            </p>
            {detail.order.deliveryInstructions && <p className="muted">Note: {detail.order.deliveryInstructions}</p>}
          </div>

          <div className="card card-body" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Items ({detail.items.reduce((sum, item) => sum + item.quantity, 0)})</h3>
            {detail.items.map((item, index) => (
              <p key={index} style={{ margin: "6px 0" }}>
                {item.quantity} × {item.name}
                {item.customInstructions ? ` (${item.customInstructions})` : ""}
              </p>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">Your fee</span>
              <strong className="price">{naira(detail.order.deliveryFee)}</strong>
            </div>
          </div>
        </div>

        <div className="form-card">
          <h3 style={{ marginTop: 0 }}>Update trip</h3>
          {!active ? (
            <p className="muted">This trip is closed ({detail.status.replaceAll("_", " ").toLowerCase()}).</p>
          ) : (
            <>
              <label>
                Note <span className="field-optional">(optional)</span>
                <input value={note} placeholder="Gate code, landmark…" onChange={(event) => setNote(event.target.value)} />
              </label>
              {detail.order.requireOtp && (detail.status === "PICKED_UP" || detail.status === "IN_TRANSIT") && (
                <label>
                  Delivery code <span className="field-required">(ask the customer)</span>
                  <input
                    value={otp}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="4-digit code"
                    onChange={(event) => setOtp(event.target.value)}
                  />
                </label>
              )}
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {detail.status === "ASSIGNED" && (
                  <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("going")}>
                    {action.isPending ? "Updating…" : "Head to vendor"}
                  </button>
                )}
                {detail.status === "GOING_TO_VENDOR" && (
                  <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("arrived")}>
                    {action.isPending ? "Updating…" : "Arrived at vendor"}
                  </button>
                )}
                {["ASSIGNED", "GOING_TO_VENDOR", "ARRIVED_AT_VENDOR"].includes(detail.status) && (
                  <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("pickup")}>
                    {action.isPending ? "Updating…" : "Confirm pickup"}
                  </button>
                )}
                {detail.status === "PICKED_UP" && (
                  <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("in_transit")}>
                    {action.isPending ? "Updating…" : "Start trip"}
                  </button>
                )}
                {(detail.status === "PICKED_UP" || detail.status === "IN_TRANSIT") && (
                  <button className="btn btn-sm" disabled={action.isPending} onClick={() => run("deliver")}>
                    {action.isPending ? "Updating…" : "Mark delivered"}
                  </button>
                )}
              </span>
              {confirmFail ? (
                <div style={{ marginTop: 12 }}>
                  <p className="muted">Report the delivery as failed? The order returns to the job pool.</p>
                  <span style={{ display: "flex", gap: 8 }}>
                    <button className="btn danger btn-sm" disabled={action.isPending} onClick={() => run("fail")}>
                      {action.isPending ? "Reporting…" : "Confirm failure"}
                    </button>
                    <button className="btn secondary btn-sm" onClick={() => setConfirmFail(false)}>
                      Keep trip
                    </button>
                  </span>
                </div>
              ) : (
                <p style={{ marginTop: 12 }}>
                  <button className="btn danger btn-sm" onClick={() => setConfirmFail(true)}>
                    Report failure
                  </button>
                </p>
              )}
            </>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export default function RiderDeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const profile = useRiderProfile();

  if (profile.isLoading) {
    return (
      <PageShell>
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </PageShell>
    );
  }
  if (profile.isError || !profile.data) return <RiderSignIn />;

  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 900 }}>
        <p>
          <Link href="/rider/deliveries">← All deliveries</Link>
        </p>
        <h1 style={{ marginTop: 0 }}>Delivery</h1>
        <RiderNav />
        <Detail id={id} />
      </section>
    </PageShell>
  );
}
