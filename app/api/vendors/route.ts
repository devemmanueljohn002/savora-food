import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { listVendors, type VendorSort } from "@/server/queries/catalog";

const sorts = ["rating", "popular", "name"] as const;

const querySchema = z.object({
  city: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  sort: z.enum(sorts).optional(),
  featured: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(48).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      throw ApiError.validation("Invalid vendor query.", parsed.error.flatten().fieldErrors);
    }

    const { city, category, search, sort, featured, page, limit } = parsed.data;
    const result = await listVendors({
      city,
      category,
      search,
      sort: sort as VendorSort | undefined,
      featured,
      page,
      limit,
    });

    return NextResponse.json(
      ok(result.items, {
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