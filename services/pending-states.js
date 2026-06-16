// ─────────────────────────────────────────────────────
// services/pending-states.js — Gerenciar estados persistidos
// ─────────────────────────────────────────────────────

const { supabase } = require("./supabase");

// Cache em RAM para leituras rápidas
const cache = new Map();

// ── Limpar estados com mais de 24h ────────────────────
async function limparEstadosAntigos() {
  const agora = new Date();
  const umDiaAtras = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

  try {
    const { error } = await supabase
      .from("pending_states")
      .delete()
      .lt("criado_em", umDiaAtras.toISOString());

    if (error) {
      console.error("❌ Erro ao limpar estados antigos:", error.message);
      return;
    }

    console.log("🧹 Estados antigos (>24h) removidos do Supabase");
  } catch (err) {
    console.error("❌ Erro limpar estados:", err.message);
  }
}

// ── Obter estado (RAM → Supabase se necessário) ───────
async function obterEstado(remoteJid, stateType) {
  const chave = `${remoteJid}:${stateType}`;

  // 1. Tenta cache em RAM
  if (cache.has(chave)) {
    return cache.get(chave);
  }

  // 2. Se não estiver em cache, busca no Supabase
  try {
    const { data, error } = await supabase
      .from("pending_states")
      .select("*")
      .eq("remote_jid", remoteJid)
      .eq("state_type", stateType)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = "not found", que é esperado
      console.error("❌ Erro ao obter estado:", error.message);
      return null;
    }

    if (data) {
      cache.set(chave, data.data);
      return data.data;
    }

    return null;
  } catch (err) {
    console.error("❌ Erro buscar estado:", err.message);
    return null;
  }
}

// ── Salvar estado (RAM + Supabase) ────────────────────
async function salvarEstado(remoteJid, stateType, dados) {
  const chave = `${remoteJid}:${stateType}`;

  // 1. Salvar em RAM
  cache.set(chave, dados);

  // 2. Salvar no Supabase
  try {
    const { data: estadoExistente, error: erroFetch } = await supabase
      .from("pending_states")
      .select("id")
      .eq("remote_jid", remoteJid)
      .eq("state_type", stateType)
      .single();

    if (erroFetch && erroFetch.code !== "PGRST116") {
      console.error("❌ Erro ao verificar estado:", erroFetch.message);
      return;
    }

    if (estadoExistente) {
      // Atualizar
      const { error } = await supabase
        .from("pending_states")
        .update({ data: dados, atualizado_em: new Date().toISOString() })
        .eq("id", estadoExistente.id);

      if (error) {
        console.error("❌ Erro ao atualizar estado:", error.message);
      }
    } else {
      // Inserir
      const { error } = await supabase
        .from("pending_states")
        .insert({
          remote_jid: remoteJid,
          state_type: stateType,
          data: dados,
        });

      if (error) {
        console.error("❌ Erro ao salvar estado:", error.message);
      }
    }
  } catch (err) {
    console.error("❌ Erro salvar estado:", err.message);
  }
}

// ── Deletar estado (RAM + Supabase) ──────────────────
async function deletarEstado(remoteJid, stateType) {
  const chave = `${remoteJid}:${stateType}`;

  // 1. Deletar do cache
  cache.delete(chave);

  // 2. Deletar do Supabase
  try {
    const { error } = await supabase
      .from("pending_states")
      .delete()
      .eq("remote_jid", remoteJid)
      .eq("state_type", stateType);

    if (error) {
      console.error("❌ Erro ao deletar estado:", error.message);
    }
  } catch (err) {
    console.error("❌ Erro deletar estado:", err.message);
  }
}

module.exports = {
  obterEstado,
  salvarEstado,
  deletarEstado,
  limparEstadosAntigos,
};
