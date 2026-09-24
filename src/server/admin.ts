import type { NextRequest } from "next/server";
import { requireAdmin } from "./auth/guard";
import { db } from "./db";

export async function requireAdminUser(request: NextRequest) {
  return requireAdmin(request);
}

export async function auditLog(input: {
  userId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  // Round-trip through JSON so the payload satisfies sql.json's JSONValue type.
  const payload = JSON.parse(JSON.stringify(input.meta ?? {}));
  await db()`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, meta)
    VALUES (
      ${input.userId}, ${input.action}, ${input.entityType ?? null}, ${input.entityId ?? null},
      ${db().json(payload)}
    )
  `;
}

export function paging(url: URL, fallbackLimit = 20) {
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("limit")) || fallbackLimit, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
