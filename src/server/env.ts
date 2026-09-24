type Env = {
  databaseUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  appUrl: string;
  apiUrl: string;
  paystackSecretKey?: string;
  paystackPublicKey?: string;
  resendApiKey?: string;
  brevoApiKey?: string;
  emailFrom?: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  adminSeedEmail?: string;
  adminSeedPassword?: string;
};

let cached: Env | undefined;

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads validated environment configuration. Throws when required values are
 * missing — only called lazily at request/script time, never at import time, so
 * `next build` can analyze modules without a configured database.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();

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
    appUrl: process.env.APP_URL?.trim() || "http://localhost:3000",
    apiUrl: process.env.API_URL?.trim() || "/api",
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY?.trim() || undefined,
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY?.trim() || undefined,
    resendApiKey: process.env.RESEND_API_KEY?.trim() || undefined,
    brevoApiKey: process.env.BREVO_API_KEY?.trim() || undefined,
    emailFrom: process.env.EMAIL_FROM?.trim() || undefined,
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || undefined,
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY?.trim() || undefined,
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || undefined,
    adminSeedEmail: process.env.ADMIN_SEED_EMAIL?.trim() || "admin@savora.food",
    adminSeedPassword: process.env.ADMIN_SEED_PASSWORD?.trim() || undefined,
  };

  return cached;
}