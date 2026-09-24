import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { listCateringPackages } from "@/server/queries/catalog";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(48).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      throw ApiError.validation("Invalid query.", parsed.error.flatten().fieldErrors);
    }

    const packages = await listCateringPackages(parsed.data.limit);
    return NextResponse.json(ok(packages, { count: packages.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}