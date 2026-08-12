-- Migration 0010: Ordenação de Fallback para LLMs, OCR e Transcrição
-- Adiciona a coluna sort_order para ordenar a preferência de fallback de serviços

ALTER TABLE llms ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE ocr_services ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE transcription_services ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Atualizar registros iniciais de LLMs com sequencial por data de criação
WITH numbered_llms AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num FROM llms
)
UPDATE llms SET sort_order = (SELECT row_num FROM numbered_llms WHERE numbered_llms.id = llms.id);

-- Atualizar registros iniciais de OCR com sequencial por data de criação
WITH numbered_ocr AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num FROM ocr_services
)
UPDATE ocr_services SET sort_order = (SELECT row_num FROM numbered_ocr WHERE numbered_ocr.id = ocr_services.id);

-- Atualizar registros iniciais de Transcrição com sequencial por data de criação
WITH numbered_transcription AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num FROM transcription_services
)
UPDATE transcription_services SET sort_order = (SELECT row_num FROM numbered_transcription WHERE numbered_transcription.id = transcription_services.id);
