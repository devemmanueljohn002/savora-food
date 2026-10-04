-- Savora Food — vendor profile photos (private S3, key stored on vendors)
-- Additive only. Existing vendors get NULL (no photo) and keep full order
-- functionality; the photo is recognition-only, never a verification signal.

-- Server-generated S3 key of the validated, sanitized profile image, e.g.
-- vendors/{vendorId}/profile/{uuid}.jpg. NULL = no photo.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS profile_photo_key TEXT;

-- Orphan/failed-delete ledger: keys that must not be left unmanaged
-- (staging objects whose DB update failed, old photos whose delete failed).
-- A later cleanup job (or admin action) drains rows with cleaned_at IS NULL.
CREATE TABLE IF NOT EXISTS vendor_photo_cleanups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleaned_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vendor_photo_cleanups_pending
  ON vendor_photo_cleanups (cleaned_at) WHERE cleaned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_photo_cleanups_vendor
  ON vendor_photo_cleanups (vendor_id);
