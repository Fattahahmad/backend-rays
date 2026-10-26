-- Up Migration
-- 1. Penyesuaian Tabel Conversations untuk Web Live Chat
ALTER TABLE conversations ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS guest_name VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS guest_email VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 2. Penyesuaian Tabel Messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Penyesuaian Tabel Services untuk Katalog Detailing & Kalkulator
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration VARCHAR(100);
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'main';

-- 4. Penyesuaian Tabel Service Portfolios
ALTER TABLE service_portfolios ADD COLUMN IF NOT EXISTS car_model VARCHAR(255);
ALTER TABLE service_portfolios ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Down Migration
ALTER TABLE service_portfolios DROP COLUMN IF EXISTS created_at;
ALTER TABLE service_portfolios DROP COLUMN IF EXISTS car_model;

ALTER TABLE services DROP COLUMN IF EXISTS service_type;
ALTER TABLE services DROP COLUMN IF EXISTS duration;
ALTER TABLE services DROP COLUMN IF EXISTS image_url;

ALTER TABLE messages DROP COLUMN IF EXISTS is_read;

ALTER TABLE conversations DROP COLUMN IF EXISTS updated_at;
ALTER TABLE conversations DROP COLUMN IF EXISTS created_at;
ALTER TABLE conversations DROP COLUMN IF EXISTS guest_email;
ALTER TABLE conversations DROP COLUMN IF EXISTS guest_name;
ALTER TABLE conversations ALTER COLUMN phone_number SET NOT NULL;
