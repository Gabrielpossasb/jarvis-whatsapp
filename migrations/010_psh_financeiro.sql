-- ─────────────────────────────────────────────────────
-- Migração: financeiro da Polpa Santa Helena (PSH)
-- ─────────────────────────────────────────────────────
-- O financeiro do PSH é totalmente separado da tabela `gastos` (finanças
-- pessoais) — misturar compras de polpa em milhares de reais nas categorias
-- pessoais destruiria os relatórios de /financeiro.
--
-- Vendas e compras NÃO são digitadas duas vezes: elas nascem de
-- estoque_movimentacoes via trigger (ver abaixo), mas o valor fica editável
-- porque o preço da nota do dia nem sempre bate com o preço cadastrado.

-- ── 1. Preço de compra ───────────────────────────────────────────
-- `preco` (que já existia) é o preço de VENDA por kg/un; esta coluna é o
-- custo de aquisição. Nullable de propósito: produto sem custo cadastrado
-- aparece sinalizado na aba Tabela em vez de fingir lucro de 100%.
ALTER TABLE estoque_produtos
  ADD COLUMN IF NOT EXISTS preco_compra numeric;

-- ── 2. Lançamentos financeiros do PSH ────────────────────────────
CREATE TABLE IF NOT EXISTS psh_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,              -- 'venda' | 'compra' | 'despesa'
  descricao TEXT,
  valor NUMERIC NOT NULL DEFAULT 0,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria TEXT,                  -- só em 'despesa' (Gasolina, Embalagem, …)
  pessoa TEXT,                     -- cliente da venda / fornecedor da compra
  produto_id UUID REFERENCES estoque_produtos(id) ON DELETE SET NULL,
  quantidade NUMERIC,
  -- Origem automática. ON DELETE CASCADE: apagar a movimentação apaga o
  -- lançamento junto, senão o financeiro contaria uma venda que não existe
  -- mais no estoque.
  movimentacao_id UUID REFERENCES estoque_movimentacoes(id) ON DELETE CASCADE,
  -- Marca que o usuário sobrescreveu o valor calculado — o recálculo
  -- automático (trigger de preço) tem que respeitar isso e não voltar atrás.
  editado BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Uma movimentação gera no máximo um lançamento (idempotência do trigger).
CREATE UNIQUE INDEX IF NOT EXISTS psh_lancamentos_movimentacao_uniq
  ON psh_lancamentos (movimentacao_id) WHERE movimentacao_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS psh_lancamentos_data_idx ON psh_lancamentos (data DESC);

-- A aba Financeiro lê e escreve direto pelo client Supabase (mesma
-- convenção de estoque_produtos/faculdade_eventos), então a tabela precisa
-- ficar acessível pela chave anon como as outras. Tabela criada por SQL
-- nasce com RLS desabilitado — este projeto é de uso pessoal e nenhuma
-- outra tabela usa RLS; o acesso é protegido pela chave, não por policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON psh_lancamentos TO anon, authenticated;

-- ── 3. Trigger: movimentação de estoque → lançamento financeiro ──
-- Trigger em vez de fazer o insert no código: hoje existem 3 caminhos que
-- gravam em estoque_movimentacoes (frontend individual, frontend em lote e
-- o chat), e cada caminho novo esqueceria de lançar o financeiro. No banco
-- a regra vale pra todos de graça.
--
-- Só 'venda' (receita) e 'entrada' (compra que chegou na câmara) são
-- eventos financeiros. 'transferencia' move entre câmara e freezer de algo
-- já comprado, 'contagem' é ajuste de inventário e 'consumo' é perda —
-- nenhum dos três movimenta dinheiro.
CREATE OR REPLACE FUNCTION psh_lancamento_de_movimentacao()
RETURNS TRIGGER AS $$
DECLARE
  prod estoque_produtos%ROWTYPE;
  v_valor NUMERIC;
  v_tipo TEXT;
BEGIN
  IF NEW.tipo NOT IN ('venda', 'entrada') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO prod FROM estoque_produtos WHERE id = NEW.produto_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo = 'venda' THEN
    v_tipo  := 'venda';
    v_valor := NEW.quantidade * COALESCE(prod.preco, 0);
  ELSE
    v_tipo  := 'compra';
    v_valor := NEW.quantidade * COALESCE(prod.preco_compra, 0);
  END IF;

  INSERT INTO psh_lancamentos
    (tipo, descricao, valor, data, pessoa, produto_id, quantidade, movimentacao_id)
  VALUES
    (v_tipo, prod.nome, v_valor, NEW.criado_em::date, NEW.pessoa,
     NEW.produto_id, NEW.quantidade, NEW.id)
  ON CONFLICT (movimentacao_id) WHERE movimentacao_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_psh_lancamento_de_movimentacao ON estoque_movimentacoes;
CREATE TRIGGER trg_psh_lancamento_de_movimentacao
  AFTER INSERT ON estoque_movimentacoes
  FOR EACH ROW EXECUTE FUNCTION psh_lancamento_de_movimentacao();

-- ── 4. Backfill das movimentações que já existem ─────────────────
INSERT INTO psh_lancamentos
  (tipo, descricao, valor, data, pessoa, produto_id, quantidade, movimentacao_id)
SELECT
  CASE WHEN m.tipo = 'venda' THEN 'venda' ELSE 'compra' END,
  p.nome,
  m.quantidade * COALESCE(CASE WHEN m.tipo = 'venda' THEN p.preco ELSE p.preco_compra END, 0),
  m.criado_em::date,
  m.pessoa,
  m.produto_id,
  m.quantidade,
  m.id
FROM estoque_movimentacoes m
JOIN estoque_produtos p ON p.id = m.produto_id
WHERE m.tipo IN ('venda', 'entrada')
  AND NOT EXISTS (SELECT 1 FROM psh_lancamentos l WHERE l.movimentacao_id = m.id);

-- ── 5. Categorias de despesa do PSH ──────────────────────────────
-- Mesma tabela `categorias` do resto do projeto (tipo é string livre, sem
-- CHECK — ver 002/003), pro usuário poder criar as dele depois.
INSERT INTO categorias (nome, emoji, tipo)
SELECT v.nome, v.emoji, 'psh_despesa' FROM (VALUES
  ('Combustível', '⛽'),
  ('Embalagem', '📦'),
  ('Energia', '💡'),
  ('Manutenção', '🔧'),
  ('Impostos/Taxas', '🧾'),
  ('Outros', '📌')
) AS v(nome, emoji)
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.nome = v.nome AND c.tipo = 'psh_despesa'
);
