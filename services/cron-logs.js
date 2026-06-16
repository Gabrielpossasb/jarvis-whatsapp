// ─────────────────────────────────────────────────────
// services/cron-logs.js — Logs de execução de cron jobs
// ─────────────────────────────────────────────────────

const { supabase } = require("./supabase");

// ── Registrar início de um job ───────────────────────
async function registrarInicio(nomeJob) {
  try {
    const { data, error } = await supabase
      .from("cron_logs")
      .insert({
        nome_job: nomeJob,
        iniciado_em: new Date().toISOString(),
        status: "em_progresso",
      })
      .select("id")
      .single();

    if (error) {
      console.error("❌ Erro ao registrar início:", error.message);
      return null;
    }

    return data?.id;
  } catch (err) {
    console.error("❌ Erro registrar início:", err.message);
    return null;
  }
}

// ── Registrar sucesso ────────────────────────────────
async function registrarSucesso(logId) {
  if (!logId) return;

  try {
    const agora = new Date();
    const { error } = await supabase
      .from("cron_logs")
      .update({
        finalizado_em: agora.toISOString(),
        status: "sucesso",
      })
      .eq("id", logId);

    if (error) {
      console.error("❌ Erro ao registrar sucesso:", error.message);
    }
  } catch (err) {
    console.error("❌ Erro registrar sucesso:", err.message);
  }
}

// ── Registrar erro ───────────────────────────────────
async function registrarErro(logId, mensagemErro) {
  if (!logId) return;

  try {
    const agora = new Date();
    const { error } = await supabase
      .from("cron_logs")
      .update({
        finalizado_em: agora.toISOString(),
        status: "erro",
        mensagem_erro: mensagemErro.substring(0, 500), // Limitar tamanho
      })
      .eq("id", logId);

    if (error) {
      console.error("❌ Erro ao registrar erro:", error.message);
    }
  } catch (err) {
    console.error("❌ Erro registrar erro:", err.message);
  }
}

// ── Wrapper para executar job com logging ────────────
async function executarComLog(nomeJob, funcaoJob) {
  const tempoInicio = Date.now();
  const logId = await registrarInicio(nomeJob);

  console.log(`⏱️  [${nomeJob}] iniciado`);

  try {
    await funcaoJob();
    await registrarSucesso(logId);
    const duracao = Date.now() - tempoInicio;
    console.log(`✅ [${nomeJob}] sucesso (${duracao}ms)`);
  } catch (err) {
    const mensagem = err.message || String(err);
    await registrarErro(logId, mensagem);
    console.error(`❌ [${nomeJob}] erro: ${mensagem}`);
  }
}

module.exports = {
  registrarInicio,
  registrarSucesso,
  registrarErro,
  executarComLog,
};
