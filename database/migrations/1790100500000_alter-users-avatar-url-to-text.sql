-- Up Migration
ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT;

-- Down Migration
ALTER TABLE users ALTER COLUMN avatar_url TYPE VARCHAR(500);
