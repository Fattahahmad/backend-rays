-- Up Migration
CREATE TABLE testimonials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Nullable jika testimoni dibuat manual oleh admin
    customer_name VARCHAR(255) NOT NULL,
    car_type VARCHAR(100),
    avatar_url VARCHAR(500),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5), -- Range: 1-5
    content TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_testimonials_user_id ON testimonials(user_id);

-- Down Migration
DROP TABLE IF EXISTS testimonials CASCADE;