"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  BadgeCheck,
  Bike,
  ChefHat,
  CircleCheck,
  ClipboardList,
  CreditCard,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  type LucideIcon,
} from "lucide-react";
import PageShell from "@/components/PageShell";
import { getOrders, trackOrderByNumber, type OrderTracking } from "@/lib/savora-api";

type RecentOrder = { orderNumber: string; status: string; createdAt: string; itemCount: number };

type Step = { key: string; label: string; icon: LucideIcon };

const STEPS: Step[] = [
  { key: "placed", label: "Order Placed", icon: ClipboardList },
  { key: "payment", label: "Payment Confirmed", icon: CreditCard },
  { key: "vendor", label: "Vendor Confirmed", icon: BadgeCheck },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready", icon: PackageCheck },
  { key: "rider", label: "Rider Assigned", icon: Bike },
  { key: "picked", label: "Picked Up", icon: PackageOpen },
  { key: "delivered", label: "Delivered", icon: CircleCheck },
];

// Order-level rank per pipeline step (rider/picked steps come from the delivery record).
const ORDER_RANK: Record<string, number> = {
  PENDING_PAYMENT: 0,
  PAID: 1,
  VENDOR_ACCEPTED: 2,
  CONFIRMED: 2,
  PREPARING: 3,
  READY_FOR_PICKUP: 4,
  RIDER_ASSIGNED: 5,
  OUT_FOR_DELIVERY: 6,
  DELIVERED: 7,
};

