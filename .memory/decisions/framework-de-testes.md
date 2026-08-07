# Framework de testes: Jest com mocks obrigatórios

**Contexto:** antes da auditoria não havia nenhum teste automatizado no backend.

**Decisão:** Jest com `testEnvironment: node`, CommonJS (sem Babel). 34 testes em:
- `tests/pure.test.js` — funções puras (parsear, normalizar, datas, formatar) + críticas com mock de Supabase (verificar duplicatas do extrato, contagem de estoque)
- `tests/estoque.test.js` — `processarContagemEstoque` com mock de Supabase
- `tests/faculdade.test.js` — `processarEventoFaculdadeUnico`, `processarEventoFaculdadeIntervalo` com mock

**Regras:**
- Nenhum teste pode chamar a API da OpenAI ou Evolution API de verdade (custo e efeito colateral).
- Nenhum teste pode escrever no Supabase de verdade.
- `npm test` deve passar antes de qualquer commit.

**Por quê:** `verificarDuplicatasExtrato` é lógica crítica — bug aqui gera dado financeiro duplicado silenciosamente. Refatorações estruturais (P6, P7, P8) só foram seguras porque os 34 testes validaram antes e depois.

**Referências:** `package.json` (`"test": "jest"`), `jest.config.js`, `tests/`
