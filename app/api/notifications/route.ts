import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession } from "@/server/auth/guard";
import { db } from "@/server/db";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  read_at: Date | null;
  created_at: Date;
};

const markSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(100).optional(),
    allRead: z.boolean().optional(),
  })
  .refine((value) => (value.ids && value.ids.length > 0) || value.allRead, {
    message: "Provide notification ids or allRead.",
  });

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
    const sql = db();

    const rows = await sql<NotificationRow[]>`
      SELECT id, type, title, body, data, read_at, created_at
      FROM notifications
      WHERE user_id = ${user.id} ${unreadOnly ? sql`AND read_at IS NULL` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    const unread = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = ${user.id} AND read_at IS NULL
    `;

    return NextResponse.json(
      ok(
        rows.map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          body: row.body,
          data: row.data,
          readAt: row.read_at,
          createdAt: row.created_at,
        })),
        { unreadCount: Number(unread[0]?.count ?? 0) },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const parsed = markSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    if (parsed.data.allRead) {
      await sql`UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = ${user.id}`;
    } else {
      await sql`
        UPDATE notifications SET read_at = COALESCE(read_at, NOW())
        WHERE user_id = ${user.id} AND id = ANY(${parsed.data.ids ?? []}::uuid[])
      `;
    }
    return NextResponse.json(ok({ markedRead: true }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
