import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { pageMeta, paging, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

/**
 * Admin vendor approval queue (server-guarded: ADMIN role only).
 *
 * Tabs map to vendor statuses: pending = PENDING + UNDER_REVIEW, plus
 * approved / rejected / suspended. Counts come from a real GROUP BY query,
 * never client-side guesses. Every load is fresh (client uses no-store).
 */

const TABS = ["pending", "approved", "rejected", "suspended"] as const;

export type VendorTab = (typeof TABS)[number];

function tabCondition(tab: string): string | null {
  switch (tab.toLowerCase()) {
    case "approved":
      return "APPROVED";
    case "rejected":
      return "REJECTED";
    case "suspended":
      return "SUSPENDED";
    case "pending":
      return null; // PENDING + UNDER_REVIEW handled below
    default:
      return undefined as unknown as null;
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const url = new URL(request.url);
    const rawTab = (url.searchParams.get("tab") ?? url.searchParams.get("status") ?? "pending").trim().toLowerCase();
    const tab: VendorTab = (TABS as readonly string[]).includes(rawTab) ? (rawTab as VendorTab) : "pending";
    const search = url.searchParams.get("search")?.trim() || "";
    const { page, pageSize, offset } = paging(url, 15);

    const sql = db();

    // Real tab counts in one grouped query.
    const countRows = await sql<{ status: string; count: string }[]>`
      SELECT status, COUNT(*)::text AS count FROM vendors GROUP BY status
    `;
    const byStatus = new Map(countRows.map((row) => [row.status, Number(row.count) || 0]));
    const counts = {
      pending: (byStatus.get("PENDING") ?? 0) + (byStatus.get("UNDER_REVIEW") ?? 0),
      approved: byStatus.get("APPROVED") ?? 0,
      rejected: byStatus.get("REJECTED") ?? 0,
      suspended: byStatus.get("SUSPENDED") ?? 0,
    };

    const single = tabCondition(tab);
    const term = search ? `%${search}%` : null;

    const totalRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM vendors v JOIN users u ON u.id = v.user_id
      LEFT JOIN vendor_verifications vv ON vv.vendor_id = v.id
      WHERE ${
        single
          ? sql`v.status = ${single}`
          : tab === "pending"
            ? sql`v.status IN ('PENDING', 'UNDER_REVIEW')`
            : sql`TRUE`
      }
        ${
          term
            ? sql`AND (v.business_name ILIKE ${term} OR v.owner_name ILIKE ${term} OR v.email ILIKE ${term} OR u.email ILIKE ${term})`
            : sql``
        }
    `;
    const total = Number(totalRows[0]?.count ?? 0);

    const rows = await sql<{
      id: string;
      business_name: string;
      slug: string;
      owner_name: string | null;
      email: string | null;
      phone: string | null;
      city: string | null;
      state: string | null;
      status: string;
      status_reason: string | null;
      commission_rate: string;
      rating_average: string;
      rating_count: number;
      is_featured: boolean;
      created_at: Date;
      user_email: string;
      verification_method: string | null;
      verification_status: string | null;
      category: string | null;
      product_count: number;
      order_count: number;
    }[]>`
      SELECT v.id, v.business_name, v.slug, v.owner_name, v.email, v.phone, v.city, v.state,
             v.status, v.status_reason, v.commission_rate, v.rating_average, v.rating_count,
             v.is_featured, v.created_at,
             u.email AS user_email,
             vv.method AS verification_method, vv.status AS verification_status,
             (
               SELECT c.name FROM vendor_categories vc
               JOIN categories c ON c.id = vc.category_id
               WHERE vc.vendor_id = v.id ORDER BY c.name ASC LIMIT 1
             ) AS category,
             (SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id) AS product_count,
             (SELECT COUNT(*) FROM orders o WHERE o.vendor_id = v.id) AS order_count
      FROM vendors v JOIN users u ON u.id = v.user_id
      LEFT JOIN vendor_verifications vv ON vv.vendor_id = v.id
      WHERE ${
        single
          ? sql`v.status = ${single}`
          : tab === "pending"
            ? sql`v.status IN ('PENDING', 'UNDER_REVIEW')`
            : sql`TRUE`
      }
        ${
          term
            ? sql`AND (v.business_name ILIKE ${term} OR v.owner_name ILIKE ${term} OR v.email ILIKE ${term} OR u.email ILIKE ${term})`
            : sql``
        }
      ORDER BY v.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          businessName: row.business_name,
          slug: row.slug,
          ownerName: row.owner_name,
          email: row.email ?? row.user_email,
          userEmail: row.user_email,
          phone: row.phone,
          city: row.city,
          state: row.state,
          status: row.status,
          statusReason: row.status_reason,
          commissionRate: Number(row.commission_rate),
          ratingAverage: Number(row.rating_average),
          ratingCount: row.rating_count,
          isFeatured: row.is_featured,
          createdAt: row.created_at,
          productCount: Number(row.product_count),
          orderCount: Number(row.order_count),
          category: row.category,
          verification: {
            method: row.verification_method ?? "BVN",
            status: row.verification_status ?? "NOT_SUBMITTED",
          },
        })),
        { ...pageMeta(total, page, pageSize), counts, tab },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
