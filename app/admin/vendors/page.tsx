"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminShell, AdminSignIn, Pager } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useAdminVendors, useUpdateAdminVendor } from "@/lib/api/hooks";

const STATUSES = ["", "PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"];

function VendorRowActions({ id, status }: { id: string; status: string }) {
  const update = useUpdateAdminVendor(id);
  const [error, setError] = useState("");

  async function setStatus(next: "APPROVED" | "REJECTED") {
    setError("");
    try {
      await update.mutateAsync({ status: next });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {status !== "APPROVED" && (
        <button className="btn btn-sm" type="button" disabled={update.isPending} onClick={() => void setStatus("APPROVED")}>
          Approve
        </button>
      )}
      {status !== "REJECTED" && (
        <button className="btn danger btn-sm" type="button" disabled={update.isPending} onClick={() => void setStatus("REJECTED")}>
          Reject
        </button>
      )}
      {error && (
        <span className="auth-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

function VendorsBody() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const vendors = useAdminVendors({ status: status || undefined, search: search || undefined, page, limit: 15 });

  if (vendors.isError) return <AdminSignIn />;

  return (
    <AdminShell title="Vendors" sub="Approve kitchens, set commissions and feature the best.">
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
        loading={vendors.isLoading}
        rows={vendors.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No vendors found"
        columns={[
          {
            key: "business",
            header: "Kitchen",
            render: (row) => (
              <div>
                <Link href={`/admin/vendors/${row.id}`}>
                  <strong>{row.businessName}</strong>
                </Link>
                <div className="muted-small">
                  {row.ownerName} · {row.city ?? "—"} · {row.productCount} products · {row.orderCount} orders
                </div>
              </div>
            ),
          },
          {
            key: "rating",
            header: "Rating",
            render: (row) => `★ ${row.ratingAverage.toFixed(1)} (${row.ratingCount})`,
          },
          {
            key: "commission",
            header: "Commission",
            align: "right",
            render: (row) => `${row.commissionRate}%`,
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span
                className={`badge ${row.status === "APPROVED" ? "badge-success" : row.status === "PENDING" || row.status === "UNDER_REVIEW" ? "badge-warning" : "badge-danger"}`}
              >
                {row.status.replaceAll("_", " ")}
              </span>
            ),
          },
          {
            key: "featured",
            header: "Featured",
            render: (row) => (row.isFeatured ? "Yes" : "—"),
          },
          {
            key: "actions",
            header: "Actions",
            render: (row) => <VendorRowActions id={row.id} status={row.status} />,
          },
        ]}
      />
      <Pager page={vendors.data?.page ?? 1} totalPages={vendors.data?.totalPages ?? 1} onPage={setPage} />
    </AdminShell>
  );
}

export default function AdminVendorsPage() {
  return (
    <Suspense>
      <VendorsBody />
    </Suspense>
  );
}
