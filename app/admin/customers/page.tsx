"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminShell, AdminSignIn, Pager, naira } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useAdminCustomers, useUpdateAdminCustomer } from "@/lib/api/hooks";

export default function AdminCustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const customers = useAdminCustomers({ search: search || undefined, page, limit: 15 });
  const [acting, setActing] = useState("");
  const [error, setError] = useState("");

  if (customers.isError) return <AdminSignIn />;

  async function toggle(id: string, status: string, update: (input: { status: "ACTIVE" | "SUSPENDED" }) => Promise<unknown>) {
    setError("");
    setActing(id);
    try {
      await update({ status: status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    } finally {
      setActing("");
    }
  }

  return (
    <AdminShell title="Customers" sub="Accounts, order history and suspension.">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search name or email…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <Table
        loading={customers.isLoading}
        rows={customers.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No customers found"
        columns={[
          {
            key: "customer",
            header: "Customer",
            render: (row) => (
              <div>
                <Link href={`/admin/customers/${row.id}`}>
                  <strong>
                    {[row.firstName, row.lastName].filter(Boolean).join(" ") || row.email}
                  </strong>
                </Link>
                <div className="muted-small">
                  {row.email} · {row.orderCount} orders · {naira(row.totalSpent)} spent
                </div>
              </div>
            ),
          },
          {
            key: "verified",
            header: "Email",
            render: (row) =>
              row.emailVerified ? <span className="badge badge-success">Verified</span> : <span className="badge badge-warning">Unverified</span>,
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span className={`badge ${row.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}>
                {row.status}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => (
              <CustomerToggle id={row.id} status={row.status} acting={acting === row.id} onToggle={toggle} />
            ),
          },
        ]}
      />
      <Pager page={customers.data?.page ?? 1} totalPages={customers.data?.totalPages ?? 1} onPage={setPage} />
    </AdminShell>
  );
}

function CustomerToggle({ id, status, acting, onToggle }: {
  id: string;
  status: string;
  acting: boolean;
  onToggle: (id: string, status: string, update: (input: { status: "ACTIVE" | "SUSPENDED" }) => Promise<unknown>) => void;
}) {
  const update = useUpdateAdminCustomer(id);
  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <Link className="btn secondary btn-sm" href={`/admin/customers/${id}`}>
        View
      </Link>
      <button
        className="btn danger btn-sm"
        disabled={acting || update.isPending}
        onClick={() => onToggle(id, status, (input) => update.mutateAsync(input))}
      >
        {status === "SUSPENDED" ? "Reactivate" : "Suspend"}
      </button>
    </span>
  );
}
