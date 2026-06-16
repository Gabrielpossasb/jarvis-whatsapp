// ─────────────────────────────────────────────
//  state.js — Estado em memória do JARVIS
// ─────────────────────────────────────────────

const pendingReviews   = new Map();
const pendingTaskAdd   = new Map();
const pendingExtrato   = new Map();

// Múltiplas tarefas aguardando confirmação/edição
// { remoteJid: [ { descricao, data, hora, recorrente, categoria, dias_lembrete, hora_lembrete } ] }
const pendingMultiTarefas = new Map();

module.exports = { pendingReviews, pendingTaskAdd, pendingExtrato, pendingMultiTarefas };
