# Dependência circular ao mover require() para o topo

**Contexto:** `require(supabase)` aparecia dentro do corpo de funções em vários módulos, escondendo a dependência. A P8 da auditoria os moveu para o topo.

**Pegadinha:** em Node.js CommonJS, se A require B e B require A, o módulo que chega por último recebe um objeto vazio `{}`. Colocar o require dentro de uma função adia a resolução para depois que o ciclo está quebrado — pode ser intencional.

**Como detectar:** se após mover um `require` para o topo o módulo retornar `undefined` ou uma função sumir, é dependência circular. Reverta esse require específico e investigue com `node -e "require('./arquivo')"`.

**No JARVIS (P8):** nenhum ciclo apareceu porque `services/supabase.js` é folha — não importa nenhum handler. Mas a regra vale para outros módulos.

**Referências:** `handlers/estoque.js:5`, `handlers/faculdade.js:5`, `handlers/webhook.js:6`
