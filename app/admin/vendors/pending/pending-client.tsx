"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell, AdminSignIn, Pager } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { ApiRequestError, type AdminVendor } from "@/lib/savora-api";
import { useAdminVendorQueue } from "@/lib/api/hooks";
import {
  verificationBadge,
  VendorActionDialog,
  VendorRowActions,
  type PendingAction,
} from "../queue-client";

function PhotoThumb({ vendor }: { vendor: AdminVendor }) {
  if (vendor.photoUrl) {
    return (
      // Real S3 profile photo: presigned URL, not an optimizable static asset.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={vendor.photoUrl}
        alt=""
        width={40}
        height={40}
        style={{ width: 40, height: 40, objectFit: "cover", borderRadius: "50%", flex: "none" }}
      />
    );
  }
  const initial = vendor.businessName.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="avatar" style={{ width: 40, height: 40, fontSize: 16 }} aria-hidden="true">
      {initial}
    </span>
  );
}

/**
 * Pending vendor review queue (real database rows only). Shows every
 * kitchen awaiting a decision with its Dojah BVN/NIN result and profile
 * photo. Approve/Reject write an admin_actions row and email the vendor.
 */
export default function PendingVendorsClient() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingAction | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queue = useAdminVendorQueue({ tab: "pending", search: search || undefined, page, limit: 15 });

  if (queue.isError) {
    const status = queue.error instanceof ApiRequestError ? queue.error.status : undefined;
    if (status === 401 || status === 403) return <AdminSignIn />;
    return (
      <AdminShell title="Pending vendors" sub="Kitchens waiting for a review decision.">
        <div className="empty-state" role="alert">
          <p className="empty-state-title">Couldn&apos;t load pending vendors</p>
          <p className="empty-state-desc">{queue.error instanceof Error ? queue.error.message : "Try again."}</p>
          <button className="btn" type="button" onClick={() => queue.refetch()}>
            Retry
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Pending vendors" sub="Kitchens waiting for a review decision.">
      <p style={{ marginTop: 0 }}>
        <Link href="/admin/vendors">← All vendors</Link>
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search name or email…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search pending vendors by name or email"
          type="search"
        />
      </div>

      <Table
        loading={queue.isLoading}
        rows={queue.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle={queue.isFetching ? "Loading…" : "No pending vendors"}
        emptyDescription={
          search
            ? `No pending vendors match “${search}”.`
            : "Every application has been reviewed. New kitchens will appear here."
        }
        columns={[
          {
            key: "business",
            header: "Business",
            render: (row) => (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <PhotoThumb vendor={row} />
                <span>
                  <Link href={`/admin/vendors/${row.id}`}>
                    <strong>{row.businessName}</strong>
                  </Link>
                  <span className="muted-small" style={{ display: "block" }}>
                    {row.email}
                  </span>
                </span>
              </span>
            ),
          },
          {
            key: "owner",
            header: "Owner",
            render: (row) => row.ownerName ?? "—",
          },
          {
            key: "city",
            header: "City",
            render: (row) => row.city ?? "—",
          },
          {
            key: "category",
            header: "Category",
            render: (row) => row.category ?? "—",
          },
          {
            key: "submitted",
            header: "Submitted",
            render: (row) =>
              new Date(row.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" }),
          },
          {
            key: "verification",
            header: "BVN/NIN",
            render: (row) => verificationBadge(row),
          },
          {
            key: "actions",
            header: "Actions",
            render: (row) => <VendorRowActions vendor={row} onAct={setPending} />,
          },
        ]}
      />
      <Pager page={queue.data?.page ?? 1} totalPages={queue.data?.totalPages ?? 1} onPage={setPage} />
      {pending && (
        <VendorActionDialog
          key={`${pending.vendor.id}-${pending.action}`}
          pending={pending}
          onClose={() => setPending(null)}
        />
      )}
    </AdminShell>
  );
}
