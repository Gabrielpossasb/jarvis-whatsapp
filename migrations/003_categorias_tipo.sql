-- ─────────────────────────────────────────────────────
-- Migração: separa categorias por tipo (tarefa/gasto/ganho)
-- ─────────────────────────────────────────────────────
-- Hoje a tabela categorias só é usada por tarefas. Gastos usam listas
-- hardcoded e duplicadas em Gastos.jsx, Financeiro.jsx e nos prompts de
-- extrairExtrato/extrairExtratoTexto (services/openai.js) — essa migração
-- traz essas categorias pra dentro da tabela, sem mexer nas cores
-- (CORES_CAT continua hardcoded no frontend, é uma paleta semântica à parte).
--
-- CREATE TABLE IF NOT EXISTS em vez de assumir que a tabela já existe —
-- a tabela "categorias" nunca teve uma migração versionada (foi criada
-- direto no Supabase), então precisa ser recriável do zero aqui também.

CREATE TABLE IF NOT EXISTS categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  emoji TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'tarefa';

-- INSERT ... WHERE NOT EXISTS em vez de ON CONFLICT: não há garantia de
-- que "nome" tenha uma constraint UNIQUE no banco (a duplicidade hoje é
-- checada só em código, em adicionarCategoria).
INSERT INTO categorias (nome, emoji, tipo)
SELECT v.nome, v.emoji, v.tipo FROM (VALUES
  -- categorias de tarefa (mesma lista de CATEGORIAS_PADRAO em services/categorias.js)
  ('Casa', '🏠', 'tarefa'),
  ('Elétrica', '⚡', 'tarefa'),
  ('Chácara', '🌿', 'tarefa'),
  ('Faculdade', '🎓', 'tarefa'),
  ('Trabalho', '💼', 'tarefa'),
  ('Pessoal', '👤', 'tarefa'),
  ('Saúde', '🏥', 'tarefa'),
  ('Financeiro', '💰', 'tarefa'),
  ('Outros', '📌', 'tarefa'),
  -- categorias de gasto
  ('Alimentação', '🍔', 'gasto'),
  ('Assinaturas', '📱', 'gasto'),
  ('Cartão/Fatura', '💳', 'gasto'),
  ('Cuidados Pessoais', '💇', 'gasto'),
  ('Dívidas/Empréstimo', '💸', 'gasto'),
  ('Outros', '📌', 'gasto'),
  ('Presentes', '🎁', 'gasto'),
  ('Relacionamento', '❤️', 'gasto'),
  ('Saúde', '🏥', 'gasto'),
  ('Transporte', '🚗', 'gasto'),
  -- categorias de ganho
  ('Salário', '💵', 'ganho'),
  ('Freela', '💻', 'ganho'),
  ('iFood (Entrega)', '🛵', 'ganho'),
  ('Transferência recebida', '🔄', 'ganho'),
  ('Outros ganhos', '💰', 'ganho')
) AS v(nome, emoji, tipo)
WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.nome = v.nome AND c.tipo = v.tipo);
