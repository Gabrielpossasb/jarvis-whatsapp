// ─────────────────────────────────────────────
//  services/sheets.js — Tarefas e Gastos via Supabase
// ─────────────────────────────────────────────

const { supabase } = require("./supabase");
const { MESES, DIAS_SEMANA } = require("../config");
const { agora, formatarData } = require("../utils/date");

// Cache de tarefas
let _tarefasCache = null;
let _tarefasCacheTime = 0;
const TAREFAS_CACHE_TTL = 30 * 1000;

function invalidarCacheTarefas() {
  _tarefasCache = null;
}

// ════════════════════════════════════════════
//  INICIALIZAÇÃO
// ════════════════════════════════════════════
async function inicializarPlanilhaTarefas() {
  // Com Supabase a tabela já existe — só confirma conexão
  try {
    const { error } = await supabase.from("tarefas").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Tabela tarefas OK!");
  } catch (e) {
    console.error("Erro ao verificar tabela tarefas:", e.message);
  }
}

// ════════════════════════════════════════════
//  GASTOS
// ════════════════════════════════════════════
async function adicionarGasto(data, descricao, valor, meioPagamento, categoria, tipo) {
  const mes = MESES[agora().getMonth()];
  const { error } = await supabase.from("gastos").insert([{
    data,
    descricao,
    valor,
    meio_pagamento: meioPagamento,
    categoria,
    tipo,
    mes,
  }]);
  if (error) throw error;
}

// ════════════════════════════════════════════
//  TAREFAS
// ════════════════════════════════════════════
async function buscarTodasTarefas() {
  const now = Date.now();
  if (_tarefasCache && (now - _tarefasCacheTime) < TAREFAS_CACHE_TTL) return _tarefasCache;

  const { data, error } = await supabase
    .from("tarefas")
    .select("*")
    .order("id");

  if (error) throw error;

  // Mapeia para o mesmo formato usado no resto do código
  _tarefasCache = (data || []).map(row => ({
    linha:           row.id,
    descricao:       row.descricao || "",
    data:            row.data || "",
    hora:            row.hora || "",
    recorrente:      row.recorrente || "Não",
    status:          row.status || "Pendente",
    lembreteEnviado: row.lembrete_enviado || "Não",
    categoria:       row.categoria || "Outros",
    dataCriacao:     row.data_criacao || "",
    diasLembrete:    row.dias_lembrete || "",
    horaLembrete:    row.hora_lembrete || "",
    dataConclusao:   row.data_conclusao || "",
  }));
  _tarefasCacheTime = now;
  return _tarefasCache;
}

async function adicionarTarefa(descricao, data, hora, recorrente, categoria, diasLembrete, horaLembrete) {
  invalidarCacheTarefas();
  const { error } = await supabase.from("tarefas").insert([{
    descricao,
    data,
    hora: hora || "",
    recorrente: recorrente || "Não",
    status: "Pendente",
    lembrete_enviado: "Não",
    categoria: categoria || "Outros",
    data_criacao: formatarData(),
    dias_lembrete: diasLembrete || "",
    hora_lembrete: horaLembrete || "",
    data_conclusao: "",
  }]);
  if (error) throw error;
}

function recorreBateDia(recorrente, diaHoje) {
  if (!recorrente || recorrente === "Não") return false;
  const dias = recorrente.toLowerCase().split(",").map(d => d.trim());
  return dias.some(d => diaHoje.includes(d) || d.includes(diaHoje));
}

async function buscarTarefasDoDia(dataStr) {
  const tarefas = await buscarTodasTarefas();
  const diaHoje = DIAS_SEMANA[agora().getDay()];
  const hoje = formatarData();

  return tarefas.filter(t => {
    if (t.status === "Concluída") return false;
    if (t.data === "backlog") return false;
    if (t.recorrente && t.recorrente !== "Não") {
      if (t.dataConclusao === hoje) return false;
      return recorreBateDia(t.recorrente, diaHoje);
    }
    return t.data.replace(/\.$/, "") === dataStr;
  });
}

async function buscarTarefasConcluidasHoje() {
  const tarefas = await buscarTodasTarefas();
  const hoje = formatarData();
  return tarefas.filter(t => t.dataConclusao === hoje);
}

async function buscarTarefasComLembreteHoje() {
  const tarefas = await buscarTodasTarefas();
  const diaHoje = DIAS_SEMANA[agora().getDay()];
  return tarefas.filter(t => {
    if (t.status === "Concluída") return false;
    if (!t.diasLembrete || !t.horaLembrete) return false;
    return recorreBateDia(t.diasLembrete, diaHoje);
  });
}

