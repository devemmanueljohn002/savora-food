"use client";

import { useState } from "react";
import Link from "next/link";
import { VendorShell, VendorSignIn, naira, orderBadge } from "@/components/VendorShell";
import { useVendorOrders, useVendorProfile } from "@/lib/api/hooks";

const FILTERS = ["", "PAID", "VENDOR_ACCEPTED", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

export default function VendorOrdersPage() {
  const profile = useVendorProfile();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const orders = useVendorOrders({ status: status || undefined, page, limit: 15 });

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;

  return (
    <VendorShell profile={profile.data} title="Orders" sub="Confirm, prepare and hand off orders for pickup.">
      <div className="vendor-tabs" role="tablist" aria-label="Order status">
        {FILTERS.map((value) => (
          <button
            key={value || "all"}
            type="button"
            role="tab"
            aria-selected={status === value}
            className={`vendor-tab${status === value ? " selected" : ""}`}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {value === "" ? "All" : value.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {orders.isLoading ? (
        <p className="muted">Loading orders…</p>
      ) : (orders.data?.items.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No orders</p>
          <p className="empty-state-desc">Paid orders from your kitchen will show up here.</p>
        </div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
            {orders.data?.items.map((order) => (
              <div className="card card-body" key={order.id}>
                <div className="row">
                  <div>
                    <Link href={`/vendor/orders/${order.id}`}>
                      <strong>{order.orderNumber}</strong>
                    </Link>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {new Date(order.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                      {order.customerName ?? "Customer"} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                    </p>
                    {order.preferredDeliveryTime && (
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        Requested for {new Date(order.preferredDeliveryTime).toLocaleString("en-NG")}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`badge ${orderBadge(order.status)}`}>{order.status.replaceAll("_", " ")}</span>
                    <p style={{ margin: "8px 0 0" }}>
                      <strong className="price">{naira(order.total)}</strong>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {(orders.data?.totalPages ?? 1) > 1 && (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn secondary btn-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </button>
              <span className="muted">
                Page {page} of {orders.data?.totalPages}
              </span>
              <button
                className="btn secondary btn-sm"
                disabled={page >= (orders.data?.totalPages ?? 1)}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </VendorShell>
  );
}
