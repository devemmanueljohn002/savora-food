import { NextResponse, type NextRequest } from "next/server";
import { buildGoogleAuthorizeUrl, sanitizeNext } from "@/server/auth/google";

/** Start "Continue with Google": bounce the browser to Google's consent page. */
export async function GET(request: NextRequest) {
  const next = sanitizeNext(request.nextUrl.searchParams.get("next"));
  try {
    return NextResponse.redirect(buildGoogleAuthorizeUrl(next));
  } catch {
    return NextResponse.redirect(
      new URL("/auth?error=setup", request.url),
    );
  }
}
