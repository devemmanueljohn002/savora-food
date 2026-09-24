import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "server", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("✗ DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: "require",
    onnotice: () => {},
  });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("No migrations found.");
      return;
    }

    const appliedRows = await sql<{ name: string }[]>`SELECT name FROM schema_migrations`;
    const applied = new Set(appliedRows.map((row) => row.name));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`· ${file} (already applied)`);
        continue;
      }

      console.log(`▸ ${file}`);
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });

      console.log(`  ✓ applied`);
    }

    console.log("Migration complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});