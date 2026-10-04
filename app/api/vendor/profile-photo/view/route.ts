import { NextResponse, type NextRequest } from "next/server";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireSession, ROLES } from "@/server/auth/guard";
import { getVendorByUserId } from "@/server/auth/store";
import { getRiderByUserId } from "@/server/riders";
import { db } from "@/server/db";
import { requireS3Config } from "@/server/storage/s3";
import { canViewPhoto, getVendorPhotoKey, viewUrlFor } from "@/server/storage/photos";

export const runtime = "nodejs";

/**
 * Short-lived view URL for a vendor profile photo. The requester is
 * authorized server-side FIRST; only then is a presigned GET minted.
 *
 * - vendor role → own photo only (params ignored)
 * - admin role → ?vendorId= required (role itself authorizes the lookup)
 * - rider role → ?orderId= required; allowed only when assigned to that
 *   order, the order belongs to the target vendor, and both are active
 * - everyone else → 403, and no URL is generated
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const url = new URL(request.url);
    const role = session.role as string;

    let targetVendorId: string | null = null;

    if (role === ROLES.VENDOR) {
      const vendor = await getVendorByUserId(session.id);
      if (!vendor) throw ApiError.notFound("No vendor profile found for this account.");
      targetVendorId = vendor.id;
      if (!canViewPhoto({ role: "VENDOR", vendorId: vendor.id }, targetVendorId)) {
        throw ApiError.forbidden("You do not have access to this photo.");
      }
    } else if (role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) {
      const vendorId = url.searchParams.get("vendorId")?.trim() ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(vendorId)) {
        throw ApiError.validation("Select a vendor to view.");
      }
      if (!canViewPhoto({ role: "ADMIN" }, vendorId)) {
        throw ApiError.forbidden("You do not have access to this photo.");
      }
      targetVendorId = vendorId;
    } else if (role === ROLES.DELIVERY_PARTNER) {
      const rider = await getRiderByUserId(session.id);
      if (!rider) throw ApiError.notFound("No rider profile found for this account.");
      const orderId = url.searchParams.get("orderId")?.trim() ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
        throw ApiError.validation("Select an order to view.");
      }
      // Server-side proof: assigned to this order, order belongs to the
      // vendor, and both order and delivery are still active.
      const rows = await db<{
        vendor_id: string;
      }[]>`
        SELECT o.vendor_id::text AS vendor_id
        FROM deliveries d
        JOIN orders o ON o.id = d.order_id
        WHERE d.order_id = ${orderId}
          AND d.delivery_partner_id = ${rider.id}
          AND o.vendor_id IS NOT NULL
          AND o.status NOT IN ('DELIVERED', 'CANCELLED', 'REFUNDED')
          AND d.status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED')
        LIMIT 1
      `;
      const assignment = rows[0];
      if (
        !assignment ||
        !canViewPhoto(
          {
            role: "RIDER",
            riderId: rider.id,
            order: { vendorId: assignment.vendor_id, assigned: true, active: true },
          },
          assignment.vendor_id,
        )
      ) {
        throw ApiError.forbidden("You do not have access to this photo.");
      }
      targetVendorId = assignment.vendor_id;
    } else {
      throw ApiError.forbidden("You do not have access to this photo.");
    }

    const key = await getVendorPhotoKey(targetVendorId as string);
    if (!key) throw ApiError.notFound("This vendor has no profile photo.");
    const config = requireS3Config();
    const view = viewUrlFor(config, key);
    return NextResponse.json(ok({ url: view.url, expiresAt: view.expiresAt }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Profile photo storage is not configured")) {
      const { envelope } = toEnvelope(ApiError.internal("Profile photos are not available right now."));
      return NextResponse.json(envelope, { status: 503 });
    }
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
