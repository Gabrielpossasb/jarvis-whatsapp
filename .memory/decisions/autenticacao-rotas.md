# Autenticação por token nas rotas web da API

**Contexto:** as rotas `/api/mensagem`, `/api/mensagem/arquivo`, `/api/audio/transcrever`, `/api/extrato/analisar` e `/api/extrato/confirmar` eram públicas — qualquer um com a URL do Railway podia disparar chamadas pagas ao GPT e escrever no Supabase.

**Decisão:** middleware `autenticarWeb` (em `index.js:28-34`) exige header `x-jarvis-token` em todas essas rotas. Token lido de `process.env.JARVIS_API_TOKEN` (Railway) e `VITE_JARVIS_TOKEN` (Vercel).

Rotas intencionalmente sem auth: `GET /`, `POST /webhook` (Evolution API não manda token), `GET /api/uso`, `GET/PUT /api/config`, rotas de categorias e exportar.

**Por quê:** sem auth, qualquer requisição não autorizada consome créditos pagos da OpenAI e pode corromper o banco.

**Referências:** `index.js:28-40`, `jarvis-web/src/` (todas as chamadas à API incluem o header)
