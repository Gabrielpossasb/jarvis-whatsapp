# Testes pendentes — eventos de faculdade em lote + "não entendi"

Mudanças em `services/openai.js` e `handlers/webhook.js`. Não deu pra testar no sandbox (sem `OPENAI_API_KEY`/`SUPABASE_URL`). Testar local ou no Railway, pelo chat web (`/api/mensagem`) ou WhatsApp direto.

**IMPORTANTE**: antes de tudo, rodar a migração `migrations/002_drop_pending_states_type_check.sql` no Supabase (SQL editor) — sem ela, `state_type` novos (`evento_faculdade_lote`, `esclarecimento`) não persistem no banco (só sobrevivem em RAM, e são perdidos em qualquer restart do Railway).

## 1. Caso original do bug — intervalo de EAD por disciplina
Mandar: `"Todas as minhas aulas de fmc até o dia 12/08 serão EAD"`

- [ ] JARVIS **não** grava nada direto — responde pedindo confirmação com a lista de datas das aulas de FMC até 12/08
- [ ] Responder `"sim"` → grava um evento por data na tabela `faculdade_eventos` (conferir no Supabase: uma linha por ocorrência, todas com `disciplina = "Fundamentos Matemáticos p/ Computação"` e `tipo = "ead"`)
- [ ] Repetir o teste e responder `"não"` → nada é gravado, estado é limpo

## 2. Mensagem ambígua sobre faculdade
Mandar algo vago tipo `"aquilo lá da facul"` ou `"muda a facul"`

- [ ] JARVIS responde dizendo que entendeu ser sobre faculdade mas não identificou o que fazer (`nao_suportado`)
- [ ] Confirma que **não** caiu no fluxo genérico de gastos/tarefas (não deve ter criado gasto/tarefa nenhuma)

## 3. Disciplina sem aula cadastrada
Mandar: `"todas as aulas de [disciplina que não existe na grade] até sexta serão EAD"`

- [ ] Responde `"Não encontrei aula de ... na sua grade"` e não grava nada

## 4. Evento único (regressão)
Mandar: `"prova de banco de dados dia 20/08"`

- [ ] Continua funcionando igual a antes — grava direto (sem pedir confirmação) e responde confirmando o evento criado

## 5. Mensagem comum de gasto/tarefa (regressão)
Mandar: `"gastei 40 no almoço"` e `"comprar remédio às 16h"`

- [ ] Ambos continuam classificando e gravando normalmente (gasto e tarefa)

## 6. Mensagem totalmente fora do escopo (nao_entendi)
Mandar algo sem sentido / muito ambíguo, tipo `"aquilo que eu falei ontem"`

- [ ] JARVIS responde `🤔 Não tive certeza: ...` em vez de inventar um gasto/tarefa errado

## 7. Disciplina com mais de um horário por semana
Se alguma disciplina da grade tiver 2+ aulas/semana (ex: segunda e quarta), testar intervalo com ela

- [ ] Confirma que o lote inclui as datas de **ambos** os dias da semana dentro do período pedido

---

# Testes pendentes — memória de contexto, botões no chat, cores

## 8. Memória de contexto — disciplina ausente
Mandar: `"tenho aula ead mas não lembro de qual disciplina"` (deve cair em `intervalo` sem disciplina, ou em `nao_suportado`)

- [ ] JARVIS pergunta qual disciplina
- [ ] Responder só `"banco de dados"` (sem repetir a mensagem toda) → JARVIS combina e processa corretamente (deve pedir confirmação do lote se aplicável)
- [ ] Se responder de novo algo que não esclarece nada → JARVIS desiste e pede pra mandar a mensagem completa de novo (não fica perguntando pra sempre)

## 9. Memória de contexto — tarefa não encontrada
Mandar: `"concluir [nome de tarefa que não existe]"`

- [ ] JARVIS diz que não encontrou e pede o nome certo
- [ ] Responder só com o nome certo da tarefa (sem "concluir" de novo) → tarefa é concluída
- [ ] Repetir com `"mudar categoria de [nome errado] para Casa"` → responder só o nome certo → categoria muda pra "Casa" (confirma que o `contextoParcial` guardou a categoria nova certa)

## 10. Memória de contexto — nao_entendi genérico
Mandar algo ambíguo tipo `"aquilo que eu falei"` → JARVIS admite que não entendeu

- [ ] Responder com mais contexto (ex: completar a frase) → JARVIS tenta de novo combinando as duas mensagens

## 11. Botões no chat web
No chat web (`jarvis-web`, não WhatsApp):

- [ ] Disparar uma tarefa duplicada (mandar a mesma tarefa duas vezes) → aparecem botões clicáveis "✅ Sim" / "❌ Não" abaixo da mensagem do bot
- [ ] Clicar em "✅ Sim" → confirma sem precisar digitar
- [ ] Mandar um extrato bancário em texto → aparecem botões Sim/Não **e** a dica de digitar números continua funcionando normalmente pelo campo de texto
- [ ] Mandar uma nova mensagem depois de uma pergunta com botões → os botões da mensagem anterior somem (só a última pergunta pendente mostra botões)
- [ ] Confirmar que no WhatsApp esses mesmos fluxos continuam funcionando só por texto (sim/não digitado), sem erro

## 12. Paleta de cores
Rodar `npm run dev` em `jarvis-web/` e abrir cada página (Chat, Tarefas, Gastos, Financeiro, Estoque, Faculdade, Configurações):

- [ ] Textos secundários (categorias, datas, labels pequenos) estão visivelmente mais legíveis que antes, sem ficar "lavado"/sem contraste com o roxo de destaque
- [ ] Fundo geral do app continua com a mesma identidade visual (escuro), só o texto clareou
- [ ] Nenhuma tela quebrou visualmente (borda sumida, botão sem cor, etc.) — comparar com o app em produção antes do deploy
