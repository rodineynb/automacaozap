-- Migration 0004: Facebook Conversions API tracking
-- Adiciona campos de Pixel/Token no automations e tabela de tracking

-- Campos de tracking na tabela automations
ALTER TABLE automations ADD COLUMN pixel_id TEXT;
ALTER TABLE automations ADD COLUMN facebook_token TEXT;

-- Tabela de tracking de anúncios (dados que chegam do click do anúncio)
CREATE TABLE IF NOT EXISTS tracking_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  ctwaclid TEXT,
  source_id TEXT,
  page_id TEXT,
  campanha TEXT,
  campanha_id TEXT,
  conjunto_anuncio TEXT,
  conjunto_anuncio_id TEXT,
  anuncio TEXT,
  anuncio_id TEXT,
  titulo TEXT,
  url_anuncio TEXT,
  thumbnail_url TEXT,
  tipo_anuncio TEXT,
  link_whatsapp TEXT,
  mensagem_lead TEXT,
  nome TEXT,
  fbp TEXT,
  client_ip_address TEXT,
  client_user_agent TEXT,
  ct TEXT,
  st TEXT,
  zp TEXT,
  country TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tracking_phone ON tracking_data(phone, automation_id);
