import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { checkRateLimit, rateLimitedResponse, searchRateLimitKey } from "@/server/rate-limit";
import {
  listCateringPackages,
  listCategories,
  listProducts,
  listVendors,
} from "@/server/queries/catalog";

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  maxPrice: z.coerce.number().positive().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  limit: z.coerce.number().int().positive().max(24).optional(),
});

/**
 * Single search endpoint across products, vendors, categories and catering
 * packages. All queries are parameterized in catalog.ts; only verified /
 * active / available rows are returned by those helpers.
 */
export async function GET(request: NextRequest) {
  const gate = checkRateLimit(searchRateLimitKey(request));
  if (!gate.ok) return rateLimitedResponse(gate.retryAfter);
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      throw ApiError.validation("Invalid search query.", parsed.error.flatten().fieldErrors);
    }
    const { q, city, category, maxPrice, minRating, limit } = parsed.data;
    const perType = Math.min(limit ?? 6, 24);

    const [products, vendors, categories, catering] = await Promise.all([
      listProducts({ search: q, city, category, maxPrice, minRating, page: 1, limit: perType }),
      listVendors({ search: q, city, category, minRating, page: 1, limit: perType }),
      listCategories(q),
      listCateringPackages(perType, { search: q, city }),
    ]);

    return NextResponse.json(
      ok(
        { products: products.items, vendors: vendors.items, categories, catering },
        {
          q,
          productTotal: products.total,
          vendorTotal: vendors.total,
        },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
