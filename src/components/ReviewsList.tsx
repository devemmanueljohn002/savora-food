import type { ProductReview } from "@/lib/catalog-types";

function Stars({ rating }: { rating: number }) {
  return <span aria-label={`${rating} out of 5`}>{"★".repeat(rating)}{"☆".repeat(Math.max(0, 5 - rating))}</span>;
}

export default function ReviewsList({ reviews }: { reviews: ProductReview[] }) {
  if (reviews.length === 0) {
    return <p className="muted">No reviews yet. Be the first to review this item after ordering.</p>;
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
      {reviews.map((review) => (
        <div className="card card-body" key={review.id}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <strong>{review.userName}</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {new Date(review.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
              </p>
            </div>
            <span className="rating">
              <Stars rating={review.rating} />
            </span>
          </div>
          {review.comment ? <p style={{ margin: "12px 0 0" }}>{review.comment}</p> : null}
        </div>
      ))}
    </div>
  );
}