"use client";

import { FormEvent, useState } from "react";
import { Star } from "lucide-react";
import { useCreateOrderReview } from "@/lib/api/hooks";
import type { OrderReview } from "@/lib/review-types";

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }} role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating} star${rating > 1 ? "s" : ""}`}
          onClick={() => onChange(value === rating ? 0 : rating)}
          style={{
            border: 0,
            background: "none",
            cursor: "pointer",
            color: rating <= value ? "#d28b00" : "#c2b8ad",
            padding: 2,
          }}
        >
          <Star size={22} fill={rating <= value ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`} className="rating">
      {"★".repeat(rating)}
      {"☆".repeat(Math.max(0, 5 - rating))}
    </span>
  );
}

function SubmittedReview({ review }: { review: OrderReview }) {
  return (
    <div className="card-body" style={{ padding: 0 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div>
          <strong>Your review</strong>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Submitted {new Date(review.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
          </p>
        </div>
        <StarDisplay rating={review.vendorRating} />
      </div>
      {review.vendorComment ? <p style={{ margin: "10px 0 0" }}>{review.vendorComment}</p> : null}
      {review.riderRating != null || review.riderComment ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div className="row">
            <strong>Rider feedback</strong>
            <span className="badge badge-info">Private</span>
          </div>
          {review.riderRating != null ? <StarDisplay rating={review.riderRating} /> : null}
          {review.riderComment ? <p style={{ margin: "8px 0 0" }}>{review.riderComment}</p> : null}
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Rider feedback is only visible to Savora admins.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function OrderReviewCard({
  orderId,
  hasRider,
  review,
}: {
  orderId: string;
  hasRider: boolean;
  review?: OrderReview | null;
}) {
  const create = useCreateOrderReview(orderId);
  const [submitted, setSubmitted] = useState<OrderReview | null>(null);
  const [vendorRating, setVendorRating] = useState(5);
  const [vendorComment, setVendorComment] = useState("");
  const [riderRating, setRiderRating] = useState(0);
  const [riderComment, setRiderComment] = useState("");
  const [error, setError] = useState("");

  const current = submitted ?? review;
  if (current) return <SubmittedReview review={current} />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (vendorRating < 1) {
      setError("Please choose a vendor rating.");
      return;
    }
    try {
      const saved = await create.mutateAsync({
        vendorRating,
        ...(vendorComment.trim() ? { vendorComment: vendorComment.trim() } : {}),
        ...(hasRider && riderRating > 0
          ? {
              riderRating,
              ...(riderComment.trim() ? { riderComment: riderComment.trim() } : {}),
            }
          : {}),
      });
      setSubmitted(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit your review.");
    }
  }

  return (
    <form className="form-card" onSubmit={submit} style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Rate your order</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Tell other customers about the food. Your vendor rating is public.
      </p>

      <div className="field">
        <span className="field-label">Vendor rating</span>
        <Stars value={vendorRating} onChange={setVendorRating} label="Vendor rating" />
      </div>
      <label>
        Vendor comment <span className="field-optional">(optional)</span>
        <textarea
          value={vendorComment}
          maxLength={500}
          placeholder="How was the taste, portion and packaging?"
          onChange={(event) => setVendorComment(event.target.value)}
        />
      </label>
      <p className="muted" style={{ marginTop: -8, textAlign: "right", fontSize: 12 }}>
        {vendorComment.length}/500
      </p>

      {hasRider ? (
        <>
          <div className="field">
            <span className="field-label">
              Rider rating <span className="field-optional">(optional)</span>
            </span>
            <Stars value={riderRating} onChange={setRiderRating} label="Rider rating" />
          </div>
          <label>
            Rider comment <span className="field-optional">(optional)</span>
            <textarea
              value={riderComment}
              maxLength={500}
              placeholder="How was the delivery experience?"
              onChange={(event) => setRiderComment(event.target.value)}
            />
          </label>
          <p className="muted" style={{ marginTop: -8, textAlign: "right", fontSize: 12 }}>
            {riderComment.length}/500
          </p>
          <p className="muted" style={{ marginTop: 0 }}>
            Rider feedback is private — only Savora admins can see it.
          </p>
        </>
      ) : null}

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn" disabled={create.isPending}>
        {create.isPending ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
