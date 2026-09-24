import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireCustomer } from "@/server/auth/guard";
import { db } from "@/server/db";
import type { Address } from "@/lib/order-types";

const optional = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().max(200).optional(),
);

const bodySchema = z.object({
  label: optional,
  recipientName: optional,
  phone: optional,
  fullAddress: z.string().trim().min(3).max(500),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  country: z.string().trim().min(1).max(100).default("Nigeria"),
  landmark: optional,
  isDefault: z.boolean().default(false),
});

type AddressRow = {
  id: string;
  label: string | null;
  recipient_name: string | null;
  phone: string | null;
  full_address: string;
  city: string;
  state: string;
  country: string;
  landmark: string | null;
  is_default: boolean;
};

function toAddress(row: AddressRow): Address {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    fullAddress: row.full_address,
    city: row.city,
    state: row.state,
    country: row.country,
    landmark: row.landmark,
    isDefault: row.is_default,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const sql = db();
    const rows = await sql<AddressRow[]>`
      SELECT id, label, recipient_name, phone, full_address, city, state, country, landmark, is_default
      FROM addresses
      WHERE user_id = ${user.id}
      ORDER BY is_default DESC, created_at ASC
    `;
    return NextResponse.json(ok(rows.map(toAddress)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid address.", parsed.error.flatten().fieldErrors);
    }

    const { label, recipientName, phone, fullAddress, city, state, country, landmark, isDefault } = parsed.data;
    const sql = db();

    const created = await sql.begin(async (tx) => {
      if (isDefault) {
        await tx`UPDATE addresses SET is_default = FALSE WHERE user_id = ${user.id}`;
      }
      const rows = await tx<AddressRow[]>`
        INSERT INTO addresses (user_id, label, recipient_name, phone, full_address, city, state, country, landmark, is_default)
        VALUES (
          ${user.id}, ${label ?? null}, ${recipientName ?? null}, ${phone ?? null},
          ${fullAddress}, ${city}, ${state}, ${country}, ${landmark ?? null}, ${isDefault}
        )
        RETURNING id, label, recipient_name, phone, full_address, city, state, country, landmark, is_default
      `;
      return rows[0];
    });

    return NextResponse.json(ok(toAddress(created), { status: 201 }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}