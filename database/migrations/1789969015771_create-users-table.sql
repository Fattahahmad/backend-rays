-- Up Migration
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255), -- Kosong/Null jika login via Google OAuth
    google_id VARCHAR(255) UNIQUE, -- Menyimpan ID dari Google OAuth
    avatar_url VARCHAR(500),
    phone_number VARCHAR(50),
    role user_role NOT NULL DEFAULT 'user',
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Down Migration
DROP TABLE IF EXISTS users CASCADE;