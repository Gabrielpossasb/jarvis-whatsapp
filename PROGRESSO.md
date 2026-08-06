# Auditoria JARVIS — Progresso

Ordem de execução aprovada pelo Gabriel. Uma etapa por vez, commit pequeno, diff antes de commitar.

---

## Etapas

### ✅ P1 + P2 + P3 — commit `d789a32`
- **P1** — Remove `console.log("TABELA DATAS:...")` que vazava para stdout em produção a cada mensagem recebida (`services/openai.js`)
- **P2** — Centraliza nomes de modelos em `config.js` como `MODELOS = { rapido, visao, audio }`. Substitui 11 strings literais em `services/openai.js`. Trocar de LLM agora é uma mudança de uma linha.
- **P3** — Elimina 5 instâncias `new OpenAI(...)` criadas dentro de funções individuais. Todas usam o cliente único instanciado no topo do módulo (`services/openai.js:12`).

---

### ✅ P5 — Auth no `POST /api/mensagem` — commit `b382efd`
Qualquer um que conheça a URL do Railway pode disparar chamadas pagas ao GPT e escrever no Supabase.
- Adicionar middleware de token compartilhado (header `x-jarvis-token`) nas rotas web: `/api/mensagem`, `/api/mensagem/arquivo`, `/api/audio/transcrever`
- Token lido de variável de ambiente `JARVIS_API_TOKEN` (adicionar no Railway)
- Confirmar que `jarvis-web` continua chamando a API com o token (verificar `Chat.jsx`, `Gastos.jsx`, `Faculdade.jsx`, `Configuracoes.jsx`)
- Rotas públicas que ficam sem auth: `GET /`, `POST /webhook` (a Evolution API não manda token), `GET /api/uso`, `GET /api/config`, `PUT /api/config`, rotas de categorias e exportar

---

### ⬜ P4 — Testes com Jest ← **próxima etapa**
Configurar Jest no backend. **Não parar nas funções puras** — elas são o aquecimento. As que mais importam (com mock de Supabase) devem ser cobertas nesta etapa, antes de qualquer refatoração estrutural.

Funções puras (sem mock, aquecimento):
- `parsearContagemEstoque` — `handlers/webhook.js:225`
- `datasNoIntervalo` — `handlers/webhook.js:334`
- `formatarMsgExtrato` — `handlers/webhook.js:77`
- `normalizarNome` — `handlers/webhook.js:240`

**Funções críticas com mock de Supabase (prioridade máxima):**
- `verificarDuplicatasExtrato` — bug aqui = dado financeiro duplicado no banco
- `processarContagemEstoque` — atualização em massa de estoque, erro silencioso é grave

Adicionar `"test": "jest"` no `package.json` e documentar `npm test` no CLAUDE.md.

---

### ⬜ P6 — Extrair lógica de estoque para `handlers/estoque.js`
`handlers/webhook.js` tem 1202 linhas com 6 responsabilidades. Extrair primeiro o domínio de estoque (menor, mais isolado):
- `parsearContagemEstoque`, `normalizarNome`, `processarContagemEstoque` → `handlers/estoque.js`
- Rodar testes antes e depois para confirmar que nada quebrou

---

### ⬜ P7 — Extrair lógica de faculdade para `handlers/faculdade.js`
Maior extração do webhook.js:
- `podeSerEventoFaculdade`, `buscarDisciplinas`, `detectarEventoFaculdade`
- `ddmm`, `datasNoIntervalo`
- `processarEventoFaculdadeUnico`, `processarEventoFaculdadeIntervalo`, `processarEventoFaculdadeNota`, `processarEventoFaculdadeFormula`, `processarEventoFaculdadeAula`
- `despacharEventoFaculdade`, `processarPlanoFaculdade`, `detectarPlanoFaculdadeDeArquivo`
- Rodar testes antes e depois

---

### ⬜ P8 — Mover `require(supabase)` para o topo dos arquivos
`const { supabase } = require("../services/supabase")` aparece dentro do corpo de funções em `handlers/webhook.js` (linhas ~245, ~350, ~430, etc.) escondendo a dependência.

**⚠️ Cuidado com dependência circular:** alguns `require` dentro de função podem estar lá justamente para quebrar um ciclo. Procedimento obrigatório:
1. Rodar testes antes de mover qualquer `require`
2. Mover um por vez
3. Se aparecer `undefined` ou erro de circular, reverter aquele específico e avisar o Gabriel — não forçar

---

### ⬜ P9 — Atualizar CLAUDE.md
- Adicionar seção de segurança para agentes: não tocar em `.env`, sempre commit pequeno, rodar `npm test` antes de cada commit
- Adicionar pointer: "nomes de modelos de LLM ficam em `config.js` → `MODELOS`"
- Adicionar o comando `npm test` na seção Comandos

---

## Regras para todas as etapas
- Mostrar diff para aprovação antes de commitar
- Commit pequeno por etapa com mensagem clara
- Rodar testes (assim que existirem no P4) antes de cada commit
- Nunca tocar em `.env` ou credenciais
