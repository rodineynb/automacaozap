-- Preencher dados do produto "Recheios" (ID: '333676f7-ec3c-431c-ae50-19ccba85db9f')

-- Atualizar descrição do produto
UPDATE products 
SET description = 'Apostilas premium de recheios que não vão ao fogo, massas gourmet e portal de confeitarias de sucesso.',
    deliver_pdfs = 1,
    deliver_links = 1
WHERE id = '333676f7-ec3c-431c-ae50-19ccba85db9f';

-- 1. Limpar e Inserir Ofertas (product_offers)
DELETE FROM product_offers WHERE product_id = '333676f7-ec3c-431c-ae50-19ccba85db9f';

INSERT INTO product_offers (id, product_id, name, value, tag) VALUES
('offer-basico', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Apostila 200 Recheios Sem Fogo', 10.00, 'principal'),
('offer-massas', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Recheios + Massas Especiais', 15.00, 'especial'),
('offer-completo', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Kit Completo de Confeitaria', 25.00, 'principal'),
('offer-1290', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Kit Completo (Oferta Especial Finalizador)', 12.90, 'downsell_2'),
('offer-1450', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Kit Completo (Oferta Especial Julia)', 14.50, 'downsell_2'),
('offer-upsell', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Upgrade Kit Completo (Upsell Pós-Venda)', 5.00, 'upsell'),
('offer-downsell', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Upgrade Kit Completo (Downsell de Resgate)', 7.50, 'downsell');

-- 2. Limpar e Inserir Assets e PDFs de Entrega (product_assets)
DELETE FROM product_assets WHERE product_id = '333676f7-ec3c-431c-ae50-19ccba85db9f';

INSERT INTO product_assets (id, product_id, name, r2_key, public_url, file_type, tag, is_delivery_file) VALUES
-- PDFs de Entrega
('asset-pdf-1', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf', 'external', 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf', 'pdf', 'apostila_1', 1),
('asset-pdf-2', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Apostila 2. Recheios Sem Fogão (34 Receitas).pdf', 'external', 'https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf', 'pdf', 'apostila_2', 1),
('asset-pdf-3', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Apostila 3. Recheios Sem Fogão (20 Receitas).pdf', 'external', 'https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf', 'pdf', 'apostila_3', 1),
('asset-pdf-4', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Apostila 4. Recheios Sem Fogão (23 Receitas).pdf', 'external', 'https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf', 'pdf', 'apostila_4', 1),
('asset-pdf-5', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Apostila 5. Recheios Sem Fogão (101 Receitas).pdf', 'external', 'https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf', 'pdf', 'apostila_5', 1),

-- Mídias de Apoio do Funil
('asset-media-audio1', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Áudio 1 (Apresentação e Oferta)', 'external', 'https://dados.promentor21.top/Funil%20Recheios/audio1-v4.mp3', 'audio', 'audio_seq1', 0),
('asset-media-img1', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Imagem Sequência 1 (Recheios)', 'external', 'https://dados.promentor21.top/Funil%20Recheios/img_seq1.png', 'image', 'img_seq1', 0),
('asset-media-audio2', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Áudio 2 (Entrega e Instrução)', 'external', 'https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3', 'audio', 'audio_seq2', 0),
('asset-media-img2', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Imagem Sequência 2 (Fatias de Sucesso)', 'external', 'https://dados.promentor21.top/Funil%20Recheios/img2.jpeg', 'image', 'img_seq2', 0),
('asset-media-imgbonus', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Imagem dos Bônus Gourmet', 'external', 'https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg', 'image', 'img_bonus', 0),
('asset-media-video2', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Vídeo Prova Social 2 (Support)', 'external', 'https://dados.promentor21.top/Funil%20Recheios/video2.mp4', 'video', 'video_seq3', 0),
('asset-media-video3', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Vídeo Prova Social 3 (Support)', 'external', 'https://dados.promentor21.top/Funil%20Recheios/video3.mp4', 'video', 'video_seq3_2', 0),
('asset-media-imgupsell', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Imagem da Oferta do Upsell', 'external', 'https://dados.promentor21.top/Funil%20Recheios/img_upssel.png', 'image', 'img_upsell', 0);

-- 3. Limpar e Inserir Links de Área de Membros (product_delivery_links)
DELETE FROM product_delivery_links WHERE product_id = '333676f7-ec3c-431c-ae50-19ccba85db9f';

INSERT INTO product_delivery_links (id, product_id, title, login_url, instructions, video_url) VALUES
('link-portal', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Portal Oficial de Confeiteiras', 'https://app.promentor21.top/login', 'Utilize o seu e-mail cadastrado e sua senha padrão. Assista ao vídeo de suporte se tiver dúvidas.', 'https://www.youtube.com/shorts/5xd3IRlA-GM'),
('link-backup', '333676f7-ec3c-431c-ae50-19ccba85db9f', 'Link de Emergência / Backup', 'http://recheios.promentor21.top/bonus', 'Portal alternativo de downloads e bônus em PDF caso o portal principal apresente instabilidade ou lentidão.', NULL);

-- 4. Associar Produto com a Automação "recheios" na tabela pivô
-- Tenta obter o ID correto da automação 'recheios' se existir, senão insere com o ID padrão mapeado.
INSERT OR IGNORE INTO product_automations (product_id, automation_id)
SELECT '333676f7-ec3c-431c-ae50-19ccba85db9f', id 
FROM automations 
WHERE slug = 'recheios'
UNION ALL
SELECT '333676f7-ec3c-431c-ae50-19ccba85db9f', '3805b688-0967-4e96-86da-6936c10c5d58'
WHERE NOT EXISTS (SELECT 1 FROM automations WHERE slug = 'recheios');
