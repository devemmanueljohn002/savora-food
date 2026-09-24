"use client";

import { useState } from "react";
import Link from "next/link";
import { RiderShell, RiderSignIn, deliveryBadge, naira } from "@/components/RiderShell";
import { useRiderDeliveries, useRiderProfile } from "@/lib/api/hooks";

const FILTERS = ["", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "FAILED"];

export default function RiderDeliveriesPage() {
  const profile = useRiderProfile();
  const [status, setStatus] = useState("");
  const deliveries = useRiderDeliveries({ status: status || undefined });

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <RiderSignIn />;

  return (
    <RiderShell profile={profile.data} title="Deliveries" sub="Every trip you have accepted.">
      <div className="vendor-tabs" role="tablist" aria-label="Delivery status">
        {FILTERS.map((value) => (
          <button
            key={value || "all"}
            type="button"
            role="tab"
            aria-selected={status === value}
            className={`vendor-tab${status === value ? " selected" : ""}`}
            onClick={() => setStatus(value)}
          >
            {value === "" ? "All" : value.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {deliveries.isLoading ? (
        <p className="muted">Loading deliveries…</p>
      ) : (deliveries.data?.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No deliveries</p>
          <p className="empty-state-desc">Accepted jobs will show up here.</p>
          <Link className="btn" href="/rider/dashboard">Find jobs</Link>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          {deliveries.data?.map((delivery) => (
            <div className="card card-body" key={delivery.id}>
              <div className="row">
                <div>
                  <Link href={`/rider/deliveries/${delivery.id}`}>
                    <strong>{delivery.order.orderNumber}</strong>
                  </Link>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {delivery.vendor.name} → {delivery.customer.name ?? "Customer"}
                    {delivery.address ? ` · ${delivery.address.fullAddress}, ${delivery.address.city ?? ""}` : ""}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className={`badge ${deliveryBadge(delivery.status)}`}>
                    {delivery.status.replaceAll("_", " ")}
                  </span>
                  <p style={{ margin: "8px 0 0" }}>
                    <strong className="price">{naira(delivery.order.deliveryFee)}</strong>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </RiderShell>
  );
}
