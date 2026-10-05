import PageShell from "@/components/PageShell";
import Marketplace from "@/components/Marketplace";
import { listProductFacets, listProducts } from "@/server/queries/catalog";
import { parseFilters, type RawSearchParams } from "@/lib/catalog-params";
import type { ProductSort } from "@/lib/catalog-types";

import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: 'Cakes & desserts delivery in Nigeria',
  description: "Freshly baked birthday cakes, cupcakes and custom designs from Nigeria's best bakers.",
  alternates: { canonical: absoluteUrl('/cakes') },
  openGraph: { title: 'Cakes & desserts delivery in Nigeria', description: "Freshly baked birthday cakes, cupcakes and custom designs from Nigeria's best bakers.", url: absoluteUrl('/cakes') },
};

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { q, city, sort, category, vendorId, maxPrice, minRating, page } = parseFilters(await searchParams);
  const [result, facets] = await Promise.all([
    listProducts({ type: "CAKE", search: q, city, category, vendorId, maxPrice, minRating, sort: sort as ProductSort | undefined, page, limit: 12 }),
    listProductFacets({ type: "CAKE", city }),
  ]);

  return (
    <PageShell>
      <Marketplace
        title="Cakes & Desserts Marketplace"
        description="Freshly baked birthday cakes, cupcakes and custom designs from Nigeria's best bakers."
        items={result.items}
        total={result.total}
        basePath="/cakes"
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
