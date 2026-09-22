-- Up Migration
CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    short_description TEXT,
    full_description TEXT,
    starting_price INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Down Migration
DROP TABLE IF EXISTS services CASCADE;