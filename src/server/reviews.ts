import { db } from "./db";
import type {
  AdminReview,
  OrderReview,
  VendorRatingSummary,
  VendorReview,
} from "@/lib/review-types";

const MAX_COMMENT_LENGTH = 500;
const MAX_PAGE_SIZE = 50;

/**
 * Strips HTML tags/control characters from customer comments before they are
 * stored. Comments are rendered as text, but stripping keeps admin exports and
 * future surfaces safe without depending on a renderer.
 */
export function sanitizeReviewComment(value: string | null | undefined): string | null {
  if (value == null) return null;
  let text = value;
  let previous = "";
  // Repeat so nested tags like <<b>script> do not leave a tag behind.
  while (text !== previous) {
    previous = text;
    text = text.replace(/<[^>]*>/g, " ");
  }
  text = text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (text.length > MAX_COMMENT_LENGTH) text = text.slice(0, MAX_COMMENT_LENGTH).trim();
  return text || null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizePage(page: number | undefined, limit: number | undefined): { page: number; limit: number; offset: number } {
  const safePage = Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
  const requested = Number.isInteger(limit) && (limit as number) > 0 ? (limit as number) : 10;
  const safeLimit = Math.min(requested, MAX_PAGE_SIZE);
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

type VendorLookupRow = { id: string };

async function resolveVendorId(identifier: string): Promise<string | null> {
  const rows = await db()<VendorLookupRow[]>`
    SELECT id FROM vendors
    WHERE (id::text = ${identifier} OR slug = ${identifier}) AND status = 'APPROVED'
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

type OrderReviewRow = {
  id: string;
  order_id: string;
  customer_id: string;
  vendor_id: string;
  rider_id: string | null;
  vendor_rating: number;
  vendor_comment: string | null;
  rider_rating: number | null;
  rider_comment: string | null;
  is_hidden: boolean;
  created_at: Date;
};

function mapOrderReview(row: OrderReviewRow): OrderReview {
  return {
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id,
    vendorId: row.vendor_id,
    riderId: row.rider_id,
    vendorRating: row.vendor_rating,
    vendorComment: row.vendor_comment,
    riderRating: row.rider_rating,
    riderComment: row.rider_comment,
    isHidden: row.is_hidden,
    createdAt: toIso(row.created_at),
  };
}

const ORDER_REVIEW_SELECT = `
  id, order_id, customer_id, vendor_id, rider_id,
  vendor_rating, vendor_comment, rider_rating, rider_comment,
  is_hidden, created_at
`;

export async function getOrderReview(orderId: string): Promise<OrderReview | null> {
  const rows = await db().unsafe<OrderReviewRow[]>(
    `SELECT ${ORDER_REVIEW_SELECT} FROM order_reviews WHERE order_id = $1 LIMIT 1`,
    [orderId],
  );
  return rows[0] ? mapOrderReview(rows[0]) : null;
}

export async function insertOrderReview(input: {
  orderId: string;
  customerId: string;
  vendorId: string;
  riderId: string | null;
  vendorRating: number;
  vendorComment: string | null;
  riderRating: number | null;
  riderComment: string | null;
}): Promise<OrderReview | null> {
  const rows = await db().unsafe<OrderReviewRow[]>(
    `INSERT INTO order_reviews (
       order_id, customer_id, vendor_id, rider_id,
       vendor_rating, vendor_comment, rider_rating, rider_comment
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (order_id) DO NOTHING
     RETURNING ${ORDER_REVIEW_SELECT}`,
    [
      input.orderId,
      input.customerId,
      input.vendorId,
      input.riderId,
      input.vendorRating,
      input.vendorComment,
      input.riderRating,
      input.riderComment,
    ],
  );
  return rows[0] ? mapOrderReview(rows[0]) : null;
}

type VendorReviewRow = {
  id: string;
  vendor_rating: number;
  vendor_comment: string | null;
  created_at: Date;
  first_name: string | null;
  total_count: string;
};

export type VendorReviewPage = {
  items: VendorReview[];
  vendorId: string;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listVendorReviews(
  identifier: string,
  page?: number,
  limit?: number,
): Promise<VendorReviewPage | null> {
  const vendorId = await resolveVendorId(identifier);
  if (!vendorId) return null;

  const { page: safePage, limit: safeLimit, offset } = normalizePage(page, limit);
  const rows = await db()<VendorReviewRow[]>`
    SELECT r.id, r.vendor_rating, r.vendor_comment, r.created_at,
           u.first_name,
           COUNT(*) OVER()::text AS total_count
    FROM order_reviews r
    JOIN users u ON u.id = r.customer_id
    WHERE r.vendor_id = ${vendorId} AND r.is_hidden = FALSE
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${safeLimit} OFFSET ${offset}
  `;

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return {
    items: rows.map((row) => ({
      id: row.id,
      vendorRating: row.vendor_rating,
      vendorComment: row.vendor_comment,
      createdAt: toIso(row.created_at),
      customerFirstName: (row.first_name ?? "").trim() || "Customer",
    })),
    vendorId,
    total,
    page: safePage,
    pageSize: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function getVendorRatingSummary(identifier: string): Promise<VendorRatingSummary | null> {
  const vendorId = await resolveVendorId(identifier);
  if (!vendorId) return null;

  const rows = await db()<{ average: string; count: string }[]>`
    SELECT COALESCE(ROUND(AVG(vendor_rating)::numeric, 2), 0)::text AS average,
           COUNT(*)::text AS count
    FROM order_reviews
    WHERE vendor_id = ${vendorId} AND is_hidden = FALSE
  `;
  return {
    average: Number(rows[0]?.average ?? 0),
    count: Number(rows[0]?.count ?? 0),
  };
}

type AdminReviewRow = OrderReviewRow & {
  order_number: string;
  customer_name: string | null;
  customer_email: string;
  vendor_name: string;
  rider_name: string | null;
};

export type AdminReviewFilters = {
  vendor?: string;
  rider?: string;
  hidden?: boolean;
  page?: number;
  limit?: number;
};

export async function listAdminReviews(filters: AdminReviewFilters = {}): Promise<{
  items: AdminReview[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const sql = db();
  const { page, limit, offset } = normalizePage(filters.page, filters.limit);
  const conditions = [sql`TRUE`];

  if (filters.vendor?.trim()) {
    const term = filters.vendor.trim().slice(0, 120);
    conditions.push(sql`(v.id::text = ${term} OR v.business_name ILIKE ${`%${term}%`})`);
  }
  if (filters.rider?.trim()) {
    const term = filters.rider.trim().slice(0, 120);
    conditions.push(sql`(dp.id::text = ${term} OR dp.name ILIKE ${`%${term}%`})`);
  }
  if (filters.hidden !== undefined) {
    conditions.push(sql`r.is_hidden = ${filters.hidden}`);
  }
  const where = conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);

  const countRows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM order_reviews r
    JOIN vendors v ON v.id = r.vendor_id
    LEFT JOIN delivery_partners dp ON dp.id = r.rider_id
    WHERE ${where}
  `;
  const total = Number(countRows[0]?.count ?? 0);

  const rows = await sql<AdminReviewRow[]>`
    SELECT r.id, r.order_id, r.customer_id, r.vendor_id, r.rider_id,
           r.vendor_rating, r.vendor_comment, r.rider_rating, r.rider_comment,
           r.is_hidden, r.created_at,
           o.order_number,
           NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS customer_name,
           u.email AS customer_email,
           v.business_name AS vendor_name,
           dp.name AS rider_name
    FROM order_reviews r
    JOIN orders o ON o.id = r.order_id
    JOIN users u ON u.id = r.customer_id
    JOIN vendors v ON v.id = r.vendor_id
    LEFT JOIN delivery_partners dp ON dp.id = r.rider_id
    WHERE ${where}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return {
    items: rows.map((row) => ({
      ...mapOrderReview(row),
      orderNumber: row.order_number,
      customerName: row.customer_name || "Customer",
      customerEmail: row.customer_email,
      vendorName: row.vendor_name,
      riderName: row.rider_name,
    })),
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function setOrderReviewVisibility(id: string, hidden: boolean): Promise<AdminReview | null> {
  const rows = await db()<AdminReviewRow[]>`
    WITH updated AS (
      UPDATE order_reviews SET is_hidden = ${hidden}
      WHERE id = ${id}
      RETURNING *
    )
    SELECT r.id, r.order_id, r.customer_id, r.vendor_id, r.rider_id,
           r.vendor_rating, r.vendor_comment, r.rider_rating, r.rider_comment,
           r.is_hidden, r.created_at,
           o.order_number,
           NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS customer_name,
           u.email AS customer_email,
           v.business_name AS vendor_name,
           dp.name AS rider_name
    FROM updated r
    JOIN orders o ON o.id = r.order_id
    JOIN users u ON u.id = r.customer_id
    JOIN vendors v ON v.id = r.vendor_id
    LEFT JOIN delivery_partners dp ON dp.id = r.rider_id
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapOrderReview(row),
    orderNumber: row.order_number,
    customerName: row.customer_name || "Customer",
    customerEmail: row.customer_email,
    vendorName: row.vendor_name,
    riderName: row.rider_name,
  };
}
