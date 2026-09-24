import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { getVendorBySlug, listProducts } from "@/server/queries/catalog";

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(48).optional(),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const vendor = await getVendorBySlug(slug);
    if (!vendor) {
      throw ApiError.notFound("This vendor is not available.");
    }

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      throw ApiError.validation("Invalid query.", parsed.error.flatten().fieldErrors);
    }

    const result = await listProducts({ vendorId: vendor.id, page: parsed.data.page, limit: parsed.data.limit });
    return NextResponse.json(
      ok(result.items, {
        vendor: { id: vendor.id, slug: vendor.slug, name: vendor.name },
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}