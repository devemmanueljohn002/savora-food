"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import ProductCard from "./ProductCard";
import CatalogSidebar from "./CatalogSidebar";
import { buildCatalogHref, type CatalogFilterState } from "@/lib/catalog-href";
import type { CatalogProduct } from "@/lib/catalog-types";

const SORT_OPTIONS = [
  { value: "", label: "Relevance" },
  { value: "rating", label: "Top rated" },
  { value: "popular", label: "Most popular" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

type MarketplaceBrowserProps = {
  title: string;
  items: CatalogProduct[];
  total: number;
  basePath: string;
  current: CatalogFilterState;
  page: number;
  totalPages: number;
  vendors: { id: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
  maxPrice: number;
};

export default function MarketplaceBrowser({
  title,
  items,
  total,
  basePath,
  current,
  page,
  totalPages,
  vendors,
  categories,
  maxPrice,
}: MarketplaceBrowserProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Bottom sheet (phones) / dialog (tablets): lock scroll + Escape to close.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const close = () => setOpen(false);

  return (
    <div className="market-layout">
      <div className="market-desktop-side">
        <CatalogSidebar
          title={title}
          basePath={basePath}
          vendors={vendors}
          categories={categories}
          maxPrice={maxPrice}
          current={current}
        />
      </div>

      {open ? (
        <>
          <div className="sheet-backdrop" onClick={close} aria-hidden="true" />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`Filters for ${title}`}>
            <div className="sheet-head">
              <h2 className="sheet-title">Filters</h2>
              <button type="button" className="sheet-close" onClick={close} aria-label="Close filters">
                &times;
              </button>
            </div>
            <div className="sheet-body">
              <CatalogSidebar
                title={title}
                basePath={basePath}
                vendors={vendors}
                categories={categories}
                maxPrice={maxPrice}
                current={current}
                open
              />
            </div>
            <div className="sheet-foot">
              <button type="button" className="btn" onClick={close}>
                Show {total} result{total === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div>
        <div className="results-bar">
          <p className="results-count">{total} results</p>
          <div className="results-actions">
            <button
              type="button"
              className="filter-toggle"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <SlidersHorizontal className="filter-toggle-ico" aria-hidden="true" />
              Filters
            </button>
            <select
              className="sort-select"
              aria-label="Sort results"
              value={current.sort ?? ""}
              onChange={(event) =>
                router.push(buildCatalogHref(basePath, current, { sort: event.target.value || undefined }))
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="card card-body">
            <h2>No matches found</h2>
            <p className="muted">Try a different search term, vendor, category or price.</p>
            <Link className="btn secondary" href={basePath} style={{ marginTop: 12 }}>
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {items.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="row" style={{ justifyContent: "center", marginTop: 28, gap: 12 }}>
            {page > 1 ? (
              <Link className="btn secondary" href={buildCatalogHref(basePath, current, { page: page - 1 })}>
                ← Previous
              </Link>
            ) : null}
            <span className="muted" style={{ alignSelf: "center" }}>
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link className="btn secondary" href={buildCatalogHref(basePath, current, { page: page + 1 })}>
                Next →
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
