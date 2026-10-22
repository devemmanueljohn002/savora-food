import { NextResponse } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { getVendorRatingSummary } from "@/server/reviews";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const summary = await getVendorRatingSummary(slug);
    if (!summary) throw ApiError.notFound("This vendor is not available.");
    return NextResponse.json(ok(summary));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
