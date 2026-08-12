-- Migration 0016: Adiciona coluna de upsell_name na tabela product_upsells
ALTER TABLE product_upsells ADD COLUMN upsell_name TEXT;
