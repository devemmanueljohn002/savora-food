import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { hashPassword } from "../src/server/auth/password";

// Local dev reads .env.local first, then .env. Production injects real values
// directly into the environment, which takes precedence.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/**
 * Idempotent admin seed.
 *
 * Creates (or repairs) a single ADMIN account from ADMIN_EMAIL / ADMIN_PASSWORD.
 * Safe to run repeatedly and against an existing database — the upsert always
 * converges on the env-provided identity and NEVER touches other users.
 *
 * The password is hashed with hashPassword() — the exact same scrypt routine
 * used by normal registration (src/server/auth/password.ts), so the account
 * logs in through the standard /api/auth/login flow.
 *
 * The password (and its hash) are never printed; only the email is shown.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("✗ DATABASE_URL is not set. Provide it via environment or .env.local");
    process.exit(1);
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email) {
    console.error("✗ ADMIN_EMAIL is not set.");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("✗ ADMIN_PASSWORD is not set (or shorter than 8 characters).");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 5, ssl: "require", onnotice: () => {} });

  try {
    const passwordHash = await hashPassword(password);

    // (xmax = 0) is true only for rows created by this INSERT, letting us
    // report created vs. updated without a second query.
    const rows = await sql<{ id: string; email: string; role: string; status: string; created: boolean }[]>`
      INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
      VALUES (${email}, ${passwordHash}, 'Savora', 'Admin', 'ADMIN', 'ACTIVE', NOW())
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = 'ADMIN',
        status = 'ACTIVE',
        email_verified_at = COALESCE(users.email_verified_at, NOW()),
        updated_at = NOW()
      RETURNING id, email, role, status, (xmax = 0) AS created
    `;

    const admin = rows[0];
    if (!admin) {
      console.error("✗ Admin upsert returned no row.");
      process.exit(1);
    }

    console.log(`✓ Admin ${admin.created ? "created" : "updated"}:`);
    console.log(`    email:  ${admin.email}`);
    console.log(`    role:   ${admin.role}`);
    console.log(`    status: ${admin.status}`);
    console.log("    password: <hashed from ADMIN_PASSWORD — not printed>");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("Admin seed failed:", error);
  process.exit(1);
});
