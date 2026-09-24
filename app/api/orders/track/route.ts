import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { getOrderTrackingByNumber } from "@/server/orders";

const querySchema = z.object({
  number: z.string().trim().min(4, "Enter a valid order number").max(40, "Enter a valid order number"),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      throw ApiError.validation(parsed.error.issues[0]?.message ?? "Invalid order number.");
    }

    const tracking = await getOrderTrackingByNumber(parsed.data.number);
    if (!tracking) {
      throw ApiError.notFound("We couldn't find that order number.");
    }
    return NextResponse.json(ok(tracking));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}