import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireAdminUser } from "@/server/admin";
import { getAffiliateLeaderboard, listAffiliatesAdmin } from "@/server/affiliates";

/** Finance view: every affiliate with referrals, sales generated, total paid. */
export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "leaderboard") {
      return NextResponse.json(ok(await getAffiliateLeaderboard(10)));
    }
    return NextResponse.json(ok(await listAffiliatesAdmin()));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
