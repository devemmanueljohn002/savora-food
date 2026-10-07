import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { auditLog, requireAdminUser } from "@/server/admin";
import { listAdminActionsForVendor, recordAdminAction, type AdminActionKind } from "@/server/admin-actions";
import { notifyUser } from "@/server/vendors";
import { db } from "@/server/db";
import { requireS3Config } from "@/server/storage/s3";
import { getVendorPhotoKey, viewUrlFor } from "@/server/storage/photos";
import { getVerificationForVendor } from "@/server/vendor-verifications";
import { sendVendorStatusEmail, type VendorStatusKind } from "@/server/email/vendor-status-emails";

/**
 * Admin vendor detail + moderation actions (server-guarded: ADMIN role only).
 *
 * Actions: approve | reject (reason required) | suspend (reason required) |
 * reactivate (reason required) | override (reason required, only when the
 * Dojah check failed). Every action writes an `admin_actions` row, updates
 * vendor status, and emails the vendor via the existing Brevo setup.
 * Legacy { status, commissionRate, isFeatured } updates are still accepted
 * for the commission/featured controls.
 */

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "reactivate", "override"]),
  reason: z.string().trim().max(1000).optional(),
});

const legacySchema = z.object({
  status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  isFeatured: z.boolean().optional(),
});

const ACTION_TO_STATUS: Record<string, string> = {
  approve: "APPROVED",
  reject: "REJECTED",
  suspend: "SUSPENDED",
  reactivate: "APPROVED",
  override: "APPROVED",
};

const ACTION_TO_AUDIT: Record<string, AdminActionKind> = {
  approve: "APPROVED",
  reject: "REJECTED",
  suspend: "SUSPENDED",
  reactivate: "REACTIVATED",
  override: "OVERRIDDEN",
};

