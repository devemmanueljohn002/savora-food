import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorByUserId, updateVendorProfile } from "@/server/auth/store";
import { db } from "@/server/db";

const profileSchema = z.object({
  businessName: z.string().trim().min(2).max(150).optional(),
  ownerName: z.string().trim().min(1).max(150).optional(),
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number").optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  bannerImageUrl: z.string().trim().max(500).optional().nullable(),
  bankName: z.string().trim().max(150).optional().nullable(),
  bankAccountName: z.string().trim().max(150).optional().nullable(),
  bankAccountNumber: z.string().trim().max(50).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorByUserId(session.id);
    if (!vendor) throw ApiError.notFound("No vendor profile found for this account.");
    return NextResponse.json(
      ok({
        id: vendor.id,
        businessName: vendor.business_name,
        slug: vendor.slug,
        ownerName: vendor.owner_name,
        phone: vendor.phone,
        email: vendor.email,
        description: vendor.description,
        address: vendor.address,
        city: vendor.city,
        state: vendor.state,
        logoUrl: vendor.logo_url,
        bannerImageUrl: vendor.banner_image_url,
        bankName: vendor.bank_name,
        bankAccountName: vendor.bank_account_name,
        bankAccountNumber: vendor.bank_account_number,
        status: vendor.status,
        commissionRate: vendor.commission_rate === null ? null : Number(vendor.commission_rate),
        ratingAverage: Number(vendor.rating_average ?? 0),
        ratingCount: vendor.rating_count ?? 0,
        isFeatured: vendor.is_featured ?? false,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const parsed = profileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const vendor = await updateVendorProfile(session.id, {
      ...(parsed.data.businessName !== undefined ? { businessName: parsed.data.businessName } : {}),
      ...(parsed.data.ownerName !== undefined ? { ownerName: parsed.data.ownerName } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone ?? undefined } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description ?? undefined } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address ?? undefined } : {}),
      ...(parsed.data.city !== undefined ? { city: parsed.data.city ?? undefined } : {}),
      ...(parsed.data.state !== undefined ? { state: parsed.data.state ?? undefined } : {}),
    });
    if (!vendor) throw ApiError.notFound("No vendor profile found for this account.");

    // Bank + branding fields live outside the shared onboarding updater.
    const d = parsed.data;
    const rows = await db()<{
      logo_url: string | null;
      banner_image_url: string | null;
      bank_name: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
    }[]>`
      UPDATE vendors SET
        logo_url = ${d.logoUrl === undefined ? vendor.logo_url : d.logoUrl},
        banner_image_url = ${d.bannerImageUrl === undefined ? vendor.banner_image_url : d.bannerImageUrl},
        bank_name = ${d.bankName === undefined ? vendor.bank_name : d.bankName},
        bank_account_name = ${d.bankAccountName === undefined ? vendor.bank_account_name : d.bankAccountName},
        bank_account_number = ${d.bankAccountNumber === undefined ? vendor.bank_account_number : d.bankAccountNumber},
        updated_at = NOW()
      WHERE id = ${vendor.id}
      RETURNING logo_url, banner_image_url, bank_name, bank_account_name, bank_account_number
    `;

    return NextResponse.json(
      ok({
        id: vendor.id,
        businessName: vendor.business_name,
        slug: vendor.slug,
        ownerName: vendor.owner_name,
        phone: vendor.phone,
        email: vendor.email,
        description: vendor.description,
        address: vendor.address,
        city: vendor.city,
        state: vendor.state,
        logoUrl: rows[0]?.logo_url ?? null,
        bannerImageUrl: rows[0]?.banner_image_url ?? null,
        bankName: rows[0]?.bank_name ?? null,
        bankAccountName: rows[0]?.bank_account_name ?? null,
        bankAccountNumber: rows[0]?.bank_account_number ?? null,
        status: vendor.status,
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
