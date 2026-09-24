import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSuperAdmin } from "@/server/auth/guard";
import { auditLog } from "@/server/admin";
import { db } from "@/server/db";

const KNOWN_KEYS = ["payment_config", "subscription_config", "country_config", "delivery_config", "commission_config", "pricing_config"] as const;
type KnownKey = (typeof KNOWN_KEYS)[number];

const updateSchema = z.object({
  key: z.enum(KNOWN_KEYS),
  value: z.record(z.string(), z.unknown()),
});

function validateValue(key: KnownKey, value: Record<string, unknown>): void {
  if (key === "commission_config") {
    const rate = value.default_rate ?? value.defaultRate;
    if (rate !== undefined && (typeof rate !== "number" || rate < 0 || rate > 100)) {
      throw ApiError.validation("Commission default_rate must be between 0 and 100.");
    }
  }
  if (key === "delivery_config") {
    for (const field of ["base_fee", "per_km", "baseFee", "perKm"]) {
      const amount = value[field];
      if (amount !== undefined && (typeof amount !== "number" || amount < 0)) {
        throw ApiError.validation(`Delivery ${field} must be zero or more.`);
      }
    }
  }
  if (key === "pricing_config") {
    const feeType = value.service_fee_type ?? value.serviceFeeType;
    if (feeType !== undefined && feeType !== "PERCENT" && feeType !== "FLAT") {
      throw ApiError.validation("Pricing service_fee_type must be PERCENT or FLAT.");
    }
    const feeValue = value.service_fee_value ?? value.serviceFeeValue;
    if (feeValue !== undefined && (typeof feeValue !== "number" || feeValue < 0)) {
      throw ApiError.validation("Pricing service_fee_value must be zero or more.");
    }
    const taxRate = value.tax_rate_percent ?? value.taxRatePercent;
    if (taxRate !== undefined && (typeof taxRate !== "number" || taxRate < 0 || taxRate > 100)) {
      throw ApiError.validation("Pricing tax_rate_percent must be between 0 and 100.");
    }
  }
  if (key === "country_config" && value.currency !== undefined && typeof value.currency !== "string") {
    throw ApiError.validation("Country currency must be a string.");
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const rows = await db()<{
      key: string;
      value: unknown;
      updated_at: Date;
    }[]>`SELECT key, value, updated_at FROM platform_settings ORDER BY key ASC`;
    return NextResponse.json(
      ok(
        rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updated_at })),
        { knownKeys: KNOWN_KEYS },
      ),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireSuperAdmin(request);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    validateValue(parsed.data.key, parsed.data.value as Record<string, unknown>);

    const rows = await db()<{
      key: string;
      value: unknown;
      updated_at: Date;
    }[]>`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES (${parsed.data.key}, ${JSON.stringify(parsed.data.value)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      RETURNING key, value, updated_at
    `;

    await auditLog({
      userId: admin.id,
      action: "settings.update",
      entityType: "platform_settings",
      entityId: parsed.data.key,
      meta: { key: parsed.data.key },
    });

    return NextResponse.json(
      ok({ key: rows[0]?.key, value: rows[0]?.value, updatedAt: rows[0]?.updated_at }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
