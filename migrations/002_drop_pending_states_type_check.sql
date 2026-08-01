-- ─────────────────────────────────────────────────────
-- Migração: Remove o CHECK de state_type em pending_states
-- ─────────────────────────────────────────────────────
-- state_type já é tratado como string livre em todo o código (services/pending-states.js) —
-- manter um enum SQL travado quebra silenciosamente toda vez que um fluxo novo é adicionado
-- (já aconteceu com "evento_faculdade_lote"; "esclarecimento" seria o próximo a quebrar).

ALTER TABLE pending_states DROP CONSTRAINT IF EXISTS valid_state_type;
