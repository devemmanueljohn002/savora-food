"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminShell, AdminSignIn, Pager } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useAdminRiders, useUpdateAdminRider } from "@/lib/api/hooks";

const FILTERS = ["", "PENDING", "APPROVED", "REJECTED"];

function RiderRowActions({ id, verificationStatus }: { id: string; verificationStatus: string }) {
  const update = useUpdateAdminRider(id);
  const [error, setError] = useState("");

  async function verify(next: "APPROVED" | "REJECTED") {
    setError("");
    try {
      await update.mutateAsync({ verificationStatus: next });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {verificationStatus !== "APPROVED" && (
        <button className="btn btn-sm" type="button" disabled={update.isPending} onClick={() => void verify("APPROVED")}>
          Approve
        </button>
      )}
      {verificationStatus !== "REJECTED" && (
        <button className="btn danger btn-sm" type="button" disabled={update.isPending} onClick={() => void verify("REJECTED")}>
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

function RidersBody() {
  const searchParams = useSearchParams();
  const [verification, setVerification] = useState(searchParams.get("verification") ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const riders = useAdminRiders({
    verification: verification || undefined,
    search: search || undefined,
    page,
    limit: 15,
  });

  if (riders.isError) return <AdminSignIn />;

  return (
    <AdminShell title="Riders" sub="Verify rider applications and manage availability.">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search name or phone…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="auth-select"
          style={{ maxWidth: 220 }}
          value={verification}
          onChange={(event) => {
            setVerification(event.target.value);
            setPage(1);
          }}
        >
          {FILTERS.map((value) => (
            <option key={value || "all"} value={value}>
              {value === "" ? "All statuses" : value}
            </option>
          ))}
        </select>
      </div>

      <Table
        loading={riders.isLoading}
        rows={riders.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No riders found"
        columns={[
          {
            key: "rider",
            header: "Rider",
            render: (row) => (
              <div>
                <Link href={`/admin/riders/${row.id}`}>
                  <strong>{row.name}</strong>
                </Link>
                <div className="muted-small">
                  {row.phone ?? "no phone"} · {row.vehicleType ?? "no vehicle"} · {row.deliveryCount} trips
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
            key: "docs",
            header: "Docs",
            render: (row) =>
              row.pendingDocuments > 0 ? (
                <span className="badge badge-warning">{row.pendingDocuments} pending</span>
              ) : (
                "—"
              ),
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span>
                <span className={`badge ${row.status === "ACTIVE" ? "badge-success" : row.status === "SUSPENDED" ? "badge-danger" : "badge"}`}>
                  {row.status}
                </span>{" "}
                <span className={`badge ${row.verificationStatus === "APPROVED" ? "badge-success" : row.verificationStatus === "PENDING" ? "badge-warning" : "badge-danger"}`}>
                  {row.verificationStatus}
                </span>
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            render: (row) => <RiderRowActions id={row.id} verificationStatus={row.verificationStatus} />,
          },
        ]}
      />
      <Pager page={riders.data?.page ?? 1} totalPages={riders.data?.totalPages ?? 1} onPage={setPage} />
    </AdminShell>
  );
}

export default function AdminRidersPage() {
  return (
    <Suspense>
      <RidersBody />
    </Suspense>
  );
}
