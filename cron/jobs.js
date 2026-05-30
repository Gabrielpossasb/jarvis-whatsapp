// ─────────────────────────────────────────────
//  cron/jobs.js — Todos os cron jobs do JARVIS
// ─────────────────────────────────────────────

const cron = require("node-cron");
const { CONFIG, DIAS_SEMANA } = require("../config");
const { enviarMensagem } = require("../services/evolution");
const { getEmoji } = require("../services/categorias");
const {
  buscarTarefasDoDia, buscarTarefasComLembreteHoje,
  marcarLembreteEnviado, buscarTarefasVencidas, buscarTarefasEsquecidas,
} = require("../services/sheets");
const { agora, formatarData, formatarHora } = require("../utils/date");

// ── Resumo diário às 7h ───────────────────────────────────────────
async function enviarResumoDiario() {
  console.log("Resumo diário...");
  try {
    const dataHoje = formatarData();
    const tarefas = await buscarTarefasDoDia(dataHoje);

    if (tarefas.length === 0) {
      await enviarMensagem(CONFIG.NUMERO_AUTORIZADO,
        `🗓️ *Bom dia, Gabriel!*\nNenhuma tarefa para hoje (${dataHoje}). Dia livre! 🎉`);
      return;
    }

    // Agrupa por categoria
    const porCategoria = {};
    for (const t of tarefas) {
      const cat = t.categoria || "Outros";
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(t);
    }

    let msg = `🗓️ *Bom dia, Gabriel!*\n*Tarefas de hoje — ${dataHoje}:*\n`;

    for (const [categoria, itens] of Object.entries(porCategoria)) {
      const emoji = await getEmoji(categoria);
      msg += `\n${emoji} *${categoria}*\n`;
      const semHorario = itens.filter(t => !t.hora);
      const comHorario = itens.filter(t => t.hora).sort((a, b) => a.hora.localeCompare(b.hora));
      for (const t of semHorario) msg += `📌 ${t.descricao}\n`;
      for (const t of comHorario) msg += `⏰ ${t.hora} — ${t.descricao}\n`;
    }

    msg += "\nBora! 💪";
    await enviarMensagem(CONFIG.NUMERO_AUTORIZADO, msg);
  } catch (err) {
    console.error("Erro resumo diário:", err.message);
  }
}

// ── Lembretes a cada 15min ────────────────────────────────────────
async function verificarLembretes() {
  try {
    const agr = agora();
    const dataHoje = formatarData(agr);
    const horaAtual = formatarHora(agr);
    const em1hora = new Date(agr.getTime() + 60 * 60 * 1000);
    const horaEm1h = formatarHora(em1hora);

    // 1. Lembretes de tarefas do dia (hora da tarefa)
    const tarefasDoDia = await buscarTarefasDoDia(dataHoje);
    for (const t of tarefasDoDia) {
      if (!t.hora || t.lembreteEnviado === "Sim") continue;
      const ehRecorrente = t.recorrente !== "Não";
      const horaGatilho = ehRecorrente ? horaAtual : horaEm1h;

      if (t.hora === horaGatilho) {
        const emoji = await getEmoji(t.categoria);
        const msg = ehRecorrente
          ? `⏰ *Lembrete!*\n${emoji} *${t.descricao}*\n🔁 Recorrente: ${t.recorrente}`
          : `⏰ *Lembrete!*\nDaqui 1h: ${emoji} *${t.descricao}* às ${t.hora}`;
        await enviarMensagem(CONFIG.NUMERO_AUTORIZADO, msg);
        if (!ehRecorrente) await marcarLembreteEnviado(t.linha, "Sim");
      }
    }

    // 2. Lembretes independentes (diasLembrete + horaLembrete)
    const tarefasComLembrete = await buscarTarefasComLembreteHoje();
    for (const t of tarefasComLembrete) {
      if (t.horaLembrete !== horaAtual) continue;
      // Evita enviar mais de uma vez por dia (lembreteEnviado = última data enviada)
      if (t.lembreteEnviado === dataHoje) continue;

      const emoji = await getEmoji(t.categoria);
      const prazo = t.data && t.data !== "backlog" ? `\n📅 Prazo: ${t.data}` : "";
      const msg = `🔔 *Lembrete programado!*\n${emoji} *${t.descricao}*${prazo}\n_Lembrete toda ${t.diasLembrete} às ${t.horaLembrete}_`;
      await enviarMensagem(CONFIG.NUMERO_AUTORIZADO, msg);
      await marcarLembreteEnviado(t.linha, dataHoje);
    }
  } catch (err) {
    console.error("Erro lembretes:", err.message);
  }
}

// ── Tarefas vencidas às 20h ───────────────────────────────────────
async function verificarTarefasVencidas() {
  try {
    const vencidas = await buscarTarefasVencidas();
    for (const t of vencidas) {
      const emoji = await getEmoji(t.categoria);
      const msg = [
        `⚠️ *Tarefa vencida!*`, ``,
        `${emoji} *${t.descricao}*`,
        `📅 Era para: ${t.data} | 🏷️ ${t.categoria}`,
        ``, `O que deseja?`,
        `✅ _"concluí ${t.descricao.toLowerCase()}"_`,
        `🗑️ _"excluir ${t.descricao.toLowerCase()}"_`,
      ].join("\n");
      await enviarMensagem(CONFIG.NUMERO_AUTORIZADO, msg);
    }
  } catch (err) {
    console.error("Erro vencidas:", err.message);
  }
}

// ── Tarefas esquecidas toda segunda às 9h ─────────────────────────
async function verificarTarefasEsquecidas() {
  try {
    const esquecidas = await buscarTarefasEsquecidas();
    if (esquecidas.length === 0) return;

    const porCategoria = {};
    for (const t of esquecidas) {
      const cat = t.categoria || "Outros";
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(t);
    }

    let msg = `🔔 *Tarefas aguardando há +7 dias:*\n`;
    for (const [cat, itens] of Object.entries(porCategoria)) {
      const emoji = await getEmoji(cat);
      msg += `\n${emoji} *${cat}*\n`;
      for (const t of itens) msg += `📌 ${t.descricao} _(desde ${t.dataCriacao})_\n`;
    }
    msg += `\n_"concluí [tarefa]" ou "excluir [tarefa]"_`;
    await enviarMensagem(CONFIG.NUMERO_AUTORIZADO, msg);
  } catch (err) {
    console.error("Erro esquecidas:", err.message);
  }
}

// ── Inicializa cron jobs ──────────────────────────────────────────
function iniciarCronJobs() {
  cron.schedule("0 11 * * *",   enviarResumoDiario,       { timezone: "America/Campo_Grande" }); // 7h
  cron.schedule("*/15 * * * *", verificarLembretes,       { timezone: "America/Campo_Grande" }); // 15min
  cron.schedule("0 0 * * *",    verificarTarefasVencidas, { timezone: "America/Campo_Grande" }); // 20h
  cron.schedule("0 13 * * 1",   verificarTarefasEsquecidas, { timezone: "America/Campo_Grande" }); // seg 9h
  console.log("✅ Cron jobs: resumo 7h | lembretes 15min | vencidas 20h | esquecidas seg 9h");
}

module.exports = { iniciarCronJobs };
