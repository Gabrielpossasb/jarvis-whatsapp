-- Câmara fria: estoque independente do freezer para os mesmos produtos.
ALTER TABLE estoque_produtos
  ADD COLUMN IF NOT EXISTS estoque_atual_camara numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo_camara numeric NOT NULL DEFAULT 0;

-- Marca se a movimentação foi no freezer ou na câmara fria; linhas
-- existentes (todas do freezer) ficam cobertas pelo default.
ALTER TABLE estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS local text NOT NULL DEFAULT 'freezer';
