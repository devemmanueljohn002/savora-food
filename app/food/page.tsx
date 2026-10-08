import PageShell from "@/components/PageShell";
import Marketplace from "@/components/Marketplace";
import { listProductFacets, listProducts } from "@/server/queries/catalog";
import { parseFilters, type RawSearchParams } from "@/lib/catalog-params";
import type { ProductSort } from "@/lib/catalog-types";

import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: 'Food delivery in Nigeria | Hot freshly cooked meals',
  description: 'Hot, freshly cooked meals from restaurants and home kitchens across Nigeria.',
  alternates: { canonical: absoluteUrl('/food') },
  openGraph: { title: 'Food delivery in Nigeria | Hot freshly cooked meals', description: 'Hot, freshly cooked meals from restaurants and home kitchens across Nigeria.', url: absoluteUrl('/food') },
  twitter: { card: 'summary_large_image', title: 'Food delivery in Nigeria | Hot freshly cooked meals', description: 'Hot, freshly cooked meals from restaurants and home kitchens across Nigeria.' },
};

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { q, city, sort, category, vendorId, maxPrice, minRating, page } = parseFilters(await searchParams);
  const [result, facets] = await Promise.all([
    listProducts({ type: "FOOD", search: q, city, category, vendorId, maxPrice, minRating, sort: sort as ProductSort | undefined, page, limit: 12 }),
    listProductFacets({ type: "FOOD", city }),
  ]);

  return (
    <PageShell>
      <Marketplace
        title="Food Marketplace"
        description="Hot, freshly cooked meals from restaurants and home kitchens across Nigeria."
        items={result.items}
        total={result.total}
        basePath="/food"
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
