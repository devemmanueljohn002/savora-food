import { db } from "../db";
import type {
  CatalogCategory,
  CatalogLocation,
  CatalogProduct,
  CatalogVendor,
  CateringPackage,
  ListProductsInput,
  ListVendorsInput,
  Paginated,
  ProductDetail,
  ProductReview,
  ProductSort,
  ProductType,
  VendorSort,
} from "@/lib/catalog-types";

export type {
  CatalogCategory,
  CatalogLocation,
  CatalogProduct,
  CatalogVendor,
  CateringPackage,
  ListProductsInput,
  ListVendorsInput,
  Paginated,
  ProductDetail,
  ProductReview,
  ProductSort,
  ProductType,
  VendorSort,
};

const MAX_PAGE_SIZE = 48;

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toArray(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  return [];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizePage(page: number | undefined, limit: number | undefined): { page: number; limit: number; offset: number } {
  const safePage = Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
  const requested = Number.isInteger(limit) && (limit as number) > 0 ? (limit as number) : 24;
  const safeLimit = Math.min(requested, MAX_PAGE_SIZE);
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

function paginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return {
    items,
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  price: string | number;
  compare_at_price: string | number | null;
  image_url: string | null;
  product_type: ProductType | null;
  rating_average: string | number;
  rating_count: string | number;
  is_featured: boolean;
  availability: boolean;
  stock_quantity: string | number;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
  vendor_city: string | null;
  vendor_state: string | null;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  total_count?: string | number;
};

function mapProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    shortDescription: row.short_description,
    price: toNumber(row.price),
    compareAtPrice: toNumberOrNull(row.compare_at_price),
    image: row.image_url,
    productType: row.product_type,
    rating: toNumber(row.rating_average),
    ratingCount: toNumber(row.rating_count),
    isFeatured: row.is_featured,
    availability: row.availability,
    stockQuantity: toNumber(row.stock_quantity),
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    vendorSlug: row.vendor_slug,
    vendorCity: row.vendor_city,
    vendorState: row.vendor_state,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
  };
}

const PRODUCT_SELECT = (sql: ReturnType<typeof db>) => sql`
  p.id, p.slug, p.name, p.description, p.short_description, p.price, p.compare_at_price,
  p.image_url, p.product_type, p.rating_average, p.rating_count, p.is_featured,
  p.availability, p.stock_quantity,
  v.id AS vendor_id, v.business_name AS vendor_name, v.slug AS vendor_slug,
  v.city AS vendor_city, v.state AS vendor_state,
  c.id AS category_id, c.name AS category_name, c.slug AS category_slug
`;

const PRODUCT_SORT_SQL: Record<ProductSort, string> = {
  newest: "p.created_at DESC",
  rating: "p.rating_average DESC, p.rating_count DESC",
  popular: "p.rating_count DESC, p.rating_average DESC",
  price_asc: "p.price ASC",
  price_desc: "p.price DESC",
};

export async function listProducts(input: ListProductsInput = {}): Promise<Paginated<CatalogProduct>> {
  const sql = db();
  const { page, limit, offset } = normalizePage(input.page, input.limit);

  const conditions = [sql`p.is_active = TRUE`, sql`v.status = 'APPROVED'`];
  if (input.type) conditions.push(sql`p.product_type = ${input.type}`);
  if (input.category) conditions.push(sql`c.slug = ${input.category}`);
  if (input.vendorId) conditions.push(sql`p.vendor_id = ${input.vendorId}`);
  if (input.featured) conditions.push(sql`p.is_featured = TRUE`);
  if (input.maxPrice != null) conditions.push(sql`p.price <= ${input.maxPrice}`);
  if (input.minRating != null) conditions.push(sql`p.rating_average >= ${input.minRating}`);
  if (input.city) conditions.push(sql`v.city ILIKE ${"%" + input.city + "%"}`);
  if (input.search) {
    const term = "%" + input.search + "%";
    conditions.push(sql`(p.name ILIKE ${term} OR p.short_description ILIKE ${term} OR p.description ILIKE ${term})`);
  }

  const where = conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);
  const orderBy = PRODUCT_SORT_SQL[input.sort ?? "newest"] ?? PRODUCT_SORT_SQL.newest;

  const rows = await sql<ProductRow[]>`
    SELECT ${PRODUCT_SELECT(sql)}, COUNT(*) OVER() AS total_count
    FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where}
    ORDER BY ${sql.unsafe(orderBy)}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = rows.length ? toNumber(rows[0].total_count) : 0;
  return paginated(rows.map(mapProduct), total, page, limit);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const sql = db();
  const rows = await sql<(ProductRow & { ingredients: unknown; prep_info: string | null; created_at: Date })[]>`
    SELECT ${PRODUCT_SELECT(sql)}, p.ingredients, p.prep_info, p.created_at
    FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ${slug} AND p.is_active = TRUE AND v.status = 'APPROVED'
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const imageRows = await sql<{ url: string }[]>`
    SELECT url FROM product_images WHERE product_id = ${row.id} ORDER BY is_primary DESC, sort_order ASC
  `;
  const images = imageRows.map((image) => image.url);
  if (row.image_url) images.unshift(row.image_url);

  return {
    ...mapProduct(row),
    ingredients: toArray(row.ingredients),
    prepInfo: row.prep_info,
    images: Array.from(new Set(images)),
    createdAt: toIso(row.created_at),
  };
}

