# Extração de domínios para módulos handlers separados

**Contexto:** `handlers/webhook.js` tinha ~1200 linhas com lógica de estoque, faculdade, extrato, tarefas e gastos misturadas.

**Decisão:** domínios extraídos para handlers próprios:
- `handlers/estoque.js` — `parsearContagemEstoque`, `normalizarNome`, `processarContagemEstoque`
- `handlers/faculdade.js` — 13 funções (detecção, CRUD de eventos, grade de aulas, plano de ensino)

`webhook.js` importa os três pontos de entrada via `require("./estoque")` e `require("./faculdade")`.

**Por quê:** permite testar cada domínio isoladamente com mock de Supabase. `webhook.js` ficou em ~570 linhas focadas no fluxo de conversa.

**Referências:** `handlers/estoque.js`, `handlers/faculdade.js`, `handlers/webhook.js:7-8`, `tests/pure.test.js`
