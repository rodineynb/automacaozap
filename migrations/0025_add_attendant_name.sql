-- Migration 0025: Add attendant_name to automations
ALTER TABLE automations ADD COLUMN attendant_name TEXT DEFAULT 'Julia';
