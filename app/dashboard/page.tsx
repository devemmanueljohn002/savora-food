"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart, LogIn, Package, Receipt, UtensilsCrossed, Wallet } from "lucide-react";
import PageShell from "@/components/PageShell";
import SignOutButton from "@/components/SignOutButton";
import {
  useAccount,
  useCateringRequests,
  useConsumerOverview,
  useFavorites,
  useMarkNotificationsRead,
  useNotifications,
  useOrder,
  useOrders,
  useRemoveFavorite,
  useUpdateCateringRequest,
} from "@/lib/api/hooks";
import type { OrderListItem } from "@/lib/order-types";

const TABS = ["overview", "orders", "catering", "favorites", "notifications", "profile"] as const;
type Tab = (typeof TABS)[number];

function orderBadge(status: string): string {
  if (status === "DELIVERED") return "badge-success";
  if (status === "CANCELLED" || status === "REFUNDED") return "badge-danger";
  if (status === "PENDING_PAYMENT") return "badge-warning";
  return "badge-info";
}

function cateringBadge(status: string): string {
  if (status === "BOOKED" || status === "ACCEPTED") return "badge-success";
  if (status === "CANCELLED" || status === "DECLINED") return "badge-danger";
  if (status === "QUOTED") return "badge-info";
  return "badge-warning";
}

function naira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 401
  );
}

function SignInPrompt() {
  return (
    <PageShell>
      <section className="section container">
        <h1>Your dashboard</h1>
        <p className="muted">Please sign in to view your orders, bookings and favorites.</p>
        <Link className="btn" href="/auth?next=/dashboard">
          <LogIn size={16} aria-hidden="true" /> Sign in
        </Link>
      </section>
    </PageShell>
  );
}

