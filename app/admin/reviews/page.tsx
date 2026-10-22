"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminShell, AdminSignIn, Pager } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import {
  useAdminReviews,
  useSetAdminReviewVisibility,
} from "@/lib/api/hooks";
import type { AdminReview } from "@/lib/review-types";

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="muted">—</span>;
  return (
    <span aria-label={`${rating} out of 5`} className="rating">
      {"★".repeat(rating)}
      {"☆".repeat(Math.max(0, 5 - rating))}
    </span>
  );
}

function VisibilityAction({
  review,
  onError,
}: {
  review: AdminReview;
  onError: (message: string) => void;
}) {
  const update = useSetAdminReviewVisibility();

  async function toggle() {
    try {
      await update.mutateAsync({ id: review.id, hidden: !review.isHidden });
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <button
      className={`btn ${review.isHidden ? "" : "secondary"} btn-sm`}
      type="button"
      disabled={update.isPending}
      onClick={() => void toggle()}
    >
      {update.isPending ? "Saving…" : review.isHidden ? "Unhide" : "Hide"}
    </button>
  );
}

export default function AdminReviewsPage() {
  const [vendor, setVendor] = useState("");
  const [rider, setRider] = useState("");
  const [hidden, setHidden] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  const reviews = useAdminReviews({
    vendor: vendor.trim() || undefined,
    rider: rider.trim() || undefined,
    hidden: hidden === "" ? undefined : hidden === "true",
    page,
    limit: 15,
  });

  if (reviews.isError) return <AdminSignIn />;

  return (
    <AdminShell
      title="Reviews"
      sub="Vendor ratings are public; rider ratings and comments are private to admins."
    >
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Vendor name or ID"
          value={vendor}
          onChange={(event) => {
            setVendor(event.target.value);
            setPage(1);
          }}
        />
        <input
          className="input"
          style={{ maxWidth: 240 }}
          placeholder="Rider name or ID"
          value={rider}
          onChange={(event) => {
            setRider(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="auth-select"
          style={{ maxWidth: 200 }}
          value={hidden}
          onChange={(event) => {
            setHidden(event.target.value as "" | "true" | "false");
            setPage(1);
          }}
        >
          <option value="">All reviews</option>
          <option value="false">Visible only</option>
          <option value="true">Hidden only</option>
        </select>
      </div>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <Table
        loading={reviews.isLoading}
        rows={reviews.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No reviews found"
        emptyDescription="Try a different vendor, rider or visibility filter."
        columns={[
          {
            key: "order",
            header: "Order",
            render: (row) => (
              <div>
                <Link href={`/admin/orders/${row.orderId}`}>
                  <strong>{row.orderNumber}</strong>
                </Link>
                <div className="muted-small">{row.customerName}</div>
                <div className="muted-small">
                  {new Date(row.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </div>
              </div>
            ),
          },
          {
            key: "vendor",
            header: "Vendor",
            render: (row) => (
              <div>
                <Link href={`/admin/vendors/${row.vendorId}`}>
                  <strong>{row.vendorName}</strong>
                </Link>
                <div>
                  <Stars rating={row.vendorRating} />
                </div>
                {row.vendorComment ? (
                  <p className="muted-small" style={{ margin: "4px 0 0", maxWidth: 280 }}>
                    {row.vendorComment}
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            key: "rider",
            header: "Rider (private)",
            render: (row) => (
              <div>
                <strong>{row.riderName ?? "No rider"}</strong>
                <div>
                  <Stars rating={row.riderRating} />
                </div>
                {row.riderComment ? (
                  <p className="muted-small" style={{ margin: "4px 0 0", maxWidth: 280 }}>
                    {row.riderComment}
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            key: "visibility",
            header: "Visibility",
            render: (row) => (
              <span className={`badge ${row.isHidden ? "badge-danger" : "badge-success"}`}>
                {row.isHidden ? "Hidden" : "Visible"}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => <VisibilityAction review={row} onError={setError} />,
          },
        ]}
      />
      <Pager page={reviews.data?.page ?? 1} totalPages={reviews.data?.totalPages ?? 1} onPage={setPage} />
    </AdminShell>
  );
}
