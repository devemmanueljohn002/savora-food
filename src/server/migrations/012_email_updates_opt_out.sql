-- Savora Food — email updates opt-out (unsubscribe link in order emails)
-- Additive only. Transactional emails check this flag; in-app notifications
-- are unaffected. One-way default keeps current behavior for all users.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_updates_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
