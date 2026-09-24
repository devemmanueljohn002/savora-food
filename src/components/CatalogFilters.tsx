"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export type FilterValues = {
  q?: string;
  city?: string;
  sort?: string;
  category?: string;
  vendorId?: string;
  maxPrice?: number;
  minRating?: number;
};

export type CategoryOption = { value: string; label: string };

type SortOption = { value: string; label: string };

type CatalogFiltersProps = {
  basePath: string;
  cities: string[];
  current: FilterValues;
  sortOptions?: SortOption[];
  searchPlaceholder?: string;
  categories?: CategoryOption[];
  categoryPlaceholder?: string;
};

const DEFAULT_SORTS: SortOption[] = [
  { value: "", label: "Recommended" },
  { value: "rating", label: "Highest rated" },
  { value: "popular", label: "Most popular" },
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
];

export default function CatalogFilters({
  basePath,
  cities,
  current,
  sortOptions = DEFAULT_SORTS,
  searchPlaceholder = "Search meals, cakes, vendors...",
  categories,
  categoryPlaceholder = "All categories",
}: CatalogFiltersProps) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const [city, setCity] = useState(current.city ?? "");
  const [category, setCategory] = useState(current.category ?? "");
  const [sort, setSort] = useState(current.sort ?? "");

  function apply(next: FilterValues) {
    const merged = { q, city, category, sort, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.city) params.set("city", merged.city);
    if (merged.category) params.set("category", merged.category);
    if (merged.sort) params.set("sort", merged.sort);
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply({});
  }

  return (
    <form className="vfilt-row" onSubmit={submit}>
      <input
        className="vfilt-input"
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <select
        className="vfilt-input"
        value={city}
        aria-label="Filter by city"
        onChange={(event) => {
          setCity(event.target.value);
          apply({ city: event.target.value });
        }}
      >
        <option value="">All cities</option>
        {cities.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {categories ? (
        <select
          className="vfilt-input"
          value={category}
          aria-label="Filter by category"
          onChange={(event) => {
            setCategory(event.target.value);
            apply({ category: event.target.value });
          }}
        >
          <option value="">{categoryPlaceholder}</option>
          {categories.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      <select
        className="vfilt-input"
        value={sort}
        aria-label="Sort vendors"
        onChange={(event) => {
          setSort(event.target.value);
          apply({ sort: event.target.value });
        }}
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button className="btn" type="submit">
        Search
      </button>
    </form>
  );
}