-- ========================================================================
-- AUTO-GENERATED FOR HOSTINGER MYSQL / MARIADB
-- Generated at: 2026-10-30T03:40:58.838Z
-- ========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Source: 1789969015771_create-users-table.sql
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255), -- Kosong/Null jika login via Google OAuth
    google_id VARCHAR(255) UNIQUE, -- Menyimpan ID dari Google OAuth
    avatar_url VARCHAR(500),
    phone_number VARCHAR(50),
    role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user',
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Source: 1789969017619_create-services-table.sql
CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    short_description TEXT,
    full_description TEXT,
    starting_price INT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Source: 1789969019412_create-service-portfolios-table.sql
CREATE TABLE IF NOT EXISTS service_portfolios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    image_before_url VARCHAR(500),
    image_after_url VARCHAR(500),
    caption TEXT

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_service_portfolios_service_id ON service_portfolios(service_id);

-- Source: 1789969021246_create-categories-table.sql
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Source: 1789969023182_create-products-table.sql
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    price INT NOT NULL,
    weight_grams INT NOT NULL, -- Wajib untuk hitung ongkir API JNE
    stock INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP -- Soft delete untuk menjaga integritas transaksi

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_slug ON products(slug);

-- Source: 1789969025115_create-product-images-table.sql
CREATE TABLE IF NOT EXISTS product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_product_images_product_id ON product_images(product_id);

-- Source: 1789969027042_create-orders-table.sql
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    order_number VARCHAR(100) NOT NULL UNIQUE,
    subtotal INT,
    shipping_cost INT,
    discount_amount INT NOT NULL DEFAULT 0,
    grand_total INT,
    shipping_address TEXT,
    courier VARCHAR(50), -- Misal: JNE, INSTANT
    courier_service VARCHAR(50), -- Misal: REG, YES, GoSend
    tracking_number VARCHAR(100),
    status ENUM('pending_payment', 'paid', 'processing', 'shipped', 'completed', 'canceled') NOT NULL DEFAULT 'pending_payment',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);

-- Source: 1789969028853_create-order-items-table.sql
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL,
    price_at_checkout INT NOT NULL -- Mengunci harga saat transaksi terjadi

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Source: 1789969030657_create-payments-table.sql
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    midtrans_id VARCHAR(255) UNIQUE,
    payment_type VARCHAR(100), -- Misal: bank_transfer, gopay
    gross_amount INT,
    status ENUM('pending', 'settlement', 'expire', 'cancel') NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_payments_order_id ON payments(order_id);

-- Source: 1789969032529_create-coupons-table.sql
CREATE TABLE IF NOT EXISTS coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    discount_type ENUM('percentage', 'fixed_amount') NOT NULL,
    discount_value INT NOT NULL,
    min_purchase INT DEFAULT 0,
    valid_days JSON, -- Contoh: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Source: 1789969034368_create-testimonials-table.sql
CREATE TABLE IF NOT EXISTS testimonials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL, -- Nullable jika testimoni dibuat manual oleh admin
    customer_name VARCHAR(255) NOT NULL,
    car_type VARCHAR(100),
    avatar_url VARCHAR(500),
    rating INT CHECK (rating >= 1 AND rating <= 5), -- Range: 1-5
    content TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_testimonials_user_id ON testimonials(user_id);

-- Source: 1789969036111_create-blogs-table.sql
CREATE TABLE IF NOT EXISTS blogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    author_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- Hanya diisi oleh admin/super_admin
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    excerpt TEXT,
    content TEXT,
    image_url VARCHAR(500),
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_blogs_author_id ON blogs(author_id);
CREATE INDEX idx_blogs_slug ON blogs(slug);

-- Source: 1789969037855_create-conversations-table.sql
CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    phone_number VARCHAR(50) NOT NULL, -- Identifikasi nomor WhatsApp
    status ENUM('open', 'resolved') NOT NULL DEFAULT 'open'

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_phone_number ON conversations(phone_number);

-- Source: 1789969039557_create-messages-table.sql
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type ENUM('customer', 'admin') NOT NULL,
    source ENUM('web_chat', 'whatsapp') NOT NULL,
    message_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- Source: 1789975478930_create-otps-table.sql
