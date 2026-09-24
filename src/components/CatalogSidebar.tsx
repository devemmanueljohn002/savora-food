"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buildCatalogHref, type CatalogFilterState } from "@/lib/catalog-href";

type CatalogSidebarProps = {
  title: string;
  basePath: string;
  vendors: { id: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
  maxPrice: number;
  current: CatalogFilterState;
  open?: boolean;
};

const RATING_OPTIONS = [
  { value: "", label: "Any rating" },
  { value: "3.5", label: "3.5 & up" },
  { value: "4", label: "4.0 & up" },
  { value: "4.5", label: "4.5 & up" },
];

export default function CatalogSidebar({
  title,
  basePath,
  vendors,
  categories,
  maxPrice,
  current,
  open = false,
}: CatalogSidebarProps) {
  const router = useRouter();
  const qRef = useRef<HTMLInputElement>(null);
  const [max, setMax] = useState(current.maxPrice ?? maxPrice);

  function apply(next: Partial<CatalogFilterState>) {
    router.push(buildCatalogHref(basePath, current, next));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply({ q: qRef.current?.value.trim() || undefined });
  }

  const sliderMin = Math.min(1000, maxPrice);
  const sliderMax = Math.max(maxPrice, sliderMin);

  return (
    <aside className={`catalog-side${open ? " is-open" : ""}`}>
      <div>
        <h2 className="catalog-heading">Search in {title}</h2>
        <form onSubmit={submitSearch}>
          <input
            key={current.q ?? ""}
            ref={qRef}
            className="catalog-search"
            placeholder="Search products"
            aria-label={`Search in ${title}`}
            defaultValue={current.q ?? ""}
          />
        </form>
      </div>

      <div>
        <h2 className="catalog-heading">Product type</h2>
        <div className="catalog-check-list">
          {categories.map((category) => (
            <label className="catalog-check" key={category.id} htmlFor={`sub-${category.slug}`}>
              <input
                id={`sub-${category.slug}`}
                type="checkbox"
                checked={current.category === category.slug}
                onChange={() => apply({ category: current.category === category.slug ? undefined : category.slug })}
              />
              <span>{category.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h2 className="catalog-heading">Vendor</h2>
        <div className="catalog-check-list">
          {vendors.map((vendor) => (
            <label className="catalog-check" key={vendor.id} htmlFor={`v-${vendor.id}`}>
              <input
                id={`v-${vendor.id}`}
                type="checkbox"
                checked={current.vendorId === vendor.id}
                onChange={() => apply({ vendorId: current.vendorId === vendor.id ? undefined : vendor.id })}
              />
              <span>{vendor.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h2 className="catalog-heading">Max price: ₦{max.toLocaleString()}</h2>
        <input
          className="price-range"
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={500}
          value={max}
          aria-label="Maximum price"
          onChange={(event) => setMax(Number(event.target.value))}
          onPointerUp={() => apply({ maxPrice: max })}
          onKeyUp={() => apply({ maxPrice: max })}
        />
      </div>

      <div>
        <h2 className="catalog-heading">Minimum rating</h2>
        <select
          className="catalog-select"
          aria-label="Minimum rating"
          value={current.minRating ?? ""}
          onChange={(event) => apply({ minRating: event.target.value ? Number(event.target.value) : undefined })}
        >
          {RATING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