function OverviewTab() {
  const account = useAccount();
  const stats = useConsumerOverview();
  const orders = useOrders({ limit: 3 });
  const catering = useCateringRequests();

  const recent = orders.data?.items ?? [];

  const upcoming = (catering.data ?? []).filter((request) =>
    ["SUBMITTED", "UNDER_REVIEW", "QUOTED", "ACCEPTED", "BOOKED"].includes(request.status),
  );

  const statValue = (value: number | undefined, loading: boolean) =>
    loading ? "…" : (value ?? 0);

  return (
    <div className="dash-panel">
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <Package size={16} aria-hidden="true" />
            <span>Total orders</span>
          </div>
          <p className="stat-card-value">{statValue(stats.data?.totalOrders, stats.isLoading)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <UtensilsCrossed size={16} aria-hidden="true" />
            <span>Active orders</span>
          </div>
          <p className="stat-card-value">{statValue(stats.data?.activeOrders, stats.isLoading)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <Receipt size={16} aria-hidden="true" />
            <span>Catering bookings</span>
          </div>
          <p className="stat-card-value">{statValue(stats.data?.cateringBookings, stats.isLoading)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <Wallet size={16} aria-hidden="true" />
            <span>Total spend</span>
          </div>
          <p className="stat-card-value">
            {stats.isLoading ? "…" : naira(stats.data?.totalSpend ?? 0)}
          </p>
        </div>
      </div>

      <section>
        <h2 className="dash-section-title">Recent orders</h2>
        {orders.isLoading ? (
          <p className="muted">Loading…</p>
        ) : recent.length === 0 ? (
          <div className="empty-dashed">
            <p className="empty-dashed-title">No orders yet</p>
            <p className="muted" style={{ fontSize: 14 }}>
              Hungry? Browse the marketplace and your orders will show up here.
            </p>
            <Link className="btn" style={{ marginTop: 16 }} href="/food">
              Find something tasty
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recent.map((order) => (
              <Link
                key={order.id}
                className="order-row"
                href={`/track?number=${encodeURIComponent(order.orderNumber)}`}
              >
                <div>
                  <p className="order-row-title">{order.orderNumber}</p>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>
                    {new Date(order.createdAt).toLocaleString("en-GB")}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className={`badge ${orderBadge(order.status)}`}>
                    {order.status.replaceAll("_", " ")}
                  </span>
                  <span className="order-row-total">{naira(order.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="dash-section-title">Upcoming catering</h2>
        {catering.isLoading ? (
          <p className="muted">Loading…</p>
        ) : upcoming.length === 0 ? (
          <div className="empty-dashed">
            <Heart size={24} aria-hidden="true" className="empty-dashed-ico" />
            <p className="muted" style={{ fontSize: 14 }}>
              No catering bookings yet.
            </p>
            <Link className="btn secondary" style={{ marginTop: 16 }} href="/catering">
              Request catering
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {upcoming.slice(0, 3).map((request) => (
              <div className="order-row" key={request.id}>
                <div>
                  <p className="order-row-title">{request.eventType}</p>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>
                    {request.eventDate} · {request.guestCount} guest{request.guestCount === 1 ? "" : "s"} ·{" "}
                    {request.package.title}
                  </p>
                </div>
                <span className={`badge ${cateringBadge(request.status)}`}>
                  {request.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {account.data?.user.emailVerifiedAt == null && (
        <p className="auth-success" role="note" style={{ margin: 0 }}>
          Your email is not verified yet. <Link href="/verify-email">Verify it now</Link> to fully activate your
          account.
        </p>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: OrderListItem }) {
  const [expanded, setExpanded] = useState(false);
  const detail = useOrder(order.id, expanded);

  return (
    <div className="card card-body" key={order.id}>
      <div className="row">
        <div>
          <strong>{order.orderNumber}</strong>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {new Date(order.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })} ·{" "}
            {order.vendor.name} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
          </p>
        </div>
        <span className={`badge ${orderBadge(order.status)}`}>{order.status.replaceAll("_", " ")}</span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <strong className="price">{naira(order.total)}</strong>
        <span style={{ display: "inline-flex", gap: 8 }}>
          <button className="btn ghost btn-sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Hide details" : "Details"}
          </button>
          {order.paymentStatus === "PENDING" && order.status === "PENDING_PAYMENT" ? (
            <Link className="btn btn-sm" href={`/track?number=${encodeURIComponent(order.orderNumber)}`}>
              Pay now
            </Link>
          ) : (
            <Link href={`/track?number=${encodeURIComponent(order.orderNumber)}`}>Track &amp; details</Link>
          )}
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          {detail.isLoading ? (
            <p className="muted">Loading details…</p>
          ) : detail.isError || !detail.data ? (
            <p className="auth-error">Could not load order details.</p>
          ) : (
            <>
              <p className="row"><span className="muted">Subtotal</span><span>{naira(detail.data.subtotal)}</span></p>
              <p className="row"><span className="muted">Delivery</span><span>{naira(detail.data.deliveryFee)}</span></p>
              <p className="row"><span className="muted">Service fee</span><span>{naira(detail.data.serviceFee)}</span></p>
              <p className="row"><span className="muted">Tax</span><span>{naira(detail.data.tax)}</span></p>
              {detail.data.discount > 0 && (
                <p className="row"><span className="muted">Discount</span><span>−{naira(detail.data.discount)}</span></p>
              )}
              {detail.data.requireOtp && detail.data.deliveryOtp && !["DELIVERED", "CANCELLED", "REFUNDED"].includes(detail.data.status) && (
                <p className="auth-success" role="status" style={{ marginTop: 8 }}>
                  Delivery code: <strong>{detail.data.deliveryOtp}</strong> — share it with your rider on arrival.
                </p>
              )}
              {detail.data.items.map((item) => (
                <p className="muted" key={item.id} style={{ margin: "4px 0" }}>
                  {item.quantity} × {item.name} · {naira(item.lineTotal)}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OrdersTab() {
  const [page, setPage] = useState(1);
  const orders = useOrders({ page, limit: 10 });

  return (
    <div>
      {orders.isLoading ? (
        <p className="muted">Loading orders…</p>
      ) : (orders.data?.items.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No orders yet</p>
          <p className="empty-state-desc">Your food orders will appear here once you check out.</p>
          <Link className="btn" href="/food">Browse food</Link>
        </div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
            {orders.data?.items.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
          {(orders.data?.totalPages ?? 1) > 1 && (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn secondary btn-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </button>
              <span className="muted">
                Page {page} of {orders.data?.totalPages}
              </span>
              <button
                className="btn secondary btn-sm"
                disabled={page >= (orders.data?.totalPages ?? 1)}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CateringTab() {
  const requests = useCateringRequests();
  const update = useUpdateCateringRequest();
  const [error, setError] = useState("");

  async function act(id: string, action: "accept" | "cancel") {
    setError("");
    try {
      await update.mutateAsync({ id, action });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <div>
      {requests.isLoading ? (
        <p className="muted">Loading bookings…</p>
      ) : (requests.data?.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No catering bookings</p>
          <p className="empty-state-desc">Plan an event and request a quote from a verified caterer.</p>
          <Link className="btn" href="/catering">Browse catering</Link>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          {requests.data?.map((request) => (
            <div className="card card-body" key={request.id}>
              <div className="row">
                <div>
                  <strong>{request.eventType}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {request.eventDate} · {request.eventLocation} · {request.guestCount} guests
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {request.package.title} · {request.vendor.businessName}
                  </p>
                </div>
                <span className={`badge ${cateringBadge(request.status)}`}>{request.status.replaceAll("_", " ")}</span>
              </div>
              {request.quote && (
                <div className="form-card" style={{ marginTop: 12 }}>
                  <div className="row">
                    <strong>Quote: {naira(request.quote.amount)}</strong>
                    <span className="muted">Status: {request.quote.status}</span>
                  </div>
                  {request.quote.message && <p className="muted">{request.quote.message}</p>}
                  {request.status === "QUOTED" && request.quote.status !== "ACCEPTED" && (
                    <div className="row">
                      <button className="btn btn-sm" disabled={update.isPending} onClick={() => act(request.id, "accept")}>
                        Accept quote
                      </button>
                      <button
                        className="btn secondary btn-sm"
                        disabled={update.isPending}
                        onClick={() => act(request.id, "cancel")}
                      >
                        Cancel request
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!["BOOKED", "CANCELLED", "DECLINED"].includes(request.status) && !request.quote && (
                <button
                  className="btn secondary btn-sm"
                  style={{ marginTop: 12 }}
                  disabled={update.isPending}
                  onClick={() => act(request.id, "cancel")}
                >
                  Cancel request
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="auth-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function FavoritesTab() {
  const favorites = useFavorites();
  const remove = useRemoveFavorite();

  return (
    <div>
      {favorites.isLoading ? (
        <p className="muted">Loading favorites…</p>
      ) : (
        <>
          <h2>Favorite products</h2>
          {(favorites.data?.products.length ?? 0) === 0 ? (
            <p className="muted">Tap the heart on any product to save it here.</p>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
              {favorites.data?.products.map((favorite) => (
                <div className="card card-body" key={favorite.id}>
                  <div className="row">
                    <div>
                      <Link href={`/product/${favorite.product.slug}`}>
                        <strong>{favorite.product.name}</strong>
                      </Link>
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        {favorite.product.vendorName} · ★ {favorite.product.ratingAverage.toFixed(1)}
                      </p>
                    </div>
                    <strong className="price">{naira(favorite.product.price)}</strong>
                  </div>
                  <button
                    className="btn secondary btn-sm"
                    style={{ marginTop: 10 }}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ productId: favorite.product.id })}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 32 }}>Favorite vendors</h2>
          {(favorites.data?.vendors.length ?? 0) === 0 ? (
            <p className="muted">No saved vendors yet.</p>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
              {favorites.data?.vendors.map((favorite) => (
                <div className="card card-body" key={favorite.id}>
                  <div className="row">
                    <div>
                      <Link href={`/vendor/${favorite.vendor.slug}`}>
                        <strong>{favorite.vendor.businessName}</strong>
                      </Link>
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        {[favorite.vendor.city, `★ ${favorite.vendor.ratingAverage.toFixed(1)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <button
                      className="btn secondary btn-sm"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ vendorId: favorite.vendor.id })}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NotificationsTab() {
  const list = useNotifications({ limit: 30 });
  const mark = useMarkNotificationsRead();

  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }}>Notifications</h2>
        <button className="btn secondary btn-sm" disabled={mark.isPending} onClick={() => mark.mutate({ allRead: true })}>
          Mark all read
        </button>
      </div>
      {list.isLoading ? (
        <p className="muted">Loading notifications…</p>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">All caught up</p>
          <p className="empty-state-desc">Order and booking updates will appear here.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          {list.data?.items.map((item) => (
            <div className="card card-body" key={item.id} style={item.readAt ? undefined : { borderColor: "#ffc9a3" }}>
              <div className="row">
                <strong>{item.title}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  {new Date(item.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </span>
              </div>
              {item.body && <p className="muted" style={{ margin: "6px 0 0" }}>{item.body}</p>}
              {!item.readAt && (
                <button
                  className="btn secondary btn-sm"
                  style={{ marginTop: 10 }}
                  disabled={mark.isPending}
                  onClick={() => mark.mutate({ ids: [item.id] })}
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileTab() {
  const account = useAccount();

  if (account.isLoading) return <p className="muted">Loading profile…</p>;
  if (account.isError || !account.data) return <p className="muted">Please sign in to view your profile.</p>;

  const user = account.data.user;
  return (
    <div className="card card-body" style={{ maxWidth: 560 }}>
      <div className="row">
        <div>
          <strong>
            {user.firstName} {user.lastName}
          </strong>
          <p className="muted" style={{ margin: "4px 0 0" }}>{user.email}</p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {user.role.replaceAll("_", " ")}
            {user.phone ? ` · ${user.phone}` : ""}
          </p>
        </div>
        {user.emailVerifiedAt ? (
          <span className="badge badge-success">Verified</span>
        ) : (
          <span className="badge badge-warning">Unverified</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <Link className="btn secondary btn-sm" href="/account/profile">
          Manage profile
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}

function DashboardBody() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const initial: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "overview";
  const [tab, setTab] = useState<Tab>(initial);
  const account = useAccount();

  if (account.isLoading) {
    return (
      <PageShell>
        <section className="section container">
          <p className="muted">Loading your dashboard…</p>
        </section>
      </PageShell>
    );
  }
  if (account.isError && isUnauthorized(account.error)) return <SignInPrompt />;

  const name = account.data?.user.firstName || "there";

  return (
    <PageShell>
      <section className="section container">
        <div className="dash-head">
          <div>
            <h1>Welcome, {name}</h1>
            <p>Manage your orders, catering bookings and favorites.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn secondary" href="/account/profile">Account settings</Link>
            <SignOutButton />
          </div>
        </div>

        <div className="dash-tabs" role="tablist" aria-label="Dashboard">
          {TABS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "selected" : undefined}
              onClick={() => setTab(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "catering" && <CateringTab />}
        {tab === "favorites" && <FavoritesTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "profile" && <ProfileTab />}
      </section>
    </PageShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardBody />
    </Suspense>
  );
}
