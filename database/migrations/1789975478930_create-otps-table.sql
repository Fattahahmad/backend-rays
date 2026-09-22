-- Up Migration
CREATE TABLE otps (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'registration', -- registration, forgot_password
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_otps_email ON otps(email);
CREATE INDEX idx_otps_code ON otps(otp_code);

-- Down Migration
DROP TABLE IF EXISTS otps CASCADE;