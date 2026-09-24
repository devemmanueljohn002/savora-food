"use client";

import { use, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { AdminNav, AdminSignIn, naira, orderBadge } from "@/components/AdminShell";
import { useAdminCustomer, useUpdateAdminCustomer } from "@/lib/api/hooks";

function Detail({ id }: { id: string }) {
  const customer = useAdminCustomer(id);
  const update = useUpdateAdminCustomer(id);
  const [error, setError] = useState("");

  if (customer.isLoading) return <p className="muted">Loading customer…</p>;
  if (customer.isError || !customer.data) return <AdminSignIn />;

  const data = customer.data;

  async function toggle() {
    setError("");
    try {
      await update.mutateAsync({ status: data.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <div className="two-col">
      <div className="card card-body">
        <h3 style={{ marginTop: 0 }}>
          {[data.firstName, data.lastName].filter(Boolean).join(" ") || data.email}
        </h3>
        <p className="muted">
          {data.email} · {data.phone ?? "no phone"}
        </p>
        <p>
          <span className={`badge ${data.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}>{data.status}</span>{" "}
          {data.emailVerified ? (
            <span className="badge badge-success">Email verified</span>
          ) : (
            <span className="badge badge-warning">Email unverified</span>
          )}
        </p>
        <p className="muted">Joined {new Date(data.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}</p>
        <button className="btn danger btn-sm" disabled={update.isPending} onClick={toggle}>
          {data.status === "SUSPENDED" ? "Reactivate account" : "Suspend account"}
        </button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div>
        <h3>Recent orders</h3>
        {data.orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
            {data.orders.map((order) => (
              <div className="card card-body" key={order.id}>
                <div className="row">
                  <div>
                    <Link href={`/admin/orders/${order.id}`}>
                      <strong>{order.orderNumber}</strong>
                    </Link>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {order.vendorName} · {naira(order.total)}
                    </p>
                  </div>
                  <span className={`badge ${orderBadge(order.status)}`}>{order.status.replaceAll("_", " ")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 960 }}>
        <p>
          <Link href="/admin/customers">← All customers</Link>
        </p>
        <h1 style={{ marginTop: 0 }}>Customer</h1>
        <AdminNav />
        <Detail id={id} />
      </section>
    </PageShell>
  );
}
