-- Up Migration
CREATE TABLE coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    discount_type discount_type NOT NULL,
    discount_value INTEGER NOT NULL,
    min_purchase INTEGER DEFAULT 0,
    valid_days JSONB, -- Contoh: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Down Migration
DROP TABLE IF EXISTS coupons CASCADE;