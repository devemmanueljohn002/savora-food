import { db } from "./db";

/**
 * Admin vendor-moderation audit trail (`admin_actions`, migration 019).
 * A row is written on EVERY approve / reject / suspend / reactivate /
 * manual-override action and shown on the vendor detail page.
 */

export type AdminActionKind = "APPROVED" | "REJECTED" | "SUSPENDED" | "REACTIVATED" | "OVERRIDDEN";

export type AdminAction = {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  vendorId: string;
  action: AdminActionKind;
  reason: string | null;
  createdAt: Date;
};

export async function recordAdminAction(input: {
  adminId: string | null;
  vendorId: string;
  action: AdminActionKind;
  reason?: string | null;
}): Promise<void> {
  await db()`
    INSERT INTO admin_actions (admin_id, vendor_id, action, reason)
    VALUES (${input.adminId}, ${input.vendorId}, ${input.action}, ${input.reason?.trim() ? input.reason.trim() : null})
  `;
}

export async function listAdminActionsForVendor(vendorId: string): Promise<AdminAction[]> {
  const rows = await db()<{
    id: string;
    admin_id: string | null;
    admin_email: string | null;
    vendor_id: string;
    action: string;
    reason: string | null;
    created_at: Date;
  }[]>`
    SELECT a.id, a.admin_id, u.email AS admin_email, a.vendor_id, a.action, a.reason, a.created_at
    FROM admin_actions a
    LEFT JOIN users u ON u.id = a.admin_id
    WHERE a.vendor_id = ${vendorId}
    ORDER BY a.created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminEmail: row.admin_email,
    vendorId: row.vendor_id,
    action: row.action as AdminActionKind,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
