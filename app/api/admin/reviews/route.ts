import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { pageMeta, paging, requireAdminUser } from "@/server/admin";
import { listAdminReviews } from "@/server/reviews";

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const url = new URL(request.url);
    const { page, pageSize } = paging(url);
    const hiddenParam = url.searchParams.get("hidden");
    const hidden =
      hiddenParam === "true" ? true : hiddenParam === "false" ? false : undefined;

    const result = await listAdminReviews({
      vendor: url.searchParams.get("vendor")?.trim() || undefined,
      rider: url.searchParams.get("rider")?.trim() || undefined,
      hidden,
      page,
      limit: pageSize,
    });

    return NextResponse.json(
      ok(result.items, pageMeta(result.total, result.page, result.pageSize)),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
