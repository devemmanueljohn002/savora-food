import PageShell from "@/components/PageShell";
import VendorCard from "@/components/VendorCard";
import CatalogFilters from "@/components/CatalogFilters";
import { listLocations, listVendorCategories, listVendorCities, listVendors } from "@/server/queries/catalog";
import { parseFilters, type RawSearchParams } from "@/lib/catalog-params";
import type { VendorSort } from "@/lib/catalog-types";

const VENDOR_SORTS = [
  { value: "", label: "Recommended" },
  { value: "rating", label: "Highest rated" },
  { value: "popular", label: "Most popular" },
  { value: "name", label: "A → Z" },
];

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { q, city, category, sort, page } = parseFilters(await searchParams);
  const [result, cities, categories, locations] = await Promise.all([
    listVendors({ search: q, city, category, sort: sort as VendorSort | undefined, page, limit: 12 }),
    listVendorCities(),
    listVendorCategories(),
    listLocations(),
  ]);

  const deliveryByCity = new Map<string, { fee: number; minutes: number }>();
  for (const location of locations) {
    if (location.city && !deliveryByCity.has(location.city.toLowerCase())) {
      deliveryByCity.set(location.city.toLowerCase(), {
        fee: location.deliveryFee,
        minutes: location.deliveryTimeMinutes,
      });
    }
  }
  const fallbackDelivery = locations[0]
    ? { fee: locations[0].deliveryFee, minutes: locations[0].deliveryTimeMinutes }
    : { fee: 0, minutes: 40 };

  return (
    <PageShell>
      <section className="vendors-hero">
        <div className="vendors-wrap">
          <h1>Vendors on Savora Food</h1>
          <p>Restaurants, home kitchens, bakers, snack makers, drink brands and caterers - all verified before they go live.</p>
        </div>
      </section>

      <div className="vendors-wrap vfilt-wrap">
        <CatalogFilters
          basePath="/vendors"
          cities={cities}
          categories={categories.map((option) => ({ value: option.slug, label: option.name }))}
          current={{ q, city, category, sort }}
          sortOptions={VENDOR_SORTS}
          searchPlaceholder="Search vendors"
        />
      </div>

      <div className="vendors-wrap">
        {result.items.length === 0 ? (
          <div className="card card-body">
            <h2>No vendors found</h2>
            <p className="muted">Try another search term, city or category.</p>
          </div>
        ) : (
          <div className="vendors-grid">
            {result.items.map((vendor) => (
              <VendorCard
                key={vendor.id}
                vendor={vendor}
                delivery={
                  deliveryByCity.get((vendor.city ?? "").toLowerCase()) ?? fallbackDelivery
                }
              />
            ))}
          </div>
        )}

        {result.totalPages > 1 ? (
          <p className="muted" style={{ marginTop: 24, textAlign: "center" }}>
            Page {result.page} of {result.totalPages} · {result.total} vendors
          </p>
        ) : null}
      </div>
    </PageShell>
  );
}