const ACTION_TO_EMAIL: Record<string, VendorStatusKind> = {
  approve: "APPROVED",
  reject: "REJECTED",
  suspend: "SUSPENDED",
  reactivate: "REACTIVATED",
  override: "OVERRIDDEN",
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser(request);
    const { id } = await ctx.params;
    const rows = await db()<{
      id: string;
      user_id: string;
      business_name: string;
      slug: string;
      owner_name: string | null;
      email: string | null;
      phone: string | null;
      description: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      status: string;
      status_reason: string | null;
      commission_rate: string;
      rating_average: string;
      rating_count: number;
      is_featured: boolean;
      created_at: Date;
      user_email: string;
    }[]>`
      SELECT v.id, v.user_id, v.business_name, v.slug, v.owner_name, v.email, v.phone,
             v.description, v.address, v.city, v.state, v.status, v.status_reason,
             v.commission_rate, v.rating_average, v.rating_count, v.is_featured, v.created_at,
             u.email AS user_email
      FROM vendors v JOIN users u ON u.id = v.user_id
      WHERE v.id = ${id} LIMIT 1
    `;
    const vendor = rows[0];
    if (!vendor) throw ApiError.notFound("Vendor not found.");

    const documents = await db()<{
      id: string;
      kind: string;
      url: string;
      status: string;
      created_at: Date;
    }[]>`
      SELECT id, kind, url, status, created_at FROM vendor_documents
      WHERE vendor_id = ${id} ORDER BY created_at DESC
    `;

    // Live Dojah result (stored verification record; NOT_SUBMITTED when absent).
    const verification = await getVerificationForVendor(id);

    // Real S3 profile photo: short-lived presigned URL, null when none.
    let photoUrl: string | null = null;
    let photoExpiresAt: string | null = null;
    try {
      const key = await getVendorPhotoKey(id);
      if (key) {
        const view = viewUrlFor(requireS3Config(), key);
        photoUrl = view.url;
        photoExpiresAt = view.expiresAt;
      }
    } catch {
      photoUrl = null;
    }

    const history = await listAdminActionsForVendor(id);

    return NextResponse.json(
      ok({
        id: vendor.id,
        businessName: vendor.business_name,
        slug: vendor.slug,
        ownerName: vendor.owner_name,
        email: vendor.email ?? vendor.user_email,
        userEmail: vendor.user_email,
        phone: vendor.phone,
        description: vendor.description,
        address: vendor.address,
        city: vendor.city,
        state: vendor.state,
        status: vendor.status,
        statusReason: vendor.status_reason,
        commissionRate: Number(vendor.commission_rate),
        ratingAverage: Number(vendor.rating_average),
        ratingCount: vendor.rating_count,
        isFeatured: vendor.is_featured,
        createdAt: vendor.created_at,
        photoUrl,
        photoExpiresAt,
        verification: {
          method: verification.method,
          status: verification.status,
          failureReason: verification.failureReason,
          dojahReference: verification.dojahReference,
          verifiedAt: verification.verifiedAt,
        },
        documents: documents.map((doc) => ({
          id: doc.id,
          kind: doc.kind,
          url: doc.url,
          status: doc.status,
          createdAt: doc.created_at,
        })),
        history: history.map((entry) => ({
          id: entry.id,
          adminEmail: entry.adminEmail,
          action: entry.action,
          reason: entry.reason,
          createdAt: entry.createdAt,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser(request);
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);

    const sql = db();
    // NOTE: user_email selected for the notification email below.
    const vendorRows = await sql<{
      id: string;
      user_id: string;
      business_name: string;
      owner_name: string | null;
      email: string | null;
      status: string;
      user_email: string;
    }[]>`
      SELECT v.id, v.user_id, v.business_name, v.owner_name, v.email, v.status,
             u.email AS user_email
      FROM vendors v JOIN users u ON u.id = v.user_id
      WHERE v.id = ${id} LIMIT 1
    `;
    const vendor = vendorRows[0];    if (!vendor) throw ApiError.notFound("Vendor not found.");

    // ── Moderation action flow ──────────────────────────────────────────
    const actionParsed = actionSchema.safeParse(body);
    if (actionParsed.success && body && typeof body.action === "string") {
      const { action, reason } = actionParsed.data;
      const trimmedReason = reason?.trim() ?? "";

      if (["reject", "suspend", "reactivate", "override"].includes(action) && !trimmedReason) {
        throw ApiError.validation("A reason is required for this action.");
      }

      if (action === "reactivate" && vendor.status !== "SUSPENDED") {
        throw ApiError.validation("Only a suspended kitchen can be reactivated.");
      }

      if (action === "override") {
        const verification = await getVerificationForVendor(id);
        if (verification.status !== "FAILED") {
          throw ApiError.validation("Manual override is only available when the Dojah check failed.");
        }
      }

      const nextStatus = ACTION_TO_STATUS[action];
      const auditAction = ACTION_TO_AUDIT[action];

      await sql`
        UPDATE vendors
        SET status = ${nextStatus},
            status_reason = ${trimmedReason ? trimmedReason : null},
            status_updated_at = NOW(),
            updated_at = NOW()
        WHERE id = ${id}
      `;

      await recordAdminAction({
        adminId: admin.id,
        vendorId: id,
        action: auditAction,
        reason: trimmedReason || null,
      });

      await auditLog({
        userId: admin.id,
        action: `vendor.${action}`,
        entityType: "vendor",
        entityId: id,
        meta: { from: vendor.status, to: nextStatus, reason: trimmedReason || null },
      });

      await notifyUser({
        userId: vendor.user_id,
        type: "VENDOR",
        title: `Kitchen ${auditAction.toLowerCase()}`,
        body:
          action === "approve"
            ? `Good news — ${vendor.business_name} is approved and now live on Savora Food.`
            : action === "override"
              ? `${vendor.business_name} was manually reviewed and approved by our team.`
              : action === "reactivate"
                ? `${vendor.business_name} is live again.`
                : action === "suspend"
                  ? `${vendor.business_name} has been suspended. Contact support.`
                  : `Your kitchen application for ${vendor.business_name} was not approved. Contact support for details.`,
        data: { vendorId: id, status: nextStatus },
      });

      // Email via the existing Brevo setup (fire-and-forget inside helper).
      const recipient = vendor.email ?? vendor.user_email;
      if (recipient) {
        await sendVendorStatusEmail(recipient, ACTION_TO_EMAIL[action], {
          businessName: vendor.business_name,
          ownerName: vendor.owner_name,
          reason: trimmedReason || null,
        });
      }

      return NextResponse.json(ok({ updated: true, id, status: nextStatus }));
    }

    // ── Legacy update flow (commission / featured / status) ────────────
    const parsed = legacySchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }
    if (Object.keys(parsed.data).length === 0) {
      throw ApiError.validation("Nothing to update.");
    }

    const d = parsed.data;
    const rows = await sql<{ id: string; status: string }[]>`
      UPDATE vendors SET
        status = COALESCE(${d.status ?? null}, status),
        commission_rate = COALESCE(${d.commissionRate ?? null}, commission_rate),
        is_featured = COALESCE(${d.isFeatured ?? null}, is_featured),
        status_updated_at = CASE WHEN ${d.status ?? null} IS NOT NULL THEN NOW() ELSE status_updated_at END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, status
    `;

    if (d.status && d.status !== vendor.status) {
      const messages: Record<string, string> = {
        APPROVED: `Good news — ${vendor.business_name} is approved and now live on Savora Food.`,
        REJECTED: `Your kitchen application for ${vendor.business_name} was not approved. Contact support for details.`,
        SUSPENDED: `Your kitchen ${vendor.business_name} has been suspended. Contact support.`,
        UNDER_REVIEW: `${vendor.business_name} is now under review.`,
      };
      if (messages[d.status]) {
        await notifyUser({
          userId: vendor.user_id,
          type: "VENDOR",
          title: `Kitchen ${d.status.toLowerCase().replaceAll("_", " ")}`,
          body: messages[d.status],
          data: { vendorId: id, status: d.status },
        });
      }
    }

    await auditLog({
      userId: admin.id,
      action: "vendor.update",
      entityType: "vendor",
      entityId: id,
      meta: { from: vendor.status, to: rows[0]?.status, ...parsed.data },
    });

    return NextResponse.json(ok({ updated: true, id, status: rows[0]?.status }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
