-- Migration 0012: Adiciona campo had_profile_pic na tabela contacts
ALTER TABLE contacts ADD COLUMN had_profile_pic INTEGER NOT NULL DEFAULT 0;
