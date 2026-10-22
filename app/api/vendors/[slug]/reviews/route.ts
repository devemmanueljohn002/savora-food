import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { listVendorReviews } from "@/server/reviews";

export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page")) || undefined;
    const limit = Number(url.searchParams.get("limit")) || undefined;

    const result = await listVendorReviews(slug, page, limit);
    if (!result) throw ApiError.notFound("This vendor is not available.");

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
