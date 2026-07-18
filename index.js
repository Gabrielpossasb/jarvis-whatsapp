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
const { inicializarPlanilhaTarefas } = require("./services/sheets");
const { inicializarCategorias } = require("./services/categorias");
const { limparEstadosAntigos } = require("./services/pending-states");
const { formatarData, formatarHora } = require("./utils/date");

const app = express();
app.use(cors({ origin: true }));
app.options("*", cors({ origin: true }));
app.use(express.json({ limit: "50mb" }));

app.post("/webhook", handleWebhook);
app.post("/api/mensagem", handleWebChat);
app.post("/api/mensagem/arquivo", handleMensagemArquivo);
app.post("/api/audio/transcrever", handleTranscricaoAudio);
app.post("/api/extrato/analisar", handleExtratoUpload);
app.post("/api/extrato/confirmar", handleExtratoConfirmar);
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
  await inicializarPlanilhaTarefas();
  await inicializarCategorias();
  await limparEstadosAntigos();
  const config = await buscarConfig();
  iniciarCronJobs(config);
  console.log("✅ JARVIS pronto!");
});
