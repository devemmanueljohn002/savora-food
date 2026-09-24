import { NextResponse } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { getProductBySlug, listProductReviews } from "@/server/queries/catalog";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const product = await getProductBySlug(slug);
    if (!product) {
      throw ApiError.notFound("This product is no longer available.");
    }

    const reviews = await listProductReviews(product.id, 5);
    return NextResponse.json(ok({ ...product, reviews }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}