-- ─────────────────────────────────────────────────────
-- Migração: upload de imagem por produto (ícone real, além do emoji)
-- ─────────────────────────────────────────────────────
-- Frutas como açaí e maracujá não têm emoji real no Unicode (usávamos
-- aproximações: 🫐 e 💛 — ver migração 007). Adiciona uma coluna de URL
-- de imagem: quando preenchida, o frontend mostra a imagem no lugar do
-- emoji. Upload feito direto pelo modal "Editar produto" (input de
-- arquivo), sem precisar colar link externo.

ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS icone_url TEXT;

-- Bucket público de imagens dos produtos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('estoque-icones', 'estoque-icones', true, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- O app não tem sistema de login — a chave anon é usada direto no browser
-- pro resto do estoque também (mesmo padrão de estoque_produtos/
-- estoque_movimentacoes, sem RLS restritiva). Libera leitura e escrita
-- pro anon só nesse bucket.
DROP POLICY IF EXISTS "estoque_icones_select" ON storage.objects;
CREATE POLICY "estoque_icones_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'estoque-icones');

DROP POLICY IF EXISTS "estoque_icones_insert" ON storage.objects;
CREATE POLICY "estoque_icones_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'estoque-icones');

DROP POLICY IF EXISTS "estoque_icones_update" ON storage.objects;
CREATE POLICY "estoque_icones_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'estoque-icones');

DROP POLICY IF EXISTS "estoque_icones_delete" ON storage.objects;
CREATE POLICY "estoque_icones_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'estoque-icones');
