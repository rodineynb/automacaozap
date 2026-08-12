-- Migration 0029: Add sort_order and name columns for dynamic stages reordering

-- 1. Add sort_order to stage tables
ALTER TABLE automation_funnel_stages ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE automation_followup_stages ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE automation_crm_stages ADD COLUMN sort_order INTEGER DEFAULT 0;

-- 2. Add name to automation_funnel_stages
ALTER TABLE automation_funnel_stages ADD COLUMN name TEXT DEFAULT NULL;

-- 3. Populate existing rows in automation_funnel_stages
UPDATE automation_funnel_stages SET name = 'Boas-vindas', sort_order = 1 WHERE stage_key = 'welcome';
UPDATE automation_funnel_stages SET name = 'Entrega / Oferta', sort_order = 2 WHERE stage_key = 'delivery';
UPDATE automation_funnel_stages SET name = 'Oferta Especial', sort_order = 3 WHERE stage_key = 'ticket_boost';
UPDATE automation_funnel_stages SET name = 'Presente Especial', sort_order = 4 WHERE stage_key = 'ticket_boost_declined';
UPDATE automation_funnel_stages SET name = 'Upsell', sort_order = 5 WHERE stage_key = 'upsell';
UPDATE automation_funnel_stages SET name = 'Downsell', sort_order = 6 WHERE stage_key = 'downsell';
