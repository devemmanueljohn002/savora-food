import Link from "next/link";
import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import VendorCard from "@/components/VendorCard";
import CatalogFilters from "@/components/CatalogFilters";
import { EmptyState } from "@/components/ui";
import { listProducts, listVendorCities, listVendors } from "@/server/queries/catalog";
import { firstValue, parseFilters, type RawSearchParams } from "@/lib/catalog-params";
import type { ProductSort, VendorSort } from "@/lib/catalog-types";

function pageHref(raw: RawSearchParams, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "page") continue;
    if (Array.isArray(value)) {
      if (value[0]) params.set(key, value[0]);
    } else if (value) {
      params.set(key, value);
    }
  }
  params.set("page", String(page));
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const { q, city, sort, page, maxPrice, minRating } = parseFilters(raw);
  const category = firstValue(raw.category)?.trim().slice(0, 120) || undefined;

  const [productResult, vendorResult, cities] = await Promise.all([
    listProducts({
      search: q,
      category,
      city,
      maxPrice,
      minRating,
      sort: sort as ProductSort | undefined,
      page,
      limit: 12,
    }),
    q ? listVendors({ search: q, city, minRating, sort: sort as VendorSort | undefined, limit: 6 }) : Promise.resolve(null),
    listVendorCities(),
  ]);

  const heading = q ? `Results for “${q}”` : "Browse everything";

  return (
    <PageShell>
      <section className="section container">
        <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.1 }}>{heading}</h1>
        <p className="section-sub" style={{ marginTop: 10 }}>
          {productResult.total} product{productResult.total === 1 ? "" : "s"}
          {vendorResult ? ` · ${vendorResult.total} vendor${vendorResult.total === 1 ? "" : "s"}` : ""}
        </p>

        <CatalogFilters
          basePath="/search"
          cities={cities}
          current={{ q, city, sort }}
          searchPlaceholder="Search meals, cakes, snacks, drinks, vendors..."
        />

        {productResult.items.length === 0 ? (
          <EmptyState
            title="No products found"
            description="Try a different keyword, city or category."
          />
        ) : (
          <div className="grid">
            {productResult.items.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {productResult.totalPages > 1 ? (
          <nav
            aria-label="Search pages"
            style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}
          >
            {productResult.page > 1 ? (
              <Link className="btn secondary btn-sm" href={pageHref(raw, productResult.page - 1)}>
                Previous
              </Link>
            ) : null}
            <p className="muted" style={{ margin: 0 }}>
              Page {productResult.page} of {productResult.totalPages}
            </p>
            {productResult.page < productResult.totalPages ? (
              <Link className="btn secondary btn-sm" href={pageHref(raw, productResult.page + 1)}>
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}

        {vendorResult && vendorResult.items.length > 0 ? (
          <div style={{ marginTop: 48 }}>
            <h2>Vendors matching “{q}”</h2>
            <div className="grid">
              {vendorResult.items.map((vendor) => (
                <VendorCard key={vendor.id} vendor={vendor} />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}