export async function listProductReviews(productId: string, limit = 20): Promise<ProductReview[]> {
  const sql = db();
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = await sql<
    { id: string; rating: number; comment: string | null; images: unknown; created_at: Date; user_id: string; first_name: string; last_name: string }[]
  >`
    SELECT r.id, r.rating, r.comment, r.images, r.created_at, r.user_id,
           u.first_name, u.last_name
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.product_id = ${productId} AND r.is_approved = TRUE
    ORDER BY r.created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    images: toArray(row.images),
    createdAt: toIso(row.created_at),
    userId: row.user_id,
    userName: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Savora customer",
  }));
}

export async function listCategories(): Promise<CatalogCategory[]> {
  const sql = db();
  return sql<CatalogCategory[]>`
    SELECT id, name, slug FROM categories WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC
  `;
}

export async function listLocations(): Promise<CatalogLocation[]> {
  const sql = db();
  const rows = await sql<
    { id: string; name: string; state: string; city: string | null; delivery_fee: string | number; delivery_time_minutes: string | number }[]
  >`
    SELECT id, name, state, city, delivery_fee, delivery_time_minutes
    FROM locations WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    state: row.state,
    city: row.city,
    deliveryFee: toNumber(row.delivery_fee),
    deliveryTimeMinutes: toNumber(row.delivery_time_minutes),
  }));
}

type VendorRow = {
  id: string;
  slug: string;
  business_name: string;
  owner_name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  logo_url: string | null;
  banner_image_url: string | null;
  rating_average: string | number;
  rating_count: string | number;
  is_featured: boolean;
  categories: unknown;
  total_count?: string | number;
};

function mapVendor(row: VendorRow): CatalogVendor {
  return {
    id: row.id,
    slug: row.slug,
    name: row.business_name,
    ownerName: row.owner_name,
    description: row.description,
    city: row.city,
    state: row.state,
    address: row.address,
    logoUrl: row.logo_url,
    bannerImageUrl: row.banner_image_url,
    rating: toNumber(row.rating_average),
    ratingCount: toNumber(row.rating_count),
    isFeatured: row.is_featured,
    categories: toArray(row.categories),
  };
}

const VENDOR_SORT_SQL: Record<VendorSort, string> = {
  rating: "v.rating_average DESC, v.rating_count DESC",
  popular: "v.rating_count DESC, v.rating_average DESC",
  name: "v.business_name ASC",
};

