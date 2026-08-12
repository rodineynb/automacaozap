-- Migration 0005: Add waba_id and page_id columns to automations table
ALTER TABLE automations ADD COLUMN waba_id TEXT;
ALTER TABLE automations ADD COLUMN page_id TEXT;
