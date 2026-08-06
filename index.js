// ─────────────────────────────────────────────
//  index.js — Inicialização do JARVIS
// ─────────────────────────────────────────────

const express = require("express");
const cors = require("cors");
const { handleWebhook, handleWebChat, handleMensagemArquivo, handleTranscricaoAudio, handleExtratoUpload, handleExtratoConfirmar } = require("./handlers/webhook");
const { enviarPush } = require("./services/push");
const { buscarUsoOpenAI } = require("./services/usage");
const { buscarConfig, salvarConfig } = require("./services/config");
const { iniciarCronJobs, atualizarCronJobs } = require("./cron/jobs");
const { supabase } = require("./services/supabase");
const { inicializarTabelaTarefas, buscarTodasTarefas, alterarCategoriaTarefa } = require("./services/tarefas");
const { inicializarCategorias, getListaCategorias, adicionarCategoria, listarTodas } = require("./services/categorias");
const { revisarCategorias, revisarCategoriasGastos, calcularMediaFaculdadeIA } = require("./services/openai");
const { limparEstadosAntigos } = require("./services/pending-states");
const { formatarData, formatarHora } = require("./utils/date");

const app = express();
app.use(cors({ origin: true }));
app.options("*", cors({ origin: true }));
app.use(express.json({ limit: "50mb" }));

app.post("/webhook", handleWebhook);

// Protege rotas que disparam chamadas pagas ao GPT e escrevem no banco.
// Token configurado via JARVIS_API_TOKEN no Railway e VITE_JARVIS_TOKEN no Vercel.
function autenticarWeb(req, res, next) {
  const token = req.headers["x-jarvis-token"];
  if (!token || token !== process.env.JARVIS_API_TOKEN) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  next();
}

app.post("/api/mensagem", autenticarWeb, handleWebChat);
app.post("/api/mensagem/arquivo", autenticarWeb, handleMensagemArquivo);
app.post("/api/audio/transcrever", autenticarWeb, handleTranscricaoAudio);
app.post("/api/extrato/analisar", autenticarWeb, handleExtratoUpload);
app.post("/api/extrato/confirmar", autenticarWeb, handleExtratoConfirmar);
app.get("/api/uso", async (req, res) => {
  const openai = await buscarUsoOpenAI();
  res.json({ openai });
});

app.get("/api/config", async (req, res) => {
  const config = await buscarConfig();
  res.json(config);
});

app.put("/api/config", async (req, res) => {
  const { hora_lembrete, timezone } = req.body;
  const hora = parseInt(hora_lembrete, 10);
  if (isNaN(hora) || hora < 0 || hora > 23) return res.status(400).json({ error: "hora_lembrete inválida" });
  const tzValidas = ["America/Sao_Paulo","America/Campo_Grande","America/Manaus","America/Belem","America/Fortaleza","America/Recife","America/Cuiaba","America/Porto_Velho"];
  if (!tzValidas.includes(timezone)) return res.status(400).json({ error: "timezone inválida" });
  await salvarConfig({ hora_lembrete: String(hora).padStart(2, "0"), timezone });
  atualizarCronJobs({ hora_lembrete: String(hora), timezone });
  res.json({ ok: true });
});

