import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { slugify } from "@/server/vendors";
import { db } from "@/server/db";

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const rows = await db()<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      is_active: boolean;
      sort_order: number;
      product_count: number;
    }[]>`
      SELECT c.id, c.name, c.slug, c.description, c.is_active, c.sort_order,
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
      FROM categories c
      ORDER BY c.sort_order ASC, c.name ASC
    `;
    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          isActive: row.is_active,
          sortOrder: row.sort_order,
          productCount: row.product_count,
        })),
        { count: rows.length },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminUser(request);
    const parsed = categorySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const base = slugify(parsed.data.name, "category");
    let slug = base;
    let n = 2;
    while ((await sql<{ id: string }[]>`SELECT id FROM categories WHERE slug = ${slug} LIMIT 1`)[0]) {
      slug = `${base}-${n++}`;
    }

    const rows = await sql<{
      id: string;
      name: string;
      slug: string;
    }[]>`
      INSERT INTO categories (name, slug, description, is_active, sort_order)
      VALUES (${parsed.data.name}, ${slug}, ${parsed.data.description ?? null},
              ${parsed.data.isActive ?? true}, ${parsed.data.sortOrder ?? 0})
      RETURNING id, name, slug
    `;

    await auditLog({
      userId: admin.id,
      action: "category.create",
      entityType: "category",
      entityId: rows[0]?.id,
      meta: { name: parsed.data.name },
    });

    return NextResponse.json(ok(rows[0]), { status: 201 });
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
