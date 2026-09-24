"use client";

import { use } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { AdminNav, AdminSignIn, naira, orderBadge } from "@/components/AdminShell";
import { useAdminOrder } from "@/lib/api/hooks";

function Detail({ id }: { id: string }) {
  const order = useAdminOrder(id);
  if (order.isLoading) return <p className="muted">Loading order…</p>;
  if (order.isError || !order.data) return <AdminSignIn />;

  const data = order.data;
  return (
    <div className="two-col">
      <div className="card card-body">
        <div className="row">
          <h3 style={{ margin: 0 }}>{data.orderNumber}</h3>
          <span className={`badge ${orderBadge(data.status)}`}>{data.status.replaceAll("_", " ")}</span>
        </div>
        <p className="muted">
          {new Date(data.createdAt).toLocaleString("en-NG")} · {data.vendorName} · {data.customerName} (
          {data.customerEmail})
          {data.riderName ? ` · Rider: ${data.riderName}` : ""}
        </p>
        {data.items.map((item, index) => (
          <div className="row" key={index} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
            <span>
              {item.quantity} × {item.name}
            </span>
            <strong>{naira(item.lineTotal)}</strong>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">Subtotal</span>
          <span>{naira(data.subtotal)}</span>
        </div>
        <div className="row">
          <span className="muted">Delivery fee</span>
          <span>{naira(data.deliveryFee)}</span>
        </div>
        <div className="row">
          <span className="muted">Service fee</span>
          <span>{naira(data.serviceFee)}</span>
        </div>
        <div className="row">
          <span className="muted">Tax</span>
          <span>{naira(data.tax)}</span>
        </div>
        {data.discount > 0 && (
          <div className="row">
            <span className="muted">Discount</span>
            <span>−{naira(data.discount)}</span>
          </div>
        )}
        <div className="row">
          <strong>Total</strong>
          <strong className="price">{naira(data.total)}</strong>
        </div>
        <p className="muted">Payment: {data.paymentStatus}</p>
        {data.settlement ? (
          <>
            <h4 style={{ marginBottom: 4 }}>Settlement</h4>
            <div className="row">
              <span className="muted">Gross</span>
              <span>{naira(data.settlement.gross)}</span>
            </div>
            <div className="row">
              <span className="muted">Commission ({Math.round(data.settlement.commissionRate * 100)}%)</span>
              <span>{naira(data.settlement.commissionAmount)}</span>
            </div>
            <div className="row">
              <span className="muted">Rider fee</span>
              <span>{naira(data.settlement.riderFee)}</span>
            </div>
            <div className="row">
              <strong>Vendor net</strong>
              <strong>{naira(data.settlement.vendorNet)}</strong>
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>Status: {data.settlement.status}</p>
          </>
        ) : (
          <p className="muted">No settlement recorded yet.</p>
        )}
      </div>
      <div className="card card-body">
        <h3 style={{ marginTop: 0 }}>History</h3>
        {data.history.map((entry, index) => (
          <p key={index} className="muted" style={{ margin: "6px 0" }}>
            <strong>{entry.status.replaceAll("_", " ")}</strong> · {new Date(entry.createdAt).toLocaleString("en-NG")}
            {entry.note ? ` · ${entry.note}` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 960 }}>
        <p>
          <Link href="/admin/orders">← All orders</Link>
        </p>
        <h1 style={{ marginTop: 0 }}>Order</h1>
        <AdminNav />
        <Detail id={id} />
      </section>
    </PageShell>
  );
}
