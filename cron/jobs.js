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

const DIAS_NOME_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const TIPO_EMOJI_FAC = { prova: "📝", atividade: "📋", ead: "💻", aviso: "📢" };

// ── Resumo diário matinal ─────────────────────────────────────────
async function enviarResumoDiario() {
  const agr = agora();
  const dataHoje = formatarData(agr);
  const isoHoje = `${agr.getFullYear()}-${String(agr.getMonth() + 1).padStart(2, "0")}-${String(agr.getDate()).padStart(2, "0")}`;
  const nomeDia = DIAS_NOME_PT[agr.getDay()];

  const tarefas = await buscarTarefasDoDia(dataHoje);

  const { supabase } = require("../services/supabase");

  // Aulas de hoje (do banco, dinâmico)
  let aulasHoje = [];
  try {
    const { data } = await supabase
      .from("faculdade_aulas")
      .select("disciplina, inicio, fim")
      .eq("dia", agr.getDay())
      .eq("ativo", true)
      .order("inicio");
    aulasHoje = data || [];
  } catch (_) { /* tabela ainda não criada */ }

  // Eventos acadêmicos de hoje
  let eventos = [];
  try {
    const { data } = await supabase
      .from("faculdade_eventos")
      .select("*")
      .eq("data", isoHoje)
      .eq("concluido", false)
      .order("hora", { ascending: true, nullsFirst: false });
    eventos = data || [];
  } catch (_) { /* tabela ainda não criada */ }

  const temAulas = aulasHoje.length > 0;
  const temTarefas = tarefas.length > 0;
  const eventosAcad = eventos.filter(e => e.tipo !== "ead");
  const temEventos = eventosAcad.length > 0;

  if (!temAulas && !temTarefas && !temEventos) {
    await enviarMensagem(CONFIG.NUMERO_AUTORIZADO,
      `🌅 *Bom dia, Gabriel!*\n${nomeDia}, ${dataHoje}\n\nDia livre — sem aulas nem tarefas! 🎉`);
    await enviarPush("🌅 Bom dia, Gabriel!", "Dia livre! 🎉");
    return;
  }

  let msg = `🌅 *Bom dia, Gabriel!*\n*${nomeDia}, ${dataHoje}*\n`;

  // Aulas do dia
  if (temAulas) {
    msg += `\n📚 *Aulas de hoje:*\n`;
    for (const a of aulasHoje) {
      const isEAD = eventos.some(e =>
        e.tipo === "ead" && (!e.disciplina || e.disciplina === a.disciplina)
      );
      msg += `🎓 ${a.inicio}–${a.fim} — ${a.disciplina}${isEAD ? " 💻 _(EAD)_" : ""}\n`;
    }
  }

  // Provas / atividades / avisos do dia
  if (temEventos) {
    msg += `\n⚠️ *Compromissos acadêmicos:*\n`;
    for (const e of eventosAcad) {
      const emoji = TIPO_EMOJI_FAC[e.tipo] || "📅";
      const hora = e.hora ? ` às ${e.hora.slice(0, 5)}` : "";
      const disc = e.disciplina ? ` — ${e.disciplina}` : "";
      msg += `${emoji} *${e.titulo}*${disc}${hora}\n`;
    }
  }

  // Tarefas do dia agrupadas por categoria
  if (temTarefas) {
    const porCategoria = {};
    for (const t of tarefas) {
      const cat = t.categoria || "Outros";
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(t);
    }
    msg += `\n✅ *Tarefas de hoje:*\n`;
    for (const [categoria, itens] of Object.entries(porCategoria)) {
      const emoji = await getEmoji(categoria);
      msg += `\n${emoji} *${categoria}*\n`;
      const semHorario = itens.filter(t => !t.hora);
      const comHorario = itens.filter(t => t.hora).sort((a, b) => a.hora.localeCompare(b.hora));
      for (const t of semHorario) msg += `📌 ${t.descricao}\n`;
      for (const t of comHorario) msg += `⏰ ${t.hora} — ${t.descricao}\n`;
    }
  }

  msg += `\nBora! 💪`;
  await enviarMensagem(CONFIG.NUMERO_AUTORIZADO, msg);

  const resumoPush = [
    temAulas ? `${aulasHoje.length} aula(s)` : null,
    temEventos ? `${eventosAcad.length} compromisso(s)` : null,
    temTarefas ? `${tarefas.length} tarefa(s)` : null,
  ].filter(Boolean).join(" • ");
  await enviarPush("🌅 Bom dia, Gabriel!", resumoPush);
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
