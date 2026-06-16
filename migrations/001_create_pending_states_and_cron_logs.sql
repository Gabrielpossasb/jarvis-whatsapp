-- ─────────────────────────────────────────────────────
-- Migração: Criar tabelas para estados pendentes e logs de cron
-- ─────────────────────────────────────────────────────

-- Tabela para armazenar estados pendentes (confirmaçoes aguardando)
CREATE TABLE IF NOT EXISTS pending_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_jid TEXT NOT NULL,
  state_type TEXT NOT NULL, -- 'extrato', 'tarefa', 'review'
  data JSONB NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_state_type CHECK (state_type IN ('extrato', 'tarefa', 'review'))
);

CREATE INDEX idx_pending_states_remote_jid ON pending_states(remote_jid);
CREATE INDEX idx_pending_states_criado_em ON pending_states(criado_em);

-- Tabela para armazenar logs de execução de cron jobs
CREATE TABLE IF NOT EXISTS cron_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_job TEXT NOT NULL,
  iniciado_em TIMESTAMP WITH TIME ZONE NOT NULL,
  finalizado_em TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL, -- 'sucesso', 'erro', 'em_progresso'
  mensagem_erro TEXT,
  duracao_ms INTEGER,

  CONSTRAINT valid_status CHECK (status IN ('sucesso', 'erro', 'em_progresso'))
);

CREATE INDEX idx_cron_logs_nome_job ON cron_logs(nome_job);
CREATE INDEX idx_cron_logs_iniciado_em ON cron_logs(iniciado_em);
