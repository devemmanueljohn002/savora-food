import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/**
 * Read-only admin audit. Connects to the database in DATABASE_URL and reports
 * which staff accounts exist. Passwords/hashes are NEVER selected or printed.
 *
 *   npm run db:check:admin        # or: DATABASE_URL=... npx tsx scripts/check-admin.ts
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("✗ DATABASE_URL is not set. Provide it via environment or .env.local");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 5, ssl: "require", onnotice: () => {} });

  try {
    const staff = await sql<{ email: string; role: string; status: string }[]>`
      SELECT email, role, status
      FROM users
      WHERE role IN ('ADMIN', 'SUPER_ADMIN')
      ORDER BY role, email
    `;

    if (staff.length === 0) {
      console.log("No ADMIN or SUPER_ADMIN accounts found.");
      console.log("Seeded default email (if seed.ts is used): admin@savora.food");
      console.log("Create one with: ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run db:seed:admin:env");
      return;
    }

    console.log(`Found ${staff.length} staff account(s):`);
    for (const row of staff) {
      console.log(`  • ${row.email}  [role=${row.role}, status=${row.status}]`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("Admin check failed:", error);
  process.exit(1);
});
