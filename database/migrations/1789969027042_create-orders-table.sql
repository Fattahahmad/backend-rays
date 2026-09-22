-- Up Migration
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    order_number VARCHAR(100) NOT NULL UNIQUE,
    subtotal INTEGER,
    shipping_cost INTEGER,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    grand_total INTEGER,
    shipping_address TEXT,
    courier VARCHAR(50), -- Misal: JNE, INSTANT
    courier_service VARCHAR(50), -- Misal: REG, YES, GoSend
    tracking_number VARCHAR(100),
    status order_status NOT NULL DEFAULT 'pending_payment',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);

-- Down Migration
DROP TABLE IF EXISTS orders CASCADE;