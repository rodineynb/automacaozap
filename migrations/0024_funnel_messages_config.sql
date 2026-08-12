-- Migration 0024: Funnel Messages Config Tables

CREATE TABLE IF NOT EXISTS automation_funnel_stages (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  stage_key TEXT NOT NULL, -- 'welcome', 'delivery', 'ticket_boost', 'upsell', 'downsell'
  enabled INTEGER DEFAULT 1,
  delay_minutes INTEGER DEFAULT 0, -- usado apenas no upsell
  rewrite_mode TEXT DEFAULT 'none', -- 'none', 'dynamic', 'static'
  rewrite_count INTEGER DEFAULT 5,
  variations TEXT DEFAULT '[]', -- JSON de variações estáticas
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  UNIQUE(automation_id, stage_key)
);

CREATE TABLE IF NOT EXISTS automation_funnel_fields (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'text', 'audio', 'video', 'image', 'document'
  content TEXT NOT NULL, -- conteúdo textual ou link R2/CDN
  file_name TEXT, -- nome original do arquivo (se for mídia)
  sort_order INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (stage_id) REFERENCES automation_funnel_stages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_funnel_stages_automation ON automation_funnel_stages(automation_id);
CREATE INDEX IF NOT EXISTS idx_funnel_fields_stage ON automation_funnel_fields(stage_id);

-- Populando estágios iniciais para todas as automações existentes
INSERT OR IGNORE INTO automation_funnel_stages (id, automation_id, stage_key, enabled, delay_minutes, rewrite_mode)
SELECT 
  a.id || '_' || s.key as id,
  a.id as automation_id,
  s.key as stage_key,
  1 as enabled,
  CASE WHEN s.key = 'upsell' THEN 5 ELSE 0 END as delay_minutes,
  'none' as rewrite_mode
FROM automations a
CROSS JOIN (
  SELECT 'welcome' as key UNION ALL
  SELECT 'delivery' as key UNION ALL
  SELECT 'ticket_boost' as key UNION ALL
  SELECT 'upsell' as key UNION ALL
  SELECT 'downsell' as key
) s;
