type Env = {
  databaseUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  appUrl: string;
  apiUrl: string;
  /** Public origin override; falls back to appUrl when unset. */
  siteUrl?: string;
  paystackSecretKey?: string;
  paystackPublicKey?: string;
  resendApiKey?: string;
  brevoApiKey?: string;
  emailFrom?: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  /** Private S3 bucket for vendor profile photos (never public). */
  s3Bucket?: string;
  /** Must match the bucket's actual region or signatures fail. */
  s3Region: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  adminSeedEmail?: string;
  adminSeedPassword?: string;
  authGoogleId?: string;
  authGoogleSecret?: string;
};

let cached: Env | undefined;

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Base URL for links sent to users (password reset, email verification,
 * Paystack checkout callback). APP_URL is REQUIRED — a silent localhost
 * fallback is exactly how real users received broken links. Trailing slashes
 * are stripped so built links never contain a double slash.
 */
function resolveAppUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    throw new Error("APP_URL is not set. Set it to the public URL of the frontend (e.g. https://app.savora.food).");
  }
  const appUrl = raw.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production" && appUrl.startsWith("http://")) {
    console.warn("[env] WARNING: APP_URL uses http:// in production. Production APP_URL must be https.");
  }
  return appUrl;
}

/**
 * Reads validated environment configuration. Throws when required values are
 * missing — only called lazily at request/script time, never at import time, so
 * `next build` can analyze modules without a configured database.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  // Canonical session secret is JWT_SECRET; AUTH_SECRET is a legacy alias.
  const jwtSecret = process.env.JWT_SECRET?.trim() || process.env.AUTH_SECRET?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  }
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not set. Add it to .env.local (see .env.example).");
  }

  cached = {
    databaseUrl,
    jwtSecret,
    jwtIssuer: process.env.JWT_ISSUER?.trim() || "savora-food",
    accessTokenTtlMinutes: numberFromEnv(process.env.ACCESS_TOKEN_TTL_MINUTES, 30),
    refreshTokenTtlDays: numberFromEnv(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
    appUrl: resolveAppUrl(),
    apiUrl: process.env.API_URL?.trim() || "/api",
    siteUrl: process.env.SITE_URL?.trim()?.replace(/\/+$/, "") || undefined,
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY?.trim() || undefined,
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY?.trim() || undefined,
    resendApiKey: process.env.RESEND_API_KEY?.trim() || undefined,
    brevoApiKey: process.env.BREVO_API_KEY?.trim() || undefined,
    emailFrom: process.env.EMAIL_FROM?.trim() || undefined,
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || undefined,
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY?.trim() || undefined,
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || undefined,
    s3Bucket: process.env.S3_BUCKET?.trim() || undefined,
    s3Region: process.env.S3_REGION?.trim() || "us-east-1",
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || undefined,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || undefined,
    adminSeedEmail: process.env.ADMIN_SEED_EMAIL?.trim() || "admin@savora.food",
    adminSeedPassword: process.env.ADMIN_SEED_PASSWORD?.trim() || undefined,
    authGoogleId: process.env.AUTH_GOOGLE_ID?.trim() || undefined,
    authGoogleSecret: process.env.AUTH_GOOGLE_SECRET?.trim() || undefined,
  };

  return cached;
}