// ── Categorias ──────────────────────────────────────────────────
app.get("/api/categorias", async (req, res) => {
  try {
    const categorias = await listarTodas(req.query.tipo);
    res.json(categorias);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/categorias", async (req, res) => {
  try {
    const { nome, emoji, tipo } = req.body;
    if (!nome || !tipo) return res.status(400).json({ error: "nome e tipo são obrigatórios" });
    if (!["tarefa", "gasto", "ganho"].includes(tipo)) return res.status(400).json({ error: "tipo inválido" });
    const criada = await adicionarCategoria(nome, emoji, tipo);
    if (!criada) return res.status(409).json({ error: `A categoria "${nome}" já existe nesse tipo` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Revisão de categorias (tarefas) — sem estado pendente, sugestões voltam direto ──
app.post("/api/tarefas/revisar-categorias", async (req, res) => {
  try {
    const tarefas = await buscarTodasTarefas();
    const pendentes = tarefas.filter(t => t.status !== "Concluída");
    if (pendentes.length === 0) return res.json({ sugestoes: [] });

    const listaCats = await getListaCategorias("tarefa");
    const sugestoes = await revisarCategorias(pendentes, listaCats);
    const sugestoesComLinha = sugestoes.map(s => ({ ...s, linha: pendentes[s.numero - 1]?.linha }));
    res.json({ sugestoes: sugestoesComLinha });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tarefas/aplicar-categorias", async (req, res) => {
  try {
    const aplicar = req.body.aplicar || [];
    for (const s of aplicar) {
      if (s.linha) await alterarCategoriaTarefa(s.linha, s.categoriaSugerida);
    }
    res.json({ aplicadas: aplicar.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Revisão de categorias (gastos/ganhos do mês) ──
app.post("/api/gastos/revisar-categorias", async (req, res) => {
  try {
    const mes = req.query.mes;
    let query = supabase.from("gastos").select("id, descricao, categoria, natureza").order("id");
    if (mes) query = query.eq("mes", mes);
    const { data: gastos, error } = await query;
    if (error) throw error;
    if (!gastos || gastos.length === 0) return res.json({ sugestoes: [] });

    const [listaGasto, listaGanho] = await Promise.all([
      getListaCategorias("gasto"),
      getListaCategorias("ganho"),
    ]);
    const sugestoes = await revisarCategoriasGastos(gastos, listaGasto, listaGanho);
    const sugestoesComId = sugestoes.map(s => ({ ...s, id: gastos[s.numero - 1]?.id }));
    res.json({ sugestoes: sugestoesComId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/gastos/aplicar-categorias", async (req, res) => {
  try {
    const aplicar = req.body.aplicar || [];
    for (const s of aplicar) {
      if (s.id) await supabase.from("gastos").update({ categoria: s.categoriaSugerida }).eq("id", s.id);
    }
    res.json({ aplicadas: aplicar.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Faculdade — notas e média de uma disciplina ──────────────────
app.get("/api/faculdade/:disciplina/media", async (req, res) => {
  try {
    const disciplina = req.params.disciplina;
    const [{ data: eventos, error: errEventos }, { data: disc, error: errDisc }] = await Promise.all([
      supabase.from("faculdade_eventos").select("id, tipo, titulo, data, hora, nota, peso").eq("disciplina", disciplina).order("data"),
      supabase.from("faculdade_disciplinas").select("formula_media").eq("nome", disciplina).maybeSingle(),
    ]);
    if (errEventos) throw errEventos;
    if (errDisc) throw errDisc;

    const formulaMedia = disc?.formula_media || null;
    const temNota = (eventos || []).some(e => e.nota !== null && e.nota !== undefined);

    let media = { media_atual: null, notas_faltando: "", resumo: "" };
    if (formulaMedia && temNota) {
      media = await calcularMediaFaculdadeIA(disciplina, formulaMedia, eventos || []);
    }

    res.json({ eventos: eventos || [], formula_media: formulaMedia, ...media });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/gastos/exportar", async (req, res) => {
  const mes = req.query.mes;
  let query = supabase.from("gastos").select("data, descricao, valor, categoria, meio_pagamento, tipo, natureza, mes").order("data", { ascending: true });
  if (mes) query = query.eq("mes", mes);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get("/", (req, res) => res.json({ status: "JARVIS online 🤖", hora: formatarHora(), data: formatarData() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`JARVIS na porta ${PORT}`);
  await inicializarTabelaTarefas();
  await inicializarCategorias();
  await limparEstadosAntigos();
  const config = await buscarConfig();
  iniciarCronJobs(config);
  console.log("✅ JARVIS pronto!");
});