export async function listVendors(input: ListVendorsInput = {}): Promise<Paginated<CatalogVendor>> {
  const sql = db();
  const { page, limit, offset } = normalizePage(input.page, input.limit);

  const conditions = [sql`v.status = 'APPROVED'`];
  if (input.featured) conditions.push(sql`v.is_featured = TRUE`);
  if (input.city) conditions.push(sql`v.city ILIKE ${"%" + input.city + "%"}`);
  if (input.search) {
    const term = "%" + input.search + "%";
    conditions.push(sql`(v.business_name ILIKE ${term} OR v.description ILIKE ${term})`);
  }
  if (input.category) conditions.push(sql`c.slug = ${input.category}`);

  const where = conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);
  const orderBy = VENDOR_SORT_SQL[input.sort ?? "rating"] ?? VENDOR_SORT_SQL.rating;

  const rows = await sql<VendorRow[]>`
    SELECT
      v.id, v.slug, v.business_name, v.owner_name, v.description, v.city, v.state, v.address,
      v.logo_url, v.banner_image_url, v.rating_average, v.rating_count, v.is_featured,
      COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS categories,
      COUNT(*) OVER() AS total_count
    FROM vendors v
    LEFT JOIN vendor_categories vc ON vc.vendor_id = v.id
    LEFT JOIN categories c ON c.id = vc.category_id
    WHERE ${where}
    GROUP BY v.id
    ORDER BY ${sql.unsafe(orderBy)}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = rows.length ? toNumber(rows[0].total_count) : 0;
  return paginated(rows.map(mapVendor), total, page, limit);
}

export async function getVendorBySlug(slug: string): Promise<CatalogVendor | null> {
  const sql = db();
  const rows = await sql<VendorRow[]>`
    SELECT
      v.id, v.slug, v.business_name, v.owner_name, v.description, v.city, v.state, v.address,
      v.logo_url, v.banner_image_url, v.rating_average, v.rating_count, v.is_featured,
      COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS categories
    FROM vendors v
    LEFT JOIN vendor_categories vc ON vc.vendor_id = v.id
    LEFT JOIN categories c ON c.id = vc.category_id
    WHERE v.slug = ${slug} AND v.status = 'APPROVED'
    GROUP BY v.id
    LIMIT 1
  `;
  return rows[0] ? mapVendor(rows[0]) : null;
}

export async function listVendorCities(): Promise<string[]> {
  const sql = db();
  const rows = await sql<{ city: string }[]>`
    SELECT DISTINCT city FROM vendors
    WHERE status = 'APPROVED' AND city IS NOT NULL AND city <> ''
    ORDER BY city ASC
  `;
  return rows.map((row) => row.city);
}

export async function listVendorCategories(): Promise<CatalogCategory[]> {
  const sql = db();
  const rows = await sql<{ id: string; slug: string; name: string }[]>`
    SELECT DISTINCT c.id, c.slug, c.name
    FROM categories c
    JOIN vendor_categories vc ON vc.category_id = c.id
    JOIN vendors v ON v.id = vc.vendor_id
    WHERE v.status = 'APPROVED'
    ORDER BY c.name ASC
  `;
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
}

export async function listCateringPackages(limit = 24): Promise<CateringPackage[]> {
  const sql = db();
  const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
  const rows = await sql<
    {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      price_per_guest: string | number;
      minimum_guests: string | number;
      included_services: unknown;
      event_types: unknown;
      vendor_id: string;
      vendor_name: string;
      vendor_slug: string;
      vendor_city: string | null;
    }[]
  >`
    SELECT
      cp.id, cp.slug, cp.title, cp.description, cp.price_per_guest, cp.minimum_guests,
      cp.included_services, cp.event_types,
      v.id AS vendor_id, v.business_name AS vendor_name, v.slug AS vendor_slug, v.city AS vendor_city
    FROM catering_packages cp
    JOIN vendors v ON v.id = cp.vendor_id
    WHERE cp.is_active = TRUE AND v.status = 'APPROVED'
    ORDER BY cp.created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    pricePerGuest: toNumber(row.price_per_guest),
    minimumGuests: toNumber(row.minimum_guests),
    includedServices: toArray(row.included_services),
    eventTypes: toArray(row.event_types),
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    vendorSlug: row.vendor_slug,
    vendorCity: row.vendor_city,
  }));
}

export async function listProductFacets(
  input: { type?: ProductType; city?: string } = {}
): Promise<{
  vendors: { id: string; slug: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
  maxPrice: number;
  maxRating: number;
}> {
  const sql = db();

  const conditions = [sql`p.is_active = TRUE`, sql`v.status = 'APPROVED'`];
  if (input.type) conditions.push(sql`p.product_type = ${input.type}`);
  if (input.city) conditions.push(sql`v.city ILIKE ${"%" + input.city + "%"}`);

  const where = conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);

  const rows = await sql<
    {
      vendor_id: string;
      vendor_slug: string;
      business_name: string;
      category_id: string | null;
      category_slug: string | null;
      category_name: string | null;
      max_price: string | number;
      max_rating: string | number | null;
    }[]
  >`
    SELECT
      v.id AS vendor_id, v.slug AS vendor_slug, v.business_name,
      c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
      MAX(p.price) AS max_price, MAX(p.rating_average) AS max_rating
    FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where}
    GROUP BY v.id, v.slug, v.business_name, c.id, c.slug, c.name
    ORDER BY v.business_name ASC
  `;

  const vendors = new Map<string, { id: string; slug: string; name: string }>();
  const categories = new Map<string, { id: string; slug: string; name: string }>();
  let maxPrice = 0;

  for (const row of rows) {
    const price = toNumber(row.max_price);
    if (price > maxPrice) maxPrice = price;
    if (row.vendor_id && !vendors.has(row.vendor_id)) {
      vendors.set(row.vendor_id, { id: row.vendor_id, slug: row.vendor_slug, name: row.business_name });
    }
    if (row.category_id && row.category_slug && !categories.has(row.category_id)) {
      categories.set(row.category_id, { id: row.category_id, slug: row.category_slug, name: row.category_name ?? row.category_slug });
    }
  }

  return {
    vendors: Array.from(vendors.values()).sort((a, b) => a.name.localeCompare(b.name)),
    categories: Array.from(categories.values()).sort((a, b) => a.name.localeCompare(b.name)),
    maxPrice,
    maxRating: 5,
  };
}