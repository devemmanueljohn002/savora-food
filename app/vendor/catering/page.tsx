"use client";

import Link from "next/link";
import { VendorShell, VendorSignIn } from "@/components/VendorShell";
import { useVendorCatering, useVendorProfile } from "@/lib/api/hooks";

export default function VendorCateringPage() {
  const profile = useVendorProfile();
  const requests = useVendorCatering();

  if (profile.isLoading) {
    return (
      <main className="page-shell">
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;

  return (
    <VendorShell profile={profile.data} title="Catering requests" sub="Quote events, then customers accept to book.">
      {requests.isLoading ? (
        <p className="muted">Loading requests…</p>
      ) : (requests.data?.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No catering requests</p>
          <p className="empty-state-desc">Event requests for your kitchen will appear here.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          {requests.data?.map((request) => (
            <div className="card card-body" key={request.id}>
              <div className="row">
                <div>
                  <Link href={`/vendor/catering/${request.id}`}>
                    <strong>{request.eventType}</strong>
                  </Link>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {request.eventDate} · {request.eventLocation} · {request.guestCount} guests · {request.fullName}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {request.package.title}
                    {request.quote ? ` · Quoted ₦${request.quote.amount.toLocaleString("en-NG")}` : " · Awaiting quote"}
                  </p>
                </div>
                <span className={`badge ${request.status === "BOOKED" ? "badge-success" : request.status === "CANCELLED" || request.status === "DECLINED" ? "badge-danger" : "badge-warning"}`}>
                  {request.status.replaceAll("_", " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </VendorShell>
  );
}
