import postgres from "postgres";
import { getEnv } from "./env";

let sql: postgres.Sql | undefined;

/**
 * Lazy singleton for the PostgreSQL connection pool. The client is only created
 * on first use so `next build` never tries to connect without a database.
 */
export function db(): postgres.Sql {
  if (sql) return sql;

  const { databaseUrl } = getEnv();

  sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: "require",
    prepare: false,
  });

  return sql;
}

export type Db = postgres.Sql;

export async function disconnectDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
  }
}