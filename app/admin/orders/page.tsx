"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminShell, AdminSignIn, Pager, naira, orderBadge } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useAdminOrders } from "@/lib/api/hooks";

const STATUSES = ["", "PENDING_PAYMENT", "PAID", "VENDOR_ACCEPTED", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REFUNDED"];

export default function AdminOrdersPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const orders = useAdminOrders({ status: status || undefined, search: search || undefined, page, limit: 15 });

  if (orders.isError) return <AdminSignIn />;

  return (
    <AdminShell title="Orders" sub="Every order across all kitchens.">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search order number…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="auth-select"
          style={{ maxWidth: 220 }}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          {STATUSES.map((value) => (
            <option key={value || "all"} value={value}>
              {value === "" ? "All statuses" : value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <Table
        loading={orders.isLoading}
        rows={orders.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No orders found"
        columns={[
          {
            key: "order",
            header: "Order",
            render: (row) => (
              <div>
                <Link href={`/admin/orders/${row.id}`}>
                  <strong>{row.orderNumber}</strong>
                </Link>
                <div className="muted-small">
                  {new Date(row.createdAt).toLocaleString("en-NG")} · {row.customerEmail}
                </div>
              </div>
            ),
          },
          {
            key: "vendor",
            header: "Vendor",
            render: (row) => <Link href={`/vendor/${row.vendorSlug}`}>{row.vendorName}</Link>,
          },
          {
            key: "total",
            header: "Total",
            align: "right",
            render: (row) => <strong>{naira(row.total)}</strong>,
          },
          {
            key: "payment",
            header: "Payment",
            render: (row) => row.paymentStatus,
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span className={`badge ${orderBadge(row.status)}`}>{row.status.replaceAll("_", " ")}</span>
            ),
          },
        ]}
      />
      <Pager page={orders.data?.page ?? 1} totalPages={orders.data?.totalPages ?? 1} onPage={setPage} />
    </AdminShell>
  );
}
