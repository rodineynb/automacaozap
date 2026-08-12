-- Migration 0011: Adiciona colunas para controle de follow-up e cobranças reativas
ALTER TABLE conversation_state ADD COLUMN oferta_19_90_feita INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_state ADD COLUMN upsell_enviado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_state ADD COLUMN funil_encerrado INTEGER NOT NULL DEFAULT 0;
