import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { listCategories } from "@/server/queries/catalog";

const querySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      throw ApiError.validation("Invalid category query.", parsed.error.flatten().fieldErrors);
    }
    const categories = await listCategories(parsed.data.search);
    return NextResponse.json(ok(categories, { count: categories.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}