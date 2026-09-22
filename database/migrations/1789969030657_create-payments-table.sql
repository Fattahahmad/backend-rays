-- Up Migration
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    midtrans_id VARCHAR(255) UNIQUE,
    payment_type VARCHAR(100), -- Misal: bank_transfer, gopay
    gross_amount INTEGER,
    status payment_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_payments_order_id ON payments(order_id);

-- Down Migration
DROP TABLE IF EXISTS payments CASCADE;