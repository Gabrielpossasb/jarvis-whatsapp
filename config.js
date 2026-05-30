// ─────────────────────────────────────────────
//  config.js — Configurações do JARVIS
// ─────────────────────────────────────────────

const CONFIG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE || "JARVIS",
  NUMERO_AUTORIZADO: process.env.NUMERO_AUTORIZADO,
  SPREADSHEET_GASTOS_ID: process.env.SPREADSHEET_ID,
  SPREADSHEET_TAREFAS_ID: process.env.SPREADSHEET_TAREFAS_ID,
  GOOGLE_CREDENTIALS: JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}"),
  TIMEZONE: "America/Campo_Grande",
};

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const MESES_CURTOS = [
  "jan","fev","mar","abr","mai","jun",
  "jul","ago","set","out","nov","dez"
];

const DIAS_SEMANA = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];

module.exports = { CONFIG, MESES, MESES_CURTOS, DIAS_SEMANA };
