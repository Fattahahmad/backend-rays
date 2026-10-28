-- Up Migration
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS refresh_token;
