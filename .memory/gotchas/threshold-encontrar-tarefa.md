# Thresholds de similaridade para busca de tarefas

**Contexto:** `encontrarTarefa` (`handlers/webhook.js:32-39`) busca uma tarefa existente pelo nome mencionado em linguagem natural.

**Thresholds em uso (verificados no código):**
- `encontrarTarefa` → `encontrarSimilar(descBusca, todas, 0.4)` — limiar baixo para aceitar variações grandes
- `encontrarSimilar` default (sem terceiro arg) → `0.6` — usado em outros contextos
- Nota de faculdade (`processarEventoFaculdadeNota`) → `encontrarSimilar(..., 0.35)` — ainda mais permissivo
- Deduplicação de tarefa (`processarClassificacao`) → `encontrarSimilar(..., 0.3)` — mínimo do projeto

**Algoritmo:** `utils/similarity.js` — Jaccard de palavras >2 chars, com atalhos: idêntico=1.0, substring=0.9.

**Pegadinha:** threshold 0.4 em `encontrarTarefa` pode casar a tarefa errada se dois itens tiverem nomes parecidos mas diferentes. Se o usuário reclamar que o bot confundiu tarefas, este é o ponto a investigar.

**Referências:** `handlers/webhook.js:38`, `utils/similarity.js:38`, `handlers/faculdade.js:138`
