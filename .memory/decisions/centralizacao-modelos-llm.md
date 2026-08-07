# Centralização de nomes de modelos de LLM em config.js

**Contexto:** strings como `"gpt-4o-mini"` e `"whisper-1"` estavam espalhadas em 11 pontos dentro de `services/openai.js`.

**Decisão:** todos os nomes de modelo vivem em `MODELOS` (exportado de `config.js`):
- `MODELOS.rapido` = `"gpt-4o-mini"` — textos, classificação, cálculos simples
- `MODELOS.visao` = `"gpt-4o"` — imagens e PDFs (requer multimodal)
- `MODELOS.audio` = `"whisper-1"` — transcrição de voz

**Por quê:** trocar de LLM agora é uma mudança de uma linha em `config.js`, sem risco de deixar instâncias esquecidas. Regra: nunca escrever strings de modelo diretamente nas chamadas de IA.

**Referências:** `config.js:32-36`, `services/openai.js` (usa `MODELOS` em todas as chamadas)
