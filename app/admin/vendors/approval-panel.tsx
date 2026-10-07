"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminSignIn, Pager } from "@/components/AdminShell";
import { Modal } from "@/components/ui/modal";
import { Table } from "@/components/ui";
import { useNotify } from "@/components/ui/toast";
import { ApiRequestError, type AdminVendor } from "@/lib/savora-api";
import { useAdminVendorQueue, useUpdateAdminVendor } from "@/lib/api/hooks";

/**
 * Shared vendor-approval UI: status tabs with live counts, name/email
 * search, and the moderation actions. Used by the full /admin/vendors
 * queue and embedded in the /admin dashboard. All rows, counts and
 * badges come from the admin vendors API (real database queries).
 */

export const VENDOR_TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
] as const;

export type VendorTabKey = (typeof VENDOR_TABS)[number]["key"];

export type PendingVendorAction = {
  vendor: AdminVendor;
  action: "approve" | "reject" | "suspend" | "reactivate" | "override";
};

const ACTION_META: Record<
  PendingVendorAction["action"],
  { title: string; confirmLabel: string; danger: boolean; reasonRequired: boolean; body: (name: string) => string }
> = {
  approve: {
    title: "Approve kitchen",
    confirmLabel: "Approve",
    danger: false,
    reasonRequired: false,
    body: (name) => `${name} will become visible to customers and can receive orders.`,
  },
  reject: {
    title: "Reject application",
    confirmLabel: "Reject",
    danger: true,
    reasonRequired: true,
    body: (name) => `${name} will not be listed. The vendor is emailed the reason.`,
  },
  suspend: {
    title: "Suspend kitchen",
    confirmLabel: "Suspend",
    danger: true,
    reasonRequired: true,
    body: (name) => `${name} will be hidden from customers immediately and stop receiving orders.`,
  },
  reactivate: {
    title: "Reactivate kitchen",
    confirmLabel: "Reactivate",
    danger: false,
    reasonRequired: true,
    body: (name) => `${name} will be visible to customers again.`,
  },
  override: {
    title: "Manually override failed check",
    confirmLabel: "Override & approve",
    danger: false,
    reasonRequired: true,
    body: (name) =>
      `The Dojah identity check failed for ${name}. Overriding approves the kitchen anyway — only do this after a manual review.`,
  },
};

export function verificationBadge(vendor: AdminVendor) {
  const status = vendor.verification.status;
  if (status === "VERIFIED") {
    return <span className="badge badge-success">{vendor.verification.method} verified</span>;
  }
  if (status === "FAILED") {
    return <span className="badge badge-danger">{vendor.verification.method} failed</span>;
  }
  if (status === "PENDING") {
    return <span className="badge badge-warning">{vendor.verification.method} pending</span>;
  }
  return <span className="badge badge-warning">Not submitted</span>;
}

export function vendorStatusBadge(status: string) {
  const tone =
    status === "APPROVED"
      ? "badge badge-success"
      : status === "PENDING" || status === "UNDER_REVIEW"
        ? "badge badge-warning"
        : "badge badge-danger";
  return <span className={tone}>{status.replaceAll("_", " ")}</span>;
}

export function VendorAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="avatar" style={{ width: 36, height: 36, fontSize: 15 }} aria-hidden="true">
      {initial}
    </span>
  );
}

