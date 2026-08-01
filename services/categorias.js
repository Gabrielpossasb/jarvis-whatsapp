// ─────────────────────────────────────────────
//  services/categorias.js — Categorias via Supabase
// ─────────────────────────────────────────────

const { supabase } = require("./supabase");

// Cache local com TTL de 5 minutos, uma entrada por tipo
const cache = {}; // { [tipo]: { dados, timestamp } }
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

// Retorna objeto { Nome: Emoji } — usa cache. tipo: "tarefa" | "gasto" | "ganho"
async function getCategorias(tipo = "tarefa") {
  const agora = Date.now();
  const entrada = cache[tipo];
  if (entrada && agora - entrada.timestamp < CACHE_TTL) return entrada.dados;

  const { data, error } = await supabase
    .from("categorias")
    .select("nome, emoji")
    .eq("tipo", tipo)
    .order("nome");

  if (error) throw error;

  const categorias = {};
  for (const row of data) {
    categorias[row.nome] = row.emoji || "📌";
  }

  cache[tipo] = { dados: categorias, timestamp: agora };
  return categorias;
}

// Retorna lista de nomes para uso no prompt
async function getListaCategorias(tipo = "tarefa") {
  const categorias = await getCategorias(tipo);
  return Object.keys(categorias).join(", ");
}

// Adiciona nova categoria
async function adicionarCategoria(nome, emoji, tipo = "tarefa") {
  const categorias = await getCategorias(tipo);
  if (categorias[nome]) return false; // já existe nesse tipo

  const { error } = await supabase
    .from("categorias")
    .insert([{ nome, emoji: emoji || "📌", tipo }]);

  if (error) throw error;

  delete cache[tipo]; // invalida cache desse tipo
  return true;
}

// Retorna emoji de uma categoria
async function getEmoji(categoria, tipo = "tarefa") {
  const categorias = await getCategorias(tipo);
  return categorias[categoria] || "📌";
}

// Lista categorias com id/tipo (pra tela de Configurações) — sem cache, é uma tela de gestão
async function listarTodas(tipo) {
  let query = supabase.from("categorias").select("id, nome, emoji, tipo").order("tipo").order("nome");
  if (tipo) query = query.eq("tipo", tipo);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

module.exports = { inicializarCategorias, getCategorias, getListaCategorias, adicionarCategoria, getEmoji, listarTodas };
