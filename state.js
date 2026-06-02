// ─────────────────────────────────────────────
//  state.js — Estado em memória do JARVIS
// ─────────────────────────────────────────────

// Sugestões de revisão de categorias pendentes
// { remoteJid: [{linha, descricao, categoriaAtual, categoriaSugerida, motivo}] }
const pendingReviews = new Map();

// Tarefa pendente de confirmação (duplicata detectada)
// { remoteJid: { dados, dataRegistro, tarefaSimilar } }
const pendingTaskAdd = new Map();

const pendingExtrato = new Map();

module.exports = { pendingReviews, pendingTaskAdd, pendingExtrato };
