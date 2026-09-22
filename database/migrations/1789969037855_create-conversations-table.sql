-- Up Migration
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    phone_number VARCHAR(50) NOT NULL, -- Identifikasi nomor WhatsApp
    status conversation_status NOT NULL DEFAULT 'open'
);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_phone_number ON conversations(phone_number);

-- Down Migration
DROP TABLE IF EXISTS conversations CASCADE;