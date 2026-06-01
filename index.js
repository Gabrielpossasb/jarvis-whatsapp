// ─────────────────────────────────────────────
//  index.js — Inicialização do JARVIS
// ─────────────────────────────────────────────

const express = require("express");
const { handleWebhook } = require("./handlers/webhook");
const { iniciarCronJobs } = require("./cron/jobs");
const { inicializarPlanilhaTarefas } = require("./services/sheets");
const { inicializarCategorias } = require("./services/categorias");
const { formatarData, formatarHora } = require("./utils/date");

const app = express();
app.use(express.json({ limit: "50mb" }));

app.post("/webhook", handleWebhook);
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, contexto } = req.body;
    const OpenAI = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Você é o JARVIS, assistente pessoal inteligente. Responda em português de forma concisa.\n\nContexto:\n${contexto}` },
        ...messages,
      ],
      max_tokens: 1000,
    });
    res.json({ texto: response.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});
app.get("/", (req, res) => res.json({ status: "JARVIS online 🤖", hora: formatarHora(), data: formatarData() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`JARVIS na porta ${PORT}`);
  await inicializarPlanilhaTarefas();
  await inicializarCategorias();
  iniciarCronJobs();
  console.log("✅ JARVIS pronto!");
});
