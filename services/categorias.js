// ─────────────────────────────────────────────
//  services/categorias.js — Categorias dinâmicas
// ─────────────────────────────────────────────

const { google } = require("googleapis");
const { CONFIG } = require("../config");

// Cache local com TTL de 5 minutos
let cache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

// Categorias padrão (usadas na inicialização)
const CATEGORIAS_PADRAO = [
  { nome: "Casa",       emoji: "🏠" },
  { nome: "Elétrica",   emoji: "⚡" },
  { nome: "Chácara",    emoji: "🌿" },
  { nome: "Faculdade",  emoji: "🎓" },
  { nome: "Trabalho",   emoji: "💼" },
  { nome: "Pessoal",    emoji: "👤" },
  { nome: "Saúde",      emoji: "🏥" },
  { nome: "Financeiro", emoji: "💰" },
  { nome: "Outros",     emoji: "📌" },
];

let _sheetsClient = null;
async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: CONFIG.GOOGLE_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _sheetsClient = google.sheets({ version: "v4", auth });
  return _sheetsClient;
}

// Inicializa aba Categorias com padrões se não existir
async function inicializarCategorias() {
  const sheets = await getSheetsClient();
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID });
    const abas = meta.data.sheets.map(s => s.properties.title);

    if (!abas.includes("Categorias")) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: "Categorias" } } }] },
      });

      // Popula com categorias padrão
      const valores = [
        ["Nome", "Emoji"],
        ...CATEGORIAS_PADRAO.map(c => [c.nome, c.emoji])
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
        range: `Categorias!A1:B${valores.length}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: valores },
      });
      console.log("Aba Categorias criada com padrões!");
    }
  } catch (e) {
    console.error("Erro ao inicializar categorias:", e.message);
  }
}

// Retorna objeto { Nome: Emoji } — usa cache
async function getCategorias() {
  const agora = Date.now();
  if (cache && agora - cacheTimestamp < CACHE_TTL) return cache;

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: "Categorias!A:B",
  });

  const rows = res.data.values || [];
  const categorias = {};
  for (const row of rows.slice(1)) {
    if (row[0]) categorias[row[0]] = row[1] || "📌";
  }

  cache = categorias;
  cacheTimestamp = agora;
  return categorias;
}

// Retorna lista de nomes para uso no prompt
async function getListaCategorias() {
  const categorias = await getCategorias();
  return Object.keys(categorias).join(", ");
}

// Adiciona nova categoria
async function adicionarCategoria(nome, emoji) {
  const sheets = await getSheetsClient();
  const categorias = await getCategorias();

  if (categorias[nome]) return false; // já existe

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: "Categorias!A:B",
  });
  const proximaLinha = (res.data.values || []).length + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: `Categorias!A${proximaLinha}:B${proximaLinha}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[nome, emoji || "📌"]] },
  });

  // Invalida cache
  cache = null;
  return true;
}

// Retorna emoji de uma categoria
async function getEmoji(categoria) {
  const categorias = await getCategorias();
  return categorias[categoria] || "📌";
}

module.exports = { inicializarCategorias, getCategorias, getListaCategorias, adicionarCategoria, getEmoji };
