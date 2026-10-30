-- Up Migration

-- 1. Tambah kolom-kolom baru pada tabel blogs untuk SEO, GEO, dan kategori
ALTER TABLE blogs
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS meta_title VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_description TEXT,
    ADD COLUMN IF NOT EXISTS canonical_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
    ADD COLUMN IF NOT EXISTS thumbnail_alt VARCHAR(255),
    ADD COLUMN IF NOT EXISTS reading_time_minutes INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS focus_keyphrase VARCHAR(150),
    ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS key_takeaways JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PUBLISHED';

-- Sync image_url ke thumbnail_url untuk data lama jika ada
UPDATE blogs SET thumbnail_url = image_url WHERE thumbnail_url IS NULL AND image_url IS NOT NULL;

-- 2. Buat tabel article_media untuk manajemen aset gambar artikel
CREATE TABLE IF NOT EXISTS article_media (
    id VARCHAR(50) PRIMARY KEY,
    article_id INTEGER REFERENCES blogs(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    storage_key VARCHAR(255),
    original_name VARCHAR(255),
    alt_text VARCHAR(500),
    mime_type VARCHAR(50) DEFAULT 'image/webp',
    width INTEGER,
    height INTEGER,
    size INTEGER,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_article_media_article_id ON article_media(article_id);
CREATE INDEX IF NOT EXISTS idx_article_media_created_at ON article_media(created_at);
CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status);
CREATE INDEX IF NOT EXISTS idx_blogs_category ON blogs(category);

-- Down Migration
DROP TABLE IF EXISTS article_media CASCADE;
ALTER TABLE blogs
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS meta_title,
    DROP COLUMN IF EXISTS meta_description,
    DROP COLUMN IF EXISTS canonical_url,
    DROP COLUMN IF EXISTS thumbnail_url,
    DROP COLUMN IF EXISTS thumbnail_alt,
    DROP COLUMN IF EXISTS reading_time_minutes,
    DROP COLUMN IF EXISTS focus_keyphrase,
    DROP COLUMN IF EXISTS tags,
    DROP COLUMN IF EXISTS key_takeaways,
    DROP COLUMN IF EXISTS faqs,
    DROP COLUMN IF EXISTS status;