async function buscarBacklog() {
  const tarefas = await buscarTodasTarefas();
  return tarefas.filter(t => t.data === "backlog" && t.status !== "Concluída");
}

async function buscarTarefasPorPeriodo(periodo, categoria) {
  const { amanha } = require("../utils/date");
  let tarefas;

  if (periodo === "backlog") tarefas = await buscarBacklog();
  else if (periodo === "amanhã" || periodo === "amanha") tarefas = await buscarTarefasDoDia(amanha());
  else if (periodo === "hoje") tarefas = await buscarTarefasDoDia(formatarData());
  else tarefas = await buscarTarefasDoDia(periodo);

  if (!categoria || categoria === "todas") return tarefas;
  return tarefas.filter(t => t.categoria.toLowerCase() === categoria.toLowerCase());
}

async function buscarTarefasVencidas() {
  const tarefas = await buscarTodasTarefas();
  const hoje = agora();
  const MESES_MAP = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};

  return tarefas.filter(t => {
    if (t.status === "Concluída") return false;
    if (t.data === "backlog" || t.recorrente !== "Não" || !t.data) return false;
    const partes = t.data.split("/");
    if (partes.length !== 2) return false;
    const dia = parseInt(partes[0]);
    const mes = MESES_MAP[partes[1].toLowerCase()];
    if (isNaN(dia) || mes === undefined) return false;
    const dataTarefa = new Date(hoje.getFullYear(), mes, dia);
    const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return dataTarefa < hojeZerado;
  });
}

async function buscarTarefasEsquecidas() {
  const tarefas = await buscarTodasTarefas();
  const hoje = agora();
  const MESES_MAP = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};

  return tarefas.filter(t => {
    if (t.status === "Concluída") return false;
    if (!t.dataCriacao) return false;
    const partes = t.dataCriacao.split("/");
    if (partes.length !== 2) return false;
    const dia = parseInt(partes[0]);
    const mes = MESES_MAP[partes[1].toLowerCase()];
    if (isNaN(dia) || mes === undefined) return false;
    const dataCriacao = new Date(hoje.getFullYear(), mes, dia);
    return (hoje - dataCriacao) / (1000 * 60 * 60 * 24) >= 7;
  });
}

async function concluirTarefa(linha) {
  invalidarCacheTarefas();
  const { error } = await supabase
    .from("tarefas")
    .update({ status: "Concluída" })
    .eq("id", linha);
  if (error) throw error;
}

async function concluirTarefaDoDia(linha) {
  invalidarCacheTarefas();
  const { error } = await supabase
    .from("tarefas")
    .update({ data_conclusao: formatarData() })
    .eq("id", linha);
  if (error) throw error;
}

async function excluirTarefa(linha) {
  invalidarCacheTarefas();
  const { error } = await supabase
    .from("tarefas")
    .delete()
    .eq("id", linha);
  if (error) throw error;
}

async function alterarCategoriaTarefa(linha, novaCategoria) {
  invalidarCacheTarefas();
  const { error } = await supabase
    .from("tarefas")
    .update({ categoria: novaCategoria })
    .eq("id", linha);
  if (error) throw error;
}

async function alterarTarefa(linha, campos) {
  invalidarCacheTarefas();
  const COL_MAP = {
    data: "data",
    hora: "hora",
    diasLembrete: "dias_lembrete",
    horaLembrete: "hora_lembrete",
  };

  const update = {};
  for (const [campo, valor] of Object.entries(campos)) {
    const col = COL_MAP[campo];
    if (col) update[col] = valor;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("tarefas")
    .update(update)
    .eq("id", linha);
  if (error) throw error;
}

async function marcarLembreteEnviado(linha, valor) {
  invalidarCacheTarefas();
  const { error } = await supabase
    .from("tarefas")
    .update({ lembrete_enviado: valor || "Sim" })
    .eq("id", linha);
  if (error) throw error;
}

module.exports = {
  adicionarGasto,
  inicializarPlanilhaTarefas,
  invalidarCacheTarefas,
  adicionarTarefa,
  buscarTodasTarefas,
  buscarTarefasDoDia,
  buscarTarefasConcluidasHoje,
  buscarTarefasComLembreteHoje,
  buscarBacklog,
  buscarTarefasPorPeriodo,
  buscarTarefasVencidas,
  buscarTarefasEsquecidas,
  concluirTarefa,
  concluirTarefaDoDia,
  excluirTarefa,
  alterarCategoriaTarefa,
  alterarTarefa,
  marcarLembreteEnviado,
};
