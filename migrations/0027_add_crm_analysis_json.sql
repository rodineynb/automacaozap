-- Migration 0027: Add ai_analysis_json to crm_responses
ALTER TABLE crm_responses ADD COLUMN ai_analysis_json TEXT DEFAULT NULL;
