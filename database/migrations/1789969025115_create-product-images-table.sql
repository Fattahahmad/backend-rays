-- Up Migration
CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_product_images_product_id ON product_images(product_id);

-- Down Migration
DROP TABLE IF EXISTS product_images CASCADE;