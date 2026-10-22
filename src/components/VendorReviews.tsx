"use client";

import { useVendorReviews } from "@/lib/api/hooks";

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`} className="rating">
      {"★".repeat(rating)}
      {"☆".repeat(Math.max(0, 5 - rating))}
    </span>
  );
}

export default function VendorReviews({
  vendorId,
  emptyText = "No reviews yet. Be the first to review after ordering.",
}: {
  vendorId: string;
  emptyText?: string;
}) {
  const reviews = useVendorReviews(vendorId, 5);
  const items = reviews.data?.pages.flatMap((page) => page.items) ?? [];

  if (reviews.isLoading) return <p className="muted">Loading reviews…</p>;
  if (reviews.isError) return <p className="muted">Could not load reviews right now.</p>;
  if (items.length === 0) return <p className="muted">{emptyText}</p>;

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        {items.map((review) => (
          <div className="card card-body" key={review.id}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <strong>{review.customerFirstName}</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {new Date(review.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </p>
              </div>
              <Stars rating={review.vendorRating} />
            </div>
            {review.vendorComment ? <p style={{ margin: "12px 0 0" }}>{review.vendorComment}</p> : null}
          </div>
        ))}
      </div>
      {reviews.hasNextPage ? (
        <button
          className="btn secondary btn-sm"
          style={{ marginTop: 14 }}
          disabled={reviews.isFetchingNextPage}
          onClick={() => void reviews.fetchNextPage()}
        >
          {reviews.isFetchingNextPage ? "Loading…" : "Load more reviews"}
        </button>
      ) : null}
    </>
  );
}