const STEP_STATUS = [
  "PENDING_PAYMENT",
  "PAID",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  null,
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

const CLOSED = ["DELIVERED", "CANCELLED", "REFUNDED", "FAILED"];

function naira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function paymentBadge(status: string): string {
  if (status === "PAID") return "badge-success";
  if (status === "FAILED") return "badge-danger";
  if (status === "REFUNDED") return "badge-info";
  return "badge-warning";
}

function deliveryBadge(tracked: OrderTracking): { text: string; tone: string } {
  if (CLOSED.includes(tracked.status)) {
    return { text: tracked.status.replaceAll("_", " "), tone: "badge-danger" };
  }
  if (tracked.status === "DELIVERED") return { text: "Delivered", tone: "badge-success" };
  if (tracked.delivery) {
    if (tracked.delivery.status === "ASSIGNED") return { text: "Rider assigned", tone: "badge-info" };
    if (tracked.delivery.status === "GOING_TO_VENDOR")
      return { text: "Rider going to vendor", tone: "badge-info" };
    if (tracked.delivery.status === "ARRIVED_AT_VENDOR")
      return { text: "Rider at vendor", tone: "badge-info" };
    if (tracked.delivery.status === "DELIVERED") return { text: "Delivered", tone: "badge-success" };
    return { text: "Out for delivery", tone: "badge-info" };
  }
  if (tracked.status === "READY_FOR_PICKUP") return { text: "Awaiting rider", tone: "badge-warning" };
  return { text: "In the kitchen", tone: "badge-warning" };
}

function Pipeline({ tracked }: { tracked: OrderTracking }) {
  const closed = CLOSED.includes(tracked.status);
  const rankOf = (status: string) => ORDER_RANK[status] ?? -1;
  let reached = Math.max(rankOf(tracked.status), ...tracked.history.map((event) => rankOf(event.status))) + 1;
  if (tracked.delivery && reached < 6) reached = 6;
  if (
    tracked.delivery &&
    ["PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(tracked.delivery.status) &&
    reached < 7
  ) {
    reached = 7;
  }
  reached = Math.min(8, Math.max(0, reached));

  const timeFor = (index: number): string | null => {
    if (index === 0) return tracked.createdAt;
    if (index === 2) {
      const event = tracked.history.find((entry) => ["VENDOR_ACCEPTED", "CONFIRMED"].includes(entry.status));
      return event ? event.createdAt : null;
    }
    if (index === 5) return tracked.delivery?.assignedAt ?? null;
    if (index === 6) return tracked.delivery?.pickedUpAt ?? null;
    if (index === 7) return tracked.delivery?.deliveredAt ?? null;
    const code = STEP_STATUS[index];
    const event = tracked.history.find((entry) => entry.status === code);
    return event ? event.createdAt : null;
  };

  return (
    <ol className="track-pipe">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const state = closed ? "todo" : index < reached ? "done" : index === reached && reached < 8 ? "current" : "todo";
        const time = timeFor(index);
        return (
          <li className={`track-pipe-step ${state}`} key={step.key}>
            <span className="track-pipe-dot" aria-hidden="true">
              <Icon className="track-pipe-ico" />
            </span>
            {index < STEPS.length - 1 && <span className="track-pipe-line" aria-hidden="true" />}
            <div>
              <p className="track-step-title">
                {step.label}
                {time && state !== "todo" && <span className="track-step-time">{formatTime(time)}</span>}
              </p>
              {state === "current" && !closed && <p className="track-step-note">Current stage</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TrackingResult({ tracked }: { tracked: OrderTracking }) {
  const delivery = deliveryBadge(tracked);
  return (
    <div className="track-result">
      <div className="track-result-head">
        <div>
          <h3>{tracked.orderNumber}</h3>
          <p>
            Placed {formatDate(tracked.createdAt)} · {tracked.items.length}{" "}
            {tracked.items.length === 1 ? "item" : "items"} · {naira(tracked.total)}
            {!CLOSED.includes(tracked.status) && <em> · live</em>}
          </p>
        </div>
        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <span className={`badge ${paymentBadge(tracked.paymentStatus)}`}>
            {tracked.paymentStatus.replaceAll("_", " ")}
          </span>
          <span className={`badge ${delivery.tone}`}>{delivery.text}</span>
        </span>
      </div>

      {CLOSED.includes(tracked.status) && (
        <p className="track-closed" role="note">
          This order was {tracked.status.toLowerCase()}. Contact support if you need help.
        </p>
      )}

      <Pipeline tracked={tracked} />

      <div className="track-cards">
        <section className="track-card">
          <h4>Products</h4>
          <ul>
            {tracked.items.map((item, index) => (
              <li key={index}>
                <span>
                  {item.name} <em>× {item.quantity}</em>
                </span>
                <strong>{naira(item.lineTotal)}</strong>
              </li>
            ))}
          </ul>
          <ul style={{ marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <li>
              <span className="muted">Subtotal</span>
              <strong>{naira(tracked.subtotal ?? tracked.total)}</strong>
            </li>
            <li>
              <span className="muted">Delivery</span>
              <strong>{naira(tracked.deliveryFee ?? 0)}</strong>
            </li>
            {(tracked.serviceFee ?? 0) > 0 && (
              <li>
                <span className="muted">Service fee</span>
                <strong>{naira(tracked.serviceFee)}</strong>
              </li>
            )}
            {(tracked.tax ?? 0) > 0 && (
              <li>
                <span className="muted">Tax</span>
                <strong>{naira(tracked.tax)}</strong>
              </li>
            )}
            {(tracked.discount ?? 0) > 0 && (
              <li>
                <span className="muted">Discount</span>
                <strong>−{naira(tracked.discount)}</strong>
              </li>
            )}
            <li>
              <span>Total</span>
              <strong>{naira(tracked.total)}</strong>
            </li>
          </ul>
        </section>

        <section className="track-card">
          <h4>Vendor</h4>
          <p>
            <Link href={`/vendor/${tracked.vendor.slug}`}>
              <strong>{tracked.vendor.name}</strong>
            </Link>
          </p>
          <p className="muted">{tracked.vendor.phone ?? "Phone available after confirmation"}</p>
          <h4 style={{ marginTop: 16 }}>Delivery address</h4>
          {tracked.address ? (
            <p className="muted" style={{ margin: 0 }}>
              {tracked.address.fullAddress}
              {[tracked.address.city, tracked.address.state].filter(Boolean).length > 0
                ? ` · ${[tracked.address.city, tracked.address.state].filter(Boolean).join(", ")}`
                : ""}
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No delivery address on file.
            </p>
          )}
        </section>

        <section className="track-card">
          <h4>Rider information</h4>
          {tracked.delivery ? (
            <>
              <p style={{ margin: 0 }}>
                <strong>{tracked.delivery.riderName ?? "Your rider"}</strong>
              </p>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {[tracked.delivery.riderPhone, tracked.delivery.vehicleType].filter(Boolean).join(" · ") ||
                  "Contact via support"}
              </p>
              <p style={{ margin: "8px 0 0" }}>
                <span className="badge badge-info">{tracked.delivery.status.replaceAll("_", " ")}</span>
              </p>
              {(tracked.delivery.progressPct ?? 0) > 0 && !CLOSED.includes(tracked.status) && (
                <p style={{ margin: "8px 0 0" }} aria-label={`Delivery progress ${tracked.delivery.progressPct}%`}>
                  <span
                    style={{
                      display: "block",
                      height: 8,
                      borderRadius: 999,
                      background: "var(--line)",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        width: `${tracked.delivery.progressPct}%`,
                        borderRadius: 999,
                        background: "var(--brand, #16a34a)",
                        transition: "width 0.5s ease",
                      }}
                    />
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {tracked.delivery.progressPct}% to your door
                  </span>
                </p>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No rider assigned yet — this updates once a rider accepts your order.
            </p>
          )}
          <h4 style={{ marginTop: 16 }}>Payment status</h4>
          <p style={{ margin: 0 }}>
            <span className={`badge ${paymentBadge(tracked.paymentStatus)}`}>
              {tracked.paymentStatus.replaceAll("_", " ")}
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="muted">Loading tracker…</p>}>
      <Tracker />
    </Suspense>
  );
}

function Tracker() {
  const searchParams = useSearchParams();
  const preset = searchParams.get("number")?.trim() ?? "";
  const [value, setValue] = useState(preset);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tracked, setTracked] = useState<OrderTracking | null>(null);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const trackedRef = useRef<OrderTracking | null>(null);
  useEffect(() => {
    trackedRef.current = tracked;
  }, [tracked]);

  const lookup = useCallback(async (number: string) => {
    const clean = number.trim();
    if (clean.length < 4) {
      setError("Enter a valid order number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setTracked(await trackOrderByNumber(clean));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't find that order number.");
      setTracked(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getOrders()
      .then((result) => {
        if (!controller.signal.aborted) setRecent(result.items.slice(0, 5));
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecent([]);
      });
    return () => controller.abort();
  }, []);

  // Deep link: /track?number=SV-... auto-tracks on load (deferred so the
  // initial render commits before any state update).
  useEffect(() => {
    if (!preset) return;
    const timer = setTimeout(() => {
      void lookup(preset);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live tracking: refresh an open order every 10s until it closes.
  const trackedNumber = tracked?.orderNumber;
  const trackedStatus = tracked?.status;
  useEffect(() => {
    if (!trackedNumber || !trackedStatus || CLOSED.includes(trackedStatus)) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await trackOrderByNumber(trackedRef.current?.orderNumber ?? "");
        if (fresh) setTracked(fresh);
      } catch {
        // Keep the last known state on transient failures.
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [trackedNumber, trackedStatus]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTracked(null);
    await lookup(value);
  }

  return (
    <PageShell>
      <div className="track-wrap">
        <div className="track-hero">
          <PackageSearch className="track-hero-ico" aria-hidden="true" />
          <h1 className="track-title">Track your order</h1>
          <p className="track-sub">Enter your order number (e.g. SVR-123456) to see its live status.</p>
        </div>

        <form className="track-form" onSubmit={submit}>
          <input
            className="track-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="SVR-123456"
            aria-label="Order number"
          />
          <button className="track-btn" type="submit" disabled={busy}>
            {busy ? "Please wait..." : "Track"}
          </button>
        </form>

        {error && (
          <p className="track-error" role="alert">
            {error}
          </p>
        )}

        {tracked && <TrackingResult tracked={tracked} />}

        {recent.length > 0 && (
          <section className="track-recent">
            <h2>Your recent orders</h2>
            <div className="track-recent-list">
              {recent.map((order: RecentOrder) => (
                <Link className="track-order-row" href="/dashboard?tab=orders" key={order.orderNumber}>
                  <div>
                    <h4>{order.orderNumber}</h4>
                    <p>
                      {formatDate(order.createdAt)} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                    </p>
                  </div>
                  <span className="track-badge">{order.status.replaceAll("_", " ")}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
