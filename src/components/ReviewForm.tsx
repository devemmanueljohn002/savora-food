"use client";

import { FormEvent, useState } from "react";
import { Star } from "lucide-react";
import { useCreateProductReview, useReviewableOrders } from "@/lib/api/hooks";

export default function ReviewForm({ productId, slug }: { productId: string; slug: string }) {
  const { data: orders, isLoading, isError } = useReviewableOrders(productId);
  const createReview = useCreateProductReview(slug);
  const [orderId, setOrderId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (isLoading) return <p className="muted">Checking your orders…</p>;
  // Not signed in or no delivered orders containing this product.
  if (isError || !orders || orders.length === 0) return null;

  const pending = orders.filter((order) => !order.reviewed);
  if (pending.length === 0) {
    return <p className="muted">Thanks — you have reviewed this item for all your delivered orders.</p>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const target = orderId || pending[0].orderId;
    try {
      await createReview.mutateAsync({
        orderId: target,
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setDone(true);
      setComment("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit your review.");
    }
  }

  if (done) {
    return (
      <p className="auth-success" role="status">
        Review submitted. Thanks for the feedback!
      </p>
    );
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>Write a review</h3>
      <p className="muted">You ordered this item — tell others what you thought.</p>
      {pending.length > 1 && (
        <label>
          Order
          <select value={orderId || pending[0].orderId} onChange={(event) => setOrderId(event.target.value)}>
            {pending.map((order) => (
              <option key={order.orderId} value={order.orderId}>
                {order.orderNumber}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="field">
        <span className="field-label">Rating</span>
        <div style={{ display: "flex", gap: 4 }} role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} star${value > 1 ? "s" : ""}`}
              onClick={() => setRating(value)}
              style={{
                border: 0,
                background: "none",
                cursor: "pointer",
                color: value <= rating ? "#d28b00" : "#c2b8ad",
                padding: 2,
              }}
            >
              <Star size={24} fill={value <= rating ? "currentColor" : "none"} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <label>
        Comment <span className="field-optional">(optional)</span>
        <textarea
          value={comment}
          maxLength={2000}
          placeholder="How was the taste, portion and delivery?"
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn" disabled={createReview.isPending}>
        {createReview.isPending ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
