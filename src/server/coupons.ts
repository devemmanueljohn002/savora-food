export type CouponRow = {
  id: string;
  code: string;
  type: string;
  value: string;
  max_uses: number | null;
  used_count: number;
  starts_at: Date | null;
  expires_at: Date | null;
  is_active: boolean;
  vendor_id: string | null;
  vendor_name: string | null;
  created_at: Date;
};

export function couponDto(row: CouponRow) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: Number(row.value),
    maxUses: row.max_uses,
    usedCount: row.used_count,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    createdAt: row.created_at,
  };
}
