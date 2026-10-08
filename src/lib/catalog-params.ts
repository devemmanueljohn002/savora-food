export type RawSearchParams = { [key: string]: string | string[] | undefined };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export type ParsedFilters = {
  q?: string;
  city?: string;
  sort?: string;
  category?: string;
  vendorId?: string;
  maxPrice?: number;
  minRating?: number;
  page: number;
};

export function parseFilters(params: RawSearchParams): ParsedFilters {
  const rawPage = Number(firstValue(params.page));
  const rawMax = firstValue(params.maxPrice)?.trim();
  const rawRating = firstValue(params.minRating)?.trim();
  const rawVendor = firstValue(params.vendorId)?.trim();
  const max = rawMax ? Number(rawMax) : undefined;
  const rating = rawRating ? Number(rawRating) : undefined;
  return {
    q: clampQuery(firstValue(params.q)?.trim()) || undefined,
    city: clampQuery(firstValue(params.city)?.trim()) || undefined,
    sort: clampQuery(firstValue(params.sort)?.trim()) || undefined,
    category: clampQuery(firstValue(params.category)?.trim()) || undefined,
    vendorId: rawVendor && UUID_PATTERN.test(rawVendor) ? rawVendor : undefined,
    maxPrice: max != null && Number.isFinite(max) && max > 0 ? max : undefined,
    minRating: rating != null && Number.isFinite(rating) && rating > 0 ? rating : undefined,
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

/** Search inputs are capped so SSR paths can't feed unbounded ILIKE scans. */
export function clampQuery(value: string | undefined, max = 120): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}