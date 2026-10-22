import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { setOrderReviewVisibility } from "@/server/reviews";

const schema = z.object({
  hidden: z.boolean(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const review = await setOrderReviewVisibility(id, parsed.data.hidden);
    if (!review) throw ApiError.notFound("Review not found.");

    await auditLog({
      userId: admin.id,
      action: parsed.data.hidden ? "review.hide" : "review.unhide",
      entityType: "order_review",
      entityId: id,
      meta: { hidden: parsed.data.hidden },
    });

    return NextResponse.json(ok(review));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
