import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSuperAdmin } from "@/server/auth/guard";
import { auditLog, pageMeta, paging } from "@/server/admin";
import { hashPassword } from "@/server/auth/password";
import { getUserByEmail } from "@/server/auth/store";
import { db } from "@/server/db";

const createSchema = z.object({
  email: z.email("Enter a valid email address"),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).default("ADMIN"),
});

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const url = new URL(request.url);
    const { page, pageSize, offset } = paging(url);
    const sql = db();
    const totalRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')
    `;
    const total = Number(totalRows[0]?.count ?? 0);
    const rows = await sql<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      role: string;
      status: string;
      last_login_at: Date | null;
      created_at: Date;
    }[]>`
      SELECT id, email, first_name, last_name, role, status, last_login_at, created_at
      FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')
      ORDER BY created_at ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          role: row.role,
          status: row.status,
          lastLoginAt: row.last_login_at,
          createdAt: row.created_at,
        })),
        pageMeta(total, page, pageSize),
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireSuperAdmin(request);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const existing = await getUserByEmail(parsed.data.email);
    if (existing) {
      if (existing.role === "CUSTOMER" || existing.role === "VENDOR" || existing.role === "DELIVERY_PARTNER") {
        throw ApiError.conflict("This email already belongs to a non-admin account.");
      }
      const rows = await sql<{ id: string; role: string }[]>`
        UPDATE users SET role = ${parsed.data.role}, status = 'ACTIVE', updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING id, role
      `;
      await auditLog({
        userId: admin.id,
        action: "admin.promote",
        entityType: "user",
        entityId: existing.id,
        meta: { email: existing.email, role: parsed.data.role },
      });
      return NextResponse.json(ok({ id: rows[0]?.id, role: rows[0]?.role, promoted: true }));
    }

    if (!parsed.data.password) {
      throw ApiError.validation("A password is required for a new admin account.");
    }
    const rows = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
      VALUES (
        ${parsed.data.email.toLowerCase()}, ${await hashPassword(parsed.data.password)},
        ${parsed.data.firstName ?? "Savora"}, ${parsed.data.lastName ?? "Admin"},
        ${parsed.data.role}, 'ACTIVE', NOW()
      )
      RETURNING id
    `;
    await auditLog({
      userId: admin.id,
      action: "admin.create",
      entityType: "user",
      entityId: rows[0]?.id,
      meta: { email: parsed.data.email, role: parsed.data.role },
    });
    return NextResponse.json(ok({ id: rows[0]?.id, role: parsed.data.role, created: true }), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
