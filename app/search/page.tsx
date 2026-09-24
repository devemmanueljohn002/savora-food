import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import VendorCard from "@/components/VendorCard";
import CatalogFilters from "@/components/CatalogFilters";
import { listProducts, listVendorCities, listVendors } from "@/server/queries/catalog";
import { firstValue, parseFilters, type RawSearchParams } from "@/lib/catalog-params";
import type { ProductSort, VendorSort } from "@/lib/catalog-types";

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const { q, city, sort, page } = parseFilters(raw);
  const category = firstValue(raw.category)?.trim() || undefined;

  const [productResult, vendorResult, cities] = await Promise.all([
    q
      ? listProducts({ search: q, category, city, sort: sort as ProductSort | undefined, page, limit: 12 })
      : listProducts({ category, city, sort: sort as ProductSort | undefined, page, limit: 12 }),
    q ? listVendors({ search: q, city, sort: sort as VendorSort | undefined, limit: 6 }) : Promise.resolve(null),
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
          <div className="card card-body">
            <h2>No products found</h2>
            <p className="muted">Try a different keyword, city or category.</p>
          </div>
        ) : (
          <div className="grid">
            {productResult.items.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {productResult.totalPages > 1 ? (
          <p className="muted" style={{ marginTop: 24, textAlign: "center" }}>
            Page {productResult.page} of {productResult.totalPages}
          </p>
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