import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireVendor } from "@/server/auth/guard";
import { getVendorByUserId, updateVendorProfile } from "@/server/auth/store";

const onboardingSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required").max(150),
  ownerName: z.string().trim().min(1, "Owner name is required").max(150).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number")
    .optional()
    .nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
});

function toVendorDto(row: {
  id: string;
  business_name: string;
  slug: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  banner_image_url: string | null;
  status: string;
}) {
  return {
    id: row.id,
    businessName: row.business_name,
    slug: row.slug,
    ownerName: row.owner_name,
    phone: row.phone,
    email: row.email,
    description: row.description,
    address: row.address,
    city: row.city,
    state: row.state,
    logoUrl: row.logo_url,
    bannerImageUrl: row.banner_image_url,
    status: row.status,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const vendor = await getVendorByUserId(session.id);
    if (!vendor) {
      throw ApiError.notFound("No vendor profile found for this account.");
    }
    return NextResponse.json(ok(toVendorDto(vendor)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireVendor(request);
    const body = await request.json().catch(() => null);
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const vendor = await updateVendorProfile(session.id, {
      businessName: parsed.data.businessName,
      ...(parsed.data.ownerName !== undefined ? { ownerName: parsed.data.ownerName } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone ?? undefined } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description ?? undefined } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address ?? undefined } : {}),
      ...(parsed.data.city !== undefined ? { city: parsed.data.city ?? undefined } : {}),
      ...(parsed.data.state !== undefined ? { state: parsed.data.state ?? undefined } : {}),
    });
    if (!vendor) {
      throw ApiError.notFound("No vendor profile found for this account.");
    }
    return NextResponse.json(ok(toVendorDto(vendor)));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
