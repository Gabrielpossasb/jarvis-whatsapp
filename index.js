// ─────────────────────────────────────────────
//  index.js — Inicialização do JARVIS
// ─────────────────────────────────────────────

const express = require("express");
const cors = require("cors");
const { handleWebhook, handleWebChat, handleExtratoUpload, handleExtratoConfirmar } = require("./handlers/webhook");
const { iniciarCronJobs } = require("./cron/jobs");
const { inicializarPlanilhaTarefas } = require("./services/sheets");
const { inicializarCategorias } = require("./services/categorias");
const { formatarData, formatarHora } = require("./utils/date");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.post("/webhook", handleWebhook);
app.post("/api/mensagem", handleWebChat);
app.post("/api/extrato/analisar", handleExtratoUpload);
app.post("/api/extrato/confirmar", handleExtratoConfirmar);
app.get("/", (req, res) => res.json({ status: "JARVIS online 🤖", hora: formatarHora(), data: formatarData() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`JARVIS na porta ${PORT}`);
  await inicializarPlanilhaTarefas();
  await inicializarCategorias();
  iniciarCronJobs();
  console.log("✅ JARVIS pronto!");
});