function ApprovalActionDialog({
  pending,
  onClose,
}: {
  pending: PendingVendorAction | null;
  onClose: () => void;
}) {
  const notify = useNotify();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const mutation = useUpdateAdminVendor(pending?.vendor.id ?? "");

  if (!pending) return null;
  const current = pending;
  const meta = ACTION_META[current.action];

  async function confirm() {
    setError("");
    if (meta.reasonRequired && !reason.trim()) {
      setError("A reason is required for this action.");
      return;
    }
    try {
      await mutation.mutateAsync({ action: current.action, reason: reason.trim() || undefined });
      notify.success(
        current.action === "approve"
          ? "Kitchen approved"
          : current.action === "override"
            ? "Check overridden — kitchen approved"
            : current.action === "reactivate"
              ? "Kitchen reactivated"
              : current.action === "suspend"
                ? "Kitchen suspended"
                : "Application rejected",
      );
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <Modal open onClose={onClose} title={`${meta.title} — ${current.vendor.businessName}`}>
      <p className="muted" style={{ marginTop: 0 }}>
        {meta.body(current.vendor.businessName)}
      </p>
      <div className="field">
        <label className="field-label" htmlFor="vendor-action-reason">
          Reason {meta.reasonRequired ? "" : <span className="field-optional">(optional)</span>}
        </label>
        <textarea
          id="vendor-action-reason"
          className="input textarea"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={meta.reasonRequired ? "Tell the vendor why…" : "Add a note (optional)…"}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" className="btn secondary" onClick={onClose} style={{ minHeight: 44 }}>
          Cancel
        </button>
        <button
          type="button"
          className={meta.danger ? "btn danger" : "btn"}
          onClick={() => void confirm()}
          disabled={mutation.isPending}
          style={{ minHeight: 44 }}
        >
          {mutation.isPending ? "Working…" : meta.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Row actions follow the moderation matrix: a pending kitchen with a
 * verified check gets Approve/Reject; a failed check gets Override/Reject;
 * a not-submitted one gets View (full review on the detail page).
 * Live kitchens get Suspend; suspended ones get Reactivate.
 */
export function VendorRowActions({
  vendor,
  onAct,
}: {
  vendor: AdminVendor;
  onAct: (a: PendingVendorAction) => void;
}) {
  const isPending = vendor.status === "PENDING" || vendor.status === "UNDER_REVIEW";
  const check = vendor.verification.status;
  return (
    <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
      {isPending && check === "VERIFIED" && (
        <button className="btn btn-sm" type="button" onClick={() => onAct({ vendor, action: "approve" })}>
          Approve
        </button>
      )}
      {isPending && (check === "VERIFIED" || check === "PENDING") && (
        <button className="btn danger btn-sm" type="button" onClick={() => onAct({ vendor, action: "reject" })}>
          Reject
        </button>
      )}
      {isPending && check === "FAILED" && (
        <>
          <button
            className="btn secondary btn-sm"
            type="button"
            onClick={() => onAct({ vendor, action: "override" })}
          >
            Override
          </button>
          <button className="btn danger btn-sm" type="button" onClick={() => onAct({ vendor, action: "reject" })}>
            Reject
          </button>
        </>
      )}
      {isPending && check === "NOT_SUBMITTED" && (
        <Link className="btn secondary btn-sm" href={`/admin/vendors/${vendor.id}`}>
          View
        </Link>
      )}
      {vendor.status === "REJECTED" && (
        <button className="btn btn-sm" type="button" onClick={() => onAct({ vendor, action: "approve" })}>
          Approve
        </button>
      )}
      {vendor.status === "APPROVED" && (
        <button className="btn danger btn-sm" type="button" onClick={() => onAct({ vendor, action: "suspend" })}>
          Suspend
        </button>
      )}
      {vendor.status === "SUSPENDED" && (
        <button className="btn btn-sm" type="button" onClick={() => onAct({ vendor, action: "reactivate" })}>
          Reactivate
        </button>
      )}
    </span>
  );
}

export default function VendorApprovalPanel({
  initialTab = "pending",
  limit = 15,
  showPager = true,
}: {
  initialTab?: VendorTabKey;
  limit?: number;
  showPager?: boolean;
}) {
  const [tab, setTab] = useState<VendorTabKey>(initialTab);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingVendorAction | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queue = useAdminVendorQueue({ tab, search: search || undefined, page, limit });

  if (queue.isError) {
    const status = queue.error instanceof ApiRequestError ? queue.error.status : undefined;
    if (status === 401 || status === 403) return <AdminSignIn />;
    return (
      <div className="empty-state" role="alert">
        <p className="empty-state-title">Couldn&apos;t load vendors</p>
        <p className="empty-state-desc">{queue.error instanceof Error ? queue.error.message : "Try again."}</p>
        <button className="btn" type="button" onClick={() => queue.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const counts = queue.data?.counts ?? { pending: 0, approved: 0, rejected: 0, suspended: 0 };

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search name or email…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search vendors by name or email"
          type="search"
        />
      </div>

      <nav className="vendor-tabs" aria-label="Vendor status">
        {VENDOR_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`vendor-tab${tab === t.key ? " selected" : ""}`}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            aria-pressed={tab === t.key}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
      </nav>

      <Table
        loading={queue.isLoading}
        rows={queue.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle={queue.isFetching ? "Loading…" : `No ${tab} vendors`}
        emptyDescription={
          search
            ? `No ${tab} vendors match “${search}”.`
            : tab === "pending"
              ? "New kitchen applications will appear here for review."
              : `There are no ${tab} vendors right now.`
        }
        columns={[
          {
            key: "vendor",
            header: "Vendor",
            render: (row) => (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <VendorAvatar name={row.businessName} />
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
            key: "category",
            header: "Category",
            render: (row) => row.category ?? "—",
          },
          {
            key: "verification",
            header: "BVN/NIN check",
            render: (row) => verificationBadge(row),
          },
          {
            key: "applied",
            header: "Applied",
            render: (row) =>
              new Date(row.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" }),
          },
          {
            key: "actions",
            header: "Actions",
            render: (row) => <VendorRowActions vendor={row} onAct={setPending} />,
          },
        ]}
      />
      {showPager && (
        <Pager page={queue.data?.page ?? 1} totalPages={queue.data?.totalPages ?? 1} onPage={setPage} />
      )}
      {pending && (
        <ApprovalActionDialog
          key={`${pending.vendor.id}-${pending.action}`}
          pending={pending}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
