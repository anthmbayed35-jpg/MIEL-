-- "Add member" (owner creates an active account with a generated temporary password):
--   must_change_password   the person must choose their own password at first login
--   must_enroll_mfa        the person must set up two-factor (TOTP + recovery codes) before reaching anything else
--   temp_password_expires_at  the temporary password stops working after this time (48 h) if unused
-- Only the hash of the temporary password is ever stored (password_hash, argon2id).
ALTER TABLE admin_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN must_enroll_mfa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN temp_password_expires_at TEXT;
