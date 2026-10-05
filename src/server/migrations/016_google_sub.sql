-- Savora Food — Google OAuth account linking.
-- google_sub is Google's stable user id ("sub" claim). Email can change, so
-- linking is keyed on sub; email match is only a fallback at link time and
-- only when Google reports the email verified.

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
