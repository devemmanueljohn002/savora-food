import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { listProducts, type ProductSort, type ProductType } from "@/server/queries/catalog";

const productTypes = ["FOOD", "CAKE", "SNACK", "DRINK", "CATERING"] as const;
const sorts = ["newest", "rating", "popular", "price_asc", "price_desc"] as const;

const querySchema = z.object({
  type: z.enum(productTypes).optional(),
  category: z.string().trim().min(1).optional(),
  vendor: z.string().uuid().optional(),
  city: z.string().trim().min(1).optional(),
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
      throw ApiError.validation("Invalid product query.", parsed.error.flatten().fieldErrors);
    }

    const { type, category, vendor, city, search, sort, featured, page, limit } = parsed.data;
    const result = await listProducts({
      type: type as ProductType | undefined,
      category,
      vendorId: vendor,
      city,
      search,
      sort: sort as ProductSort | undefined,
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