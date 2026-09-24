import { NextResponse } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { getVendorBySlug } from "@/server/queries/catalog";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const vendor = await getVendorBySlug(slug);
    if (!vendor) {
      throw ApiError.notFound("This vendor is not available.");
    }
    return NextResponse.json(ok(vendor));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}