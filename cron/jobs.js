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
const { executarComLog } = require("../services/cron-logs");
const { limparEstadosAntigos } = require("../services/pending-states");
const { enviarPush } = require("../services/push");

// ── Resumo diário às 7h ───────────────────────────────────────────
async function enviarResumoDiario() {
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
  await enviarPush("🗓️ Bom dia, Gabriel!", `${tarefas.length} tarefa(s) para hoje`);
}

// ── Lembretes a cada 15min ────────────────────────────────────────
async function verificarLembretes() {
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
      await enviarPush("⏰ Lembrete JARVIS", t.descricao);
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
    await enviarPush("🔔 Lembrete JARVIS", t.descricao);
    await marcarLembreteEnviado(t.linha, dataHoje);
  }
}

// ── Tarefas vencidas às 20h ───────────────────────────────────────
async function verificarTarefasVencidas() {
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
    await enviarPush("⚠️ Tarefa vencida", t.descricao);
  }
}

// ── Tarefas esquecidas toda segunda às 9h ─────────────────────────
async function verificarTarefasEsquecidas() {
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
}

// ── Limpar logs antigos toda madrugada às 00:05 ──────────────────
async function limparLogsAntigos() {
  const { supabase } = require("../services/supabase");
  const umMesAtras = new Date();
  umMesAtras.setDate(umMesAtras.getDate() - 30);

  const { error } = await supabase
    .from("cron_logs")
    .delete()
    .lt("iniciado_em", umMesAtras.toISOString());

  if (error) {
    throw error;
  }
}
const _tarefas = {};

function _reagendar(nome, expressao, fn, tz) {
  if (_tarefas[nome]) _tarefas[nome].stop();
  _tarefas[nome] = cron.schedule(expressao, fn, { timezone: tz });
}

function iniciarCronJobs(config = {}) {
  const hora = String(parseInt(config.hora_lembrete ?? "6", 10));
  const tz = config.timezone || "America/Campo_Grande";

  _reagendar("resumo-diario",     `0 ${hora} * * *`,  () => executarComLog("resumo-diario", enviarResumoDiario), tz);
  _reagendar("lembrete-gastos",   `0 ${hora} * * *`,  () => executarComLog("lembrete-gastos", () => enviarPush("💰 Lembrete JARVIS", "Não esquece de registrar seus gastos de hoje!")), tz);
  _reagendar("lembretes",         "*/15 * * * *",     () => executarComLog("lembretes", verificarLembretes), tz);
  _reagendar("tarefas-vencidas",  "0 20 * * *",       () => executarComLog("tarefas-vencidas", verificarTarefasVencidas), tz);
  _reagendar("tarefas-esquecidas","0 9 * * 1",        () => executarComLog("tarefas-esquecidas", verificarTarefasEsquecidas), tz);
  _reagendar("limpar-estados",    "1 0 * * *",        () => executarComLog("limpar-estados", limparEstadosAntigos), tz);
  _reagendar("limpar-logs",       "5 0 * * *",        () => executarComLog("limpar-logs", limparLogsAntigos), tz);

  console.log(`✅ Cron jobs: resumo/gastos ${hora}h | lembretes 15min | vencidas 20h | esquecidas seg 9h | limpeza 00:01/05 [tz: ${tz}]`);
}

function atualizarCronJobs(config) {
  iniciarCronJobs(config);
}

module.exports = { iniciarCronJobs, atualizarCronJobs };