CREATE TABLE IF NOT EXISTS otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'registration', -- registration, forgot_password
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_otps_email ON otps(email);
CREATE INDEX idx_otps_code ON otps(otp_code);

-- Source: 1789975500000_create-faqs-table.sql
CREATE TABLE IF NOT EXISTS faqs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    order_index INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_faqs_category ON faqs(category);
CREATE INDEX idx_faqs_order ON faqs(order_index);

-- Source: 1789975520000_create-audit-logs-table.sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    description TEXT,
    details JSON,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Source: 1790100000000_enhance-chat-and-service-tables.sql
-- 1. Penyesuaian Tabel Conversations untuk Web Live Chat
ALTER TABLE conversations ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS guest_name VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS guest_email VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 2. Penyesuaian Tabel Messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Penyesuaian Tabel Services untuk Katalog Detailing & Kalkulator
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration VARCHAR(100);
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'main';

-- 4. Penyesuaian Tabel Service Portfolios
ALTER TABLE service_portfolios ADD COLUMN IF NOT EXISTS car_model VARCHAR(255);
ALTER TABLE service_portfolios ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Source: 1790100100000_create-settings-table.sql
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Source: 1790100200000_create-banners-table.sql
CREATE TABLE IF NOT EXISTS banners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sort_order INT NOT NULL DEFAULT 1,
    image_url VARCHAR(500) NOT NULL,
    badge_text VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    button_show BOOLEAN NOT NULL DEFAULT TRUE,
    button_text VARCHAR(255) DEFAULT 'LIHAT PROMO',
    button_url VARCHAR(500) DEFAULT '/promo',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Source: 1790100300000_alter-banners-columns-to-text.sql
ALTER TABLE banners MODIFY COLUMN image_url TEXT;
ALTER TABLE banners MODIFY COLUMN button_url TEXT;
ALTER TABLE banners MODIFY COLUMN title TEXT;

-- Source: 1790100400000_add-refresh-token-to-users.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;

-- Source: 1790100500000_alter-users-avatar-url-to-text.sql
ALTER TABLE users MODIFY COLUMN avatar_url TEXT;

-- Source: 1790100600000_enhance-blogs-and-create-article-media.sql
-- 1. Tambah kolom-kolom baru pada tabel blogs untuk SEO, GEO, dan kategori
ALTER TABLE blogs
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS meta_title VARCHAR(255),
    ADD COLUMN IF NOT EXISTS meta_description TEXT,
    ADD COLUMN IF NOT EXISTS canonical_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
    ADD COLUMN IF NOT EXISTS thumbnail_alt VARCHAR(255),
    ADD COLUMN IF NOT EXISTS reading_time_minutes INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS focus_keyphrase VARCHAR(150),
    ADD COLUMN IF NOT EXISTS tags JSON DEFAULT ('[]'),
    ADD COLUMN IF NOT EXISTS key_takeaways JSON DEFAULT ('[]'),
    ADD COLUMN IF NOT EXISTS faqs JSON DEFAULT ('[]'),
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PUBLISHED';

-- Sync image_url ke thumbnail_url untuk data lama jika ada
UPDATE blogs SET thumbnail_url = image_url WHERE thumbnail_url IS NULL AND image_url IS NOT NULL;

-- 2. Buat tabel article_media untuk manajemen aset gambar artikel
CREATE TABLE IF NOT EXISTS article_media (
    id VARCHAR(50) PRIMARY KEY,
    article_id INT REFERENCES blogs(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    storage_key VARCHAR(255),
    original_name VARCHAR(255),
    alt_text VARCHAR(500),
    mime_type VARCHAR(50) DEFAULT 'image/webp',
    width INT,
    height INT,
    size INT,
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_article_media_article_id ON article_media(article_id);
CREATE INDEX idx_article_media_created_at ON article_media(created_at);
CREATE INDEX idx_blogs_status ON blogs(status);
CREATE INDEX idx_blogs_category ON blogs(category);

SET FOREIGN_KEY_CHECKS = 1;
