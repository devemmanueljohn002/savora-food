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
  fullAddress: z.string().trim().min(3).max(500).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  state: z.string().trim().min(1).max(100).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  landmark: optional,
  isDefault: z.boolean().optional(),
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

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Invalid address.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const sql = db();
    const updated = await sql.begin(async (tx) => {
      const existing = await tx<AddressRow[]>`SELECT * FROM addresses WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`;
      if (!existing[0]) return undefined;
      if (parsed.data.isDefault) {
        await tx`UPDATE addresses SET is_default = FALSE WHERE user_id = ${user.id}`;
      }
      const rows = await tx<AddressRow[]>`SELECT * FROM addresses WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`;
      const current = rows[0];
      const merged = {
        label: parsed.data.label !== undefined ? (parsed.data.label ?? null) : current.label,
        recipientName: parsed.data.recipientName !== undefined ? (parsed.data.recipientName ?? null) : current.recipient_name,
        phone: parsed.data.phone !== undefined ? (parsed.data.phone ?? null) : current.phone,
        fullAddress: parsed.data.fullAddress ?? current.full_address,
        city: parsed.data.city ?? current.city,
        state: parsed.data.state ?? current.state,
        country: parsed.data.country ?? current.country,
        landmark: parsed.data.landmark !== undefined ? (parsed.data.landmark ?? null) : current.landmark,
        isDefault: parsed.data.isDefault ?? current.is_default,
      };
      const next = await tx<AddressRow[]>`
        UPDATE addresses
        SET label = ${merged.label}, recipient_name = ${merged.recipientName}, phone = ${merged.phone},
            full_address = ${merged.fullAddress}, city = ${merged.city}, state = ${merged.state},
            country = ${merged.country}, landmark = ${merged.landmark}, is_default = ${merged.isDefault}
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, label, recipient_name, phone, full_address, city, state, country, landmark, is_default
      `;
      return next[0];
    });

    if (!updated) throw ApiError.notFound("Address not found.");
    return NextResponse.json(ok(toAddress(updated)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCustomer(request);
    const { id } = await ctx.params;
    const sql = db();
    const rows = await sql<{ id: string }[]>`DELETE FROM addresses WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;
    if (!rows[0]) throw ApiError.notFound("Address not found.");
    return NextResponse.json(ok({ removed: true }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
