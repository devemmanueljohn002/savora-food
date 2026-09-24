import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { db } from "@/server/db";

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser(request);
    const { id } = await ctx.params;
    const rows = await db()<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      status: string;
      email_verified_at: Date | null;
      created_at: Date;
    }[]>`
      SELECT id, email, first_name, last_name, phone, status, email_verified_at, created_at
      FROM users WHERE id = ${id} AND role = 'CUSTOMER' LIMIT 1
    `;
    const customer = rows[0];
    if (!customer) throw ApiError.notFound("Customer not found.");
    const orders = await db()<{
      id: string;
      order_number: string;
      status: string;
      total: string;
      created_at: Date;
      vendor_name: string;
    }[]>`
      SELECT o.id, o.order_number, o.status, o.total, o.created_at, v.business_name AS vendor_name
      FROM orders o JOIN vendors v ON v.id = o.vendor_id
      WHERE o.user_id = ${id}
      ORDER BY o.created_at DESC
      LIMIT 20
    `;
    return NextResponse.json(
      ok({
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        phone: customer.phone,
        status: customer.status,
        emailVerified: customer.email_verified_at !== null,
        createdAt: customer.created_at,
        orders: orders.map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          total: Number(order.total),
          createdAt: order.created_at,
          vendorName: order.vendor_name,
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
    if (parsed.data.status === undefined) {
      throw ApiError.validation("Nothing to update.");
    }

    const sql = db();
    const rows = await sql<{ id: string; status: string }[]>`
      UPDATE users SET status = ${parsed.data.status}, updated_at = NOW()
      WHERE id = ${id} AND role = 'CUSTOMER'
      RETURNING id, status
    `;
    if (!rows[0]) throw ApiError.notFound("Customer not found.");
    if (parsed.data.status === "SUSPENDED") {
      await sql`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${id} AND revoked_at IS NULL`;
    }

    await auditLog({
      userId: admin.id,
      action: "customer.update",
      entityType: "user",
      entityId: id,
      meta: { status: parsed.data.status },
    });

    return NextResponse.json(ok({ updated: true, id, status: rows[0].status }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
