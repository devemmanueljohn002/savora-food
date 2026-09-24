import { NextResponse, type NextRequest } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { getConsumerOverview } from "@/server/orders";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const overview = await getConsumerOverview(session.id);
    return NextResponse.json(ok(overview));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
