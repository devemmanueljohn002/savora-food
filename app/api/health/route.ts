import { NextResponse } from "next/server";

/**
 * Liveness check for Vercel / uptime monitors. Deliberately avoids touching
 * the database or reading required secrets so it stays green during builds
 * and when env is partially configured. The `env` flags report PRESENCE
 * only (never values) so a fresh Vercel project with missing variables is
 * diagnosable from the response alone — compare against .env.example.
 */
export async function GET() {
  const appUrl = process.env.APP_URL?.trim() ?? "";
  return NextResponse.json(
    {
      success: true,
      data: {
        ok: true,
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
        region: process.env.VERCEL_REGION ?? "local",
        env: {
          database: Boolean(process.env.DATABASE_URL?.trim()),
          jwt: Boolean(process.env.JWT_SECRET?.trim() || process.env.AUTH_SECRET?.trim()),
          appUrl: Boolean(appUrl),
          // APP_URL must be the stable production https origin in prod:
          // email links + the Google redirect URI are built from it.
          appUrlIsHttps: appUrl.startsWith("https://"),
          google: Boolean(
            process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim(),
          ),
          cloudinary: Boolean(
            process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
              process.env.CLOUDINARY_API_KEY?.trim() &&
              process.env.CLOUDINARY_API_SECRET?.trim(),
          ),
          paystack: Boolean(process.env.PAYSTACK_SECRET_KEY?.trim()),
          email: Boolean(
            process.env.BREVO_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim(),
          ),
        },
      },
    },
    { status: 200 },
  );
}
