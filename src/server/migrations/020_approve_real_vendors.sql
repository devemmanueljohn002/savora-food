-- Savora Food — approve real vendors, hold test kitchens for deletion
-- One-off data migration (idempotent, re-runnable).
--
-- Rule: every vendor awaiting review becomes APPROVED, EXCEPT the test
-- kitchens ("Test's Kitchen", "chisom's Kitchen", matched case-insensitively)
-- which are forced back to PENDING so they can be reviewed and deleted.
-- Explicit REJECTED / SUSPENDED decisions are never touched.

UPDATE vendors
SET status = 'PENDING',
    status_reason = 'Held for deletion (test kitchen).',
    status_updated_at = NOW(),
    updated_at = NOW()
WHERE lower(business_name) IN ('test''s kitchen', 'chisom''s kitchen')
  AND status <> 'PENDING';

UPDATE vendors
SET status = 'APPROVED',
    status_updated_at = NOW(),
    updated_at = NOW()
WHERE status IN ('PENDING', 'UNDER_REVIEW')
  AND lower(business_name) NOT IN ('test''s kitchen', 'chisom''s kitchen');
