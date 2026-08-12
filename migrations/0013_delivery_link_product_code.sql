-- Migration 0013: Add product_code to product_delivery_links
ALTER TABLE product_delivery_links ADD COLUMN product_code TEXT;
