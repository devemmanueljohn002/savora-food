import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { notifyUser } from "@/server/vendors";
import { db } from "@/server/db";

const updateSchema = z.object({
  status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  isFeatured: z.boolean().optional(),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser(request);
    const { id } = await ctx.params;
    const rows = await db()<{
      id: string;
      business_name: string;
      slug: string;
      owner_name: string | null;
      email: string | null;
      phone: string | null;
      description: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      status: string;
      commission_rate: string;
      rating_average: string;
      rating_count: number;
      is_featured: boolean;
      created_at: Date;
      user_email: string;
    }[]>`
      SELECT v.id, v.business_name, v.slug, v.owner_name, v.email, v.phone,
             v.description, v.address, v.city, v.state, v.status, v.commission_rate,
             v.rating_average, v.rating_count, v.is_featured, v.created_at,
             u.email AS user_email
      FROM vendors v JOIN users u ON u.id = v.user_id
      WHERE v.id = ${id} LIMIT 1
    `;
    const vendor = rows[0];
    if (!vendor) throw ApiError.notFound("Vendor not found.");
    const documents = await db()<{
      id: string;
      kind: string;
      url: string;
      status: string;
      created_at: Date;
    }[]>`
      SELECT id, kind, url, status, created_at FROM vendor_documents
      WHERE vendor_id = ${id} ORDER BY created_at DESC
    `;
    return NextResponse.json(
      ok({
        id: vendor.id,
        businessName: vendor.business_name,
        slug: vendor.slug,
        ownerName: vendor.owner_name,
        email: vendor.email,
        userEmail: vendor.user_email,
        phone: vendor.phone,
        description: vendor.description,
        address: vendor.address,
        city: vendor.city,
        state: vendor.state,
        status: vendor.status,
        commissionRate: Number(vendor.commission_rate),
        ratingAverage: Number(vendor.rating_average),
        ratingCount: vendor.rating_count,
        isFeatured: vendor.is_featured,
        createdAt: vendor.created_at,
        documents: documents.map((doc) => ({
          id: doc.id,
          kind: doc.kind,
          url: doc.url,
          status: doc.status,
          createdAt: doc.created_at,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const sql = db();
    const existing = await sql<{ id: string; user_id: string; status: string; business_name: string }[]>`
      SELECT id, user_id, status, business_name FROM vendors WHERE id = ${id} LIMIT 1
    `;
    const vendor = existing[0];
    if (!vendor) throw ApiError.notFound("Vendor not found.");

    const d = parsed.data;
    const rows = await sql<{ id: string; status: string }[]>`
      UPDATE vendors SET
        status = COALESCE(${d.status ?? null}, status),
        commission_rate = COALESCE(${d.commissionRate ?? null}, commission_rate),
        is_featured = COALESCE(${d.isFeatured ?? null}, is_featured),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, status
    `;

    if (d.status && d.status !== vendor.status) {
      const messages: Record<string, string> = {
        APPROVED: `Good news — ${vendor.business_name} is approved and now live on Savora Food.`,
        REJECTED: `Your kitchen application for ${vendor.business_name} was not approved. Contact support for details.`,
        SUSPENDED: `Your kitchen ${vendor.business_name} has been suspended. Contact support.`,
        UNDER_REVIEW: `${vendor.business_name} is now under review.`,
      };
      if (messages[d.status]) {
        await notifyUser({
          userId: vendor.user_id,
          type: "VENDOR",
          title: `Kitchen ${d.status.toLowerCase().replaceAll("_", " ")}`,
          body: messages[d.status],
          data: { vendorId: id, status: d.status },
        });
      }
    }

    await auditLog({
      userId: admin.id,
      action: "vendor.update",
      entityType: "vendor",
      entityId: id,
      meta: { from: vendor.status, to: rows[0]?.status, ...parsed.data },
    });

    return NextResponse.json(ok({ updated: true, id, status: rows[0]?.status }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
