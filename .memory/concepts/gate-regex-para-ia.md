# Padrão: gate regex antes de chamar a IA

**Contexto:** cada chamada à OpenAI custa tokens e adiciona latência. Nem toda mensagem precisa de IA.

**Padrão adotado no JARVIS:**
1. Regex rápido (síncrono, sem custo) testa se a mensagem parece pertencer ao domínio.
2. Só se passar: chama a IA para extrair o JSON estruturado.

**Exemplo de referência no código** (`handlers/faculdade.js:14-17`):
```js
function podeSerEventoFaculdade(texto) {
  const norm = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /\b(prova|atividade|trabalho|ead|aula online|...|grade)\b/.test(norm);
}
```
`detectarEventoFaculdade` chama `podeSerEventoFaculdade` e retorna `null` sem chamar IA se falhar.

**Regra:** ao adicionar um novo fluxo de IA, sempre criar um gate de regex ou heurística simples antes. Consulte CLAUDE.md ("O padrão do projeto é: regex/gate rápido primeiro").

**Referências:** `handlers/faculdade.js:14-28`, `handlers/webhook.js` (detecção de contagem de estoque usa padrão similar)
