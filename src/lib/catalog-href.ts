export type CatalogFilterState = {
  q?: string;
  city?: string;
  sort?: string;
  category?: string;
  vendorId?: string;
  maxPrice?: number;
  minRating?: number;
  page?: number;
};

export function buildCatalogHref(
  basePath: string,
  current: CatalogFilterState,
  next: Partial<CatalogFilterState> = {}
): string {
  const merged = { ...current, ...next };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.city) params.set("city", merged.city);
  if (merged.sort) params.set("sort", merged.sort);
  if (merged.category) params.set("category", merged.category);
  if (merged.vendorId) params.set("vendorId", merged.vendorId);
  if (merged.maxPrice != null) params.set("maxPrice", String(merged.maxPrice));
  if (merged.minRating != null) params.set("minRating", String(merged.minRating));
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
