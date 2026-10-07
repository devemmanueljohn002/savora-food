import { db } from "./db";

/**
 * Dojah BVN/NIN verification results for the admin vendor approval queue.
 * One row per vendor in `vendor_verifications` (migration 019); vendors
 * without a row have not submitted anything.
 */

export type VerificationMethod = "BVN" | "NIN";

export type VerificationStatus = "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "FAILED";

export type VendorVerification = {
  vendorId: string;
  method: VerificationMethod;
  status: VerificationStatus;
  failureReason: string | null;
  dojahReference: string | null;
  verifiedAt: Date | null;
  updatedAt: Date;
};

type VerificationRow = {
  vendor_id: string;
  method: string;
  status: string;
  failure_reason: string | null;
  dojah_reference: string | null;
  verified_at: Date | null;
  updated_at: Date;
};

function mapRow(row: VerificationRow): VendorVerification {
  return {
    vendorId: row.vendor_id,
    method: row.method === "NIN" ? "NIN" : "BVN",
    status:
      row.status === "VERIFIED" || row.status === "FAILED" || row.status === "PENDING"
        ? row.status
        : "NOT_SUBMITTED",
    failureReason: row.failure_reason,
    dojahReference: row.dojah_reference,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at,
  };
}

export function emptyVerification(vendorId: string): VendorVerification {
  return {
    vendorId,
    method: "BVN",
    status: "NOT_SUBMITTED",
    failureReason: null,
    dojahReference: null,
    verifiedAt: null,
    updatedAt: new Date(0),
  };
}

export async function getVerificationForVendor(vendorId: string): Promise<VendorVerification> {
  const rows = await db()<VerificationRow[]>`
    SELECT vendor_id, method, status, failure_reason, dojah_reference, verified_at, updated_at
    FROM vendor_verifications WHERE vendor_id = ${vendorId} LIMIT 1
  `;
  return rows[0] ? mapRow(rows[0]) : emptyVerification(vendorId);
}

/** Batch lookup for list views. Vendors without a row map to NOT_SUBMITTED. */
export async function getVerificationsForVendorIds(
  vendorIds: string[],
): Promise<Map<string, VendorVerification>> {
  const result = new Map<string, VendorVerification>();
  for (const id of vendorIds) result.set(id, emptyVerification(id));
  if (vendorIds.length === 0) return result;
  const rows = await db()<VerificationRow[]>`
    SELECT vendor_id, method, status, failure_reason, dojah_reference, verified_at, updated_at
    FROM vendor_verifications WHERE vendor_id = ANY(${vendorIds})
  `;
  for (const row of rows) result.set(row.vendor_id, mapRow(row));
  return result;
}

/**
 * Records a Dojah check result (called by the verification webhook/callback,
 * or backfilled by support tooling). Never called from the admin UI: the
 * admin queue only READS these rows and may override a FAILED check.
 */
export async function recordVerificationResult(input: {
  vendorId: string;
  method: VerificationMethod;
  status: Extract<VerificationStatus, "PENDING" | "VERIFIED" | "FAILED">;
  failureReason?: string | null;
  dojahReference?: string | null;
}): Promise<VendorVerification> {
  const rows = await db()<VerificationRow[]>`
    INSERT INTO vendor_verifications (vendor_id, method, status, failure_reason, dojah_reference, verified_at, updated_at)
    VALUES (
      ${input.vendorId}, ${input.method}, ${input.status},
      ${input.failureReason ?? null}, ${input.dojahReference ?? null},
      ${input.status === "VERIFIED" ? new Date() : null}, NOW()
    )
    ON CONFLICT (vendor_id) DO UPDATE SET
      method = EXCLUDED.method,
      status = EXCLUDED.status,
      failure_reason = EXCLUDED.failure_reason,
      dojah_reference = EXCLUDED.dojah_reference,
      verified_at = EXCLUDED.verified_at,
      updated_at = NOW()
    RETURNING vendor_id, method, status, failure_reason, dojah_reference, verified_at, updated_at
  `;
  return mapRow(rows[0]);
}
