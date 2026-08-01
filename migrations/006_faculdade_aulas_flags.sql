-- faculdade_aulas nunca teve migração versionada (tabela criada manualmente antes
-- de existir a pasta migrations/) — CREATE TABLE IF NOT EXISTS deixa o arquivo
-- auto-contido e seguro de rodar independente do estado atual em produção, mesmo
-- padrão usado pra recuperar 003_categorias_tipo.sql quando a tabela categorias
-- foi apagada por engano.
CREATE TABLE IF NOT EXISTS faculdade_aulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disciplina TEXT NOT NULL,
  turma TEXT,
  professor TEXT,
  dia INTEGER NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  local TEXT,
  cor TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE faculdade_aulas ADD COLUMN IF NOT EXISTS livre_presenca BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE faculdade_aulas ADD COLUMN IF NOT EXISTS online BOOLEAN NOT NULL DEFAULT false;
