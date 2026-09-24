"use client";

import { FormEvent, use, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import VendorNav from "@/components/VendorNav";
import { VendorSignIn, naira } from "@/components/VendorShell";
import {
  useDeclineVendorCatering,
  useQuoteVendorCatering,
  useVendorCateringDetail,
  useVendorProfile,
} from "@/lib/api/hooks";

function Detail({ id }: { id: string }) {
  const detail = useVendorCateringDetail(id);
  const quote = useQuoteVendorCatering(id);
  const decline = useDeclineVendorCatering(id);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    try {
      await quote.mutateAsync({
        amount: Number(amount),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setDone("Quote sent. The customer has been notified.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send the quote.");
    }
  }

  async function onDecline() {
    if (!window.confirm("Decline this request? The customer will be notified.")) return;
    setError("");
    try {
      await decline.mutateAsync();
      setDone("Request declined.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not decline the request.");
    }
  }

  if (detail.isLoading) return <p className="muted">Loading request…</p>;
  if (detail.isError || !detail.data) {
    return (
      <>
        <p className="auth-error">Request not found.</p>
        <Link className="btn secondary" href="/vendor/catering">Back to catering</Link>
      </>
    );
  }

  const request = detail.data;
  const closed = ["BOOKED", "ACCEPTED", "CANCELLED", "DECLINED"].includes(request.status);

  return (
    <>
      <div className="two-col">
        <div className="card card-body">
          <h3 style={{ marginTop: 0 }}>Event details</h3>
          <p>
            <strong>{request.eventType}</strong> · {request.guestCount} guests
          </p>
          <p className="muted">
            {request.eventDate} · {request.eventLocation}
          </p>
          <p className="muted">
            {request.fullName} · {request.phone} · {request.email}
          </p>
          {request.specialRequirements && <p>Requests: {request.specialRequirements}</p>}
          <p className="muted">Package: {request.package.title} ({naira(request.package.pricePerGuest)}/guest)</p>
          {request.quote && (
            <p>
              Current quote: <strong>{naira(request.quote.amount)}</strong> ({request.quote.status})
              {request.quote.message ? ` — ${request.quote.message}` : ""}
            </p>
          )}
        </div>

        <div className="form-card">
          <h3 style={{ marginTop: 0 }}>Respond</h3>
          {closed ? (
            <p className="muted">This request is closed ({request.status.replaceAll("_", " ").toLowerCase()}).</p>
          ) : (
            <>
              <form onSubmit={submitQuote}>
                <label>
                  Quote amount (₦)
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
                <label>
                  Message <span className="field-optional">(optional)</span>
                  <textarea
                    value={message}
                    placeholder="What is included, arrival time, payment terms…"
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
                <button className="btn" disabled={quote.isPending}>
                  {quote.isPending ? "Sending…" : "Send quote"}
                </button>
              </form>
              <p style={{ marginTop: 12 }}>
                <button className="btn danger btn-sm" type="button" disabled={decline.isPending} onClick={onDecline}>
                  {decline.isPending ? "Declining…" : "Decline request"}
                </button>
              </p>
            </>
          )}
          {done && (
            <p className="auth-success" role="status">
              {done}
            </p>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export default function VendorCateringDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const profile = useVendorProfile();

  if (profile.isLoading) {
    return (
      <PageShell>
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </PageShell>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;

  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 900 }}>
        <p>
          <Link href="/vendor/catering">← All requests</Link>
        </p>
        <h1 style={{ marginTop: 0 }}>Catering request</h1>
        <VendorNav />
        <Detail id={id} />
      </section>
    </PageShell>
  );
}
