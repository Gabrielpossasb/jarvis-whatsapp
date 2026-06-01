// ─────────────────────────────────────────────
//  services/categorias.js — Categorias via Supabase
// ─────────────────────────────────────────────

const { supabase } = require("./supabase");

// Cache local com TTL de 5 minutos
let cache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

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

// Inicializa categorias padrão se tabela estiver vazia
async function inicializarCategorias() {
  try {
    const { data, error } = await supabase.from("categorias").select("id").limit(1);
    if (error) throw error;

    if (!data || data.length === 0) {
      const { error: insertError } = await supabase
        .from("categorias")
        .insert(CATEGORIAS_PADRAO);
      if (insertError) throw insertError;
      console.log("✅ Categorias padrão inseridas!");
    }
    console.log("Categorias OK!");
  } catch (e) {
    console.error("Erro ao inicializar categorias:", e.message);
  }
}

// Retorna objeto { Nome: Emoji } — usa cache
async function getCategorias() {
  const agora = Date.now();
  if (cache && agora - cacheTimestamp < CACHE_TTL) return cache;

  const { data, error } = await supabase
    .from("categorias")
    .select("nome, emoji")
    .order("nome");

  if (error) throw error;

  const categorias = {};
  for (const row of data) {
    categorias[row.nome] = row.emoji || "📌";
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
  const categorias = await getCategorias();
  if (categorias[nome]) return false; // já existe

  const { error } = await supabase
    .from("categorias")
    .insert([{ nome, emoji: emoji || "📌" }]);

  if (error) throw error;

  cache = null; // invalida cache
  return true;
}

// Retorna emoji de uma categoria
async function getEmoji(categoria) {
  const categorias = await getCategorias();
  return categorias[categoria] || "📌";
}

module.exports = { inicializarCategorias, getCategorias, getListaCategorias, adicionarCategoria, getEmoji };
