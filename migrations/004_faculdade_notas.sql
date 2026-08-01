-- ─────────────────────────────────────────────────────
-- Migração: notas e fórmula de média por disciplina
-- ─────────────────────────────────────────────────────

ALTER TABLE faculdade_eventos ADD COLUMN IF NOT EXISTS nota NUMERIC;
ALTER TABLE faculdade_eventos ADD COLUMN IF NOT EXISTS peso NUMERIC DEFAULT 1;

-- Chaveada por nome (mesma convenção usada em faculdade_eventos.disciplina /
-- faculdade_aulas.disciplina, que são strings livres, não FK) — evita migrar
-- o resto do código pra um modelo relacional novo.
CREATE TABLE IF NOT EXISTS faculdade_disciplinas (
  nome TEXT PRIMARY KEY,
  formula_media TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
