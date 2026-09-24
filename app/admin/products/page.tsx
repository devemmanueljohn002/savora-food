"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminShell, AdminSignIn, Pager, naira } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useAdminProducts, useUpdateAdminProduct } from "@/lib/api/hooks";

function ProductActions({ id, isFeatured, isActive, onError }: {
  id: string;
  isFeatured: boolean;
  isActive: boolean;
  onError: (message: string) => void;
}) {
  const update = useUpdateAdminProduct(id);

  async function toggle(patch: { isFeatured?: boolean; isActive?: boolean }) {
    try {
      await update.mutateAsync(patch);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => toggle({ isFeatured: !isFeatured })}>
        {isFeatured ? "Unfeature" : "Feature"}
      </button>
      <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => toggle({ isActive: !isActive })}>
        {isActive ? "Hide" : "Show"}
      </button>
    </span>
  );
}

export default function AdminProductsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const products = useAdminProducts({ search: search || undefined, page, limit: 15 });
  const [error, setError] = useState("");

  if (products.isError) return <AdminSignIn />;

  return (
    <AdminShell title="Products" sub="Feature the best dishes or hide problematic ones.">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search products…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <Table
        loading={products.isLoading}
        rows={products.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No products found"
        columns={[
          {
            key: "product",
            header: "Product",
            render: (row) => (
              <div>
                <Link href={`/product/${row.slug}`}>
                  <strong>{row.name}</strong>
                </Link>
                <div className="muted-small">
                  {row.vendorName} · Stock {row.stockQuantity} · ★ {row.ratingAverage.toFixed(1)}
                </div>
              </div>
            ),
          },
          {
            key: "price",
            header: "Price",
            align: "right",
            render: (row) => <strong>{naira(row.price)}</strong>,
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span>
                <span className={`badge ${row.isActive ? "badge-success" : "badge-warning"}`}>
                  {row.isActive ? "Visible" : "Hidden"}
                </span>{" "}
                {row.isFeatured && <span className="badge badge-info">Featured</span>}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => (
              <ProductActions id={row.id} isFeatured={row.isFeatured} isActive={row.isActive} onError={setError} />
            ),
          },
        ]}
      />
      <Pager page={products.data?.page ?? 1} totalPages={products.data?.totalPages ?? 1} onPage={setPage} />
    </AdminShell>
  );
}
