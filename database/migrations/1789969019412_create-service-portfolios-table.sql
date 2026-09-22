-- Up Migration
CREATE TABLE service_portfolios (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    image_before_url VARCHAR(500),
    image_after_url VARCHAR(500),
    caption TEXT
);
CREATE INDEX idx_service_portfolios_service_id ON service_portfolios(service_id);

-- Down Migration
DROP TABLE IF EXISTS service_portfolios CASCADE;