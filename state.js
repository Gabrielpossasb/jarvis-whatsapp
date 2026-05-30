// ─────────────────────────────────────────────
//  state.js — Estado em memória do JARVIS
// ─────────────────────────────────────────────

// Guarda sugestões de revisão de categorias pendentes
// { remoteJid: [{linha, descricao, categoriaAtual, categoriaSugerida, motivo}] }
const pendingReviews = new Map();

module.exports = { pendingReviews };
