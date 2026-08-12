-- Migration 0007: Add product_name column to automations table
ALTER TABLE automations ADD COLUMN product_name TEXT;
