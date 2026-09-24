"use client";

import { useState } from "react";
import Link from "next/link";
import { VendorShell, VendorSignIn, naira } from "@/components/VendorShell";
import { useDeleteVendorProduct, useVendorProductsList, useVendorProfile } from "@/lib/api/hooks";
import { updateVendorProduct } from "@/lib/savora-api";

export default function VendorProductsPage() {
  const profile = useVendorProfile();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"" | "active" | "inactive" | "low">("");
  const products = useVendorProductsList({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(filter === "active" ? { active: true } : {}),
    ...(filter === "inactive" ? { active: false } : {}),
    ...(filter === "low" ? { lowStock: true } : {}),
  });
  const remove = useDeleteVendorProduct();
  const [error, setError] = useState("");

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

  async function toggleActive(id: string, isActive: boolean) {
    setError("");
    try {
      await updateVendorProduct(id, { isActive: !isActive });
      products.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the product.");
    }
  }

  async function onDelete(id: string, name: string) {
    if (!window.confirm(`Delete “${name}”? Products with order history are deactivated instead.`)) return;
    setError("");
    try {
      await remove.mutateAsync(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the product.");
    }
  }

  return (
    <VendorShell profile={profile.data} title="Products" sub="Manage your menu, prices and stock.">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search products…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="auth-select" style={{ maxWidth: 220 }} value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="">All products</option>
          <option value="active">Visible</option>
          <option value="inactive">Hidden</option>
          <option value="low">Low stock (≤ 5)</option>
        </select>
        <span style={{ flex: 1 }} />
        <Link className="btn" href="/vendor/products/new">Add product</Link>
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {products.isLoading ? (
        <p className="muted">Loading products…</p>
      ) : (products.data?.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No products found</p>
          <p className="empty-state-desc">Add your first dish to start selling on the marketplace.</p>
          <Link className="btn" href="/vendor/products/new">Add product</Link>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          {products.data?.map((item) => (
            <div className="card card-body" key={item.id}>
              <div className="row">
                <div>
                  <Link href={`/vendor/products/${item.id}`}>
                    <strong>{item.name}</strong>
                  </Link>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {item.categoryName ?? "Uncategorized"} · Stock: {item.stockQuantity} · {item.variantCount} variant
                    {item.variantCount === 1 ? "" : "s"} · ★ {item.ratingAverage.toFixed(1)} ({item.ratingCount})
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    30-day revenue: {naira(item.revenue30d)} · {item.orders30d} orders
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: "0 0 8px" }}>
                    <strong className="price">{naira(item.price)}</strong>
                  </p>
                  <span className={`badge ${item.isActive ? "badge-success" : "badge-warning"}`}>
                    {item.isActive ? "Visible" : "Hidden"}
                  </span>
                </div>
              </div>
              <span style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Link className="btn secondary btn-sm" href={`/vendor/products/${item.id}`}>
                  Edit
                </Link>
                <button className="btn secondary btn-sm" type="button" onClick={() => toggleActive(item.id, item.isActive)}>
                  {item.isActive ? "Hide" : "Show"}
                </button>
                <button className="btn danger btn-sm" type="button" onClick={() => onDelete(item.id, item.name)}>
                  Delete
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </VendorShell>
  );
}
