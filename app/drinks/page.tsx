import PageShell from "@/components/PageShell";
import Marketplace from "@/components/Marketplace";
import { listProductFacets, listProducts } from "@/server/queries/catalog";
import { parseFilters, type RawSearchParams } from "@/lib/catalog-params";
import type { ProductSort } from "@/lib/catalog-types";

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { q, city, sort, category, vendorId, maxPrice, minRating, page } = parseFilters(await searchParams);
  const [result, facets] = await Promise.all([
    listProducts({ type: "DRINK", search: q, city, category, vendorId, maxPrice, minRating, sort: sort as ProductSort | undefined, page, limit: 12 }),
    listProductFacets({ type: "DRINK", city }),
  ]);

  return (
    <PageShell>
      <Marketplace
        title="Drinks & Beverages Marketplace"
        description="Zobo, chapman, fresh juices and chilled drinks from beverage makers across Nigeria."
        items={result.items}
        total={result.total}
        basePath="/drinks"
        current={{ q, city, sort, category, vendorId, maxPrice, minRating }}
        page={result.page}
        totalPages={result.totalPages}
        vendors={facets.vendors}
        categories={facets.categories}
        maxPrice={facets.maxPrice}
      />
    </PageShell>
  );
}
