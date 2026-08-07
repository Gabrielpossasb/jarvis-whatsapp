# Lógica de deduplicação do extrato é crítica — bug = dado duplicado

**Contexto:** `verificarDuplicatasExtrato` (`handlers/webhook.js:41-59`) filtra transações de extrato bancário que já existem no banco antes de inserir.

**Critério de duplicata (verificado no código):**
1. Mesmo `mes`
2. `|valor_novo - valor_existente| < 0.01` (tolerância de centavo)
3. Descrição idêntica (trim+lowercase) OU primeiros 15 chars iguais (para descrições longas ≥ 10 chars)

**Pegadinha:** a lógica dos 15 primeiros chars existe porque extratos bancários às vezes truncam nomes de estabelecimentos diferentemente. Se alterada sem cuidado, pode deixar passar duplicatas reais ou rejeitar transações legítimas similares.

**Regra:** qualquer mudança nessa função exige rodar `npm test` e verificar os testes de `verificarDuplicatasExtrato` em `tests/pure.test.js`.

**Referências:** `handlers/webhook.js:41-59`, `tests/pure.test.js` (suite `verificarDuplicatasExtrato`)
