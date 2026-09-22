-- Up Migration
CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin');
CREATE TYPE order_status AS ENUM ('pending_payment', 'paid', 'processing', 'shipped', 'completed', 'canceled');
CREATE TYPE payment_status AS ENUM ('pending', 'settlement', 'expire', 'cancel');
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE conversation_status AS ENUM ('open', 'resolved');
CREATE TYPE sender_type AS ENUM ('customer', 'admin');
CREATE TYPE message_source AS ENUM ('web_chat', 'whatsapp');

-- Down Migration
DROP TYPE IF EXISTS message_source CASCADE;
DROP TYPE IF EXISTS sender_type CASCADE;
DROP TYPE IF EXISTS conversation_status CASCADE;
DROP TYPE IF EXISTS discount_type CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;