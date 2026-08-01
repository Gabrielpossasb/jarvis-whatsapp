# Testes pendentes — eventos de faculdade em lote + "não entendi"

Mudanças em `services/openai.js` e `handlers/webhook.js`. Não deu pra testar no sandbox (sem `OPENAI_API_KEY`/`SUPABASE_URL`). Testar local ou no Railway, pelo chat web (`/api/mensagem`) ou WhatsApp direto.

**IMPORTANTE**: antes de tudo, rodar a migração `migrations/002_drop_pending_states_type_check.sql` no Supabase (SQL editor) — sem ela, `state_type` novos (`evento_faculdade_lote`, `esclarecimento`) não persistem no banco (só sobrevivem em RAM, e são perdidos em qualquer restart do Railway).
feito

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

---

# Testes pendentes — notas/média de faculdade, categorias por tipo, verificações

**IMPORTANTE**: antes de tudo, rodar `migrations/003_categorias_tipo.sql` e `migrations/004_faculdade_notas.sql` no Supabase.

## 11. Fórmula de média por disciplina (texto livre)
Mandar: `"a média de banco de dados é a soma das duas provas dividido por 2, mínimo 6 pra passar direto senão soma o exame final"`

- [ ] JARVIS confirma que salvou a fórmula (sem pedir confirmação — fórmula sozinha não é uma operação em lote)
- [ ] Abrir a matéria na grade semanal (aba Faculdade) → o modal de detalhe mostra a fórmula salva

## 12. Lançar nota por chat
Com pelo menos uma prova de uma disciplina já cadastrada (via `"prova de X dia Y"`), mandar: `"tirei 8.5 na prova de X"`

- [ ] Nota salva no evento certo, sem pedir confirmação
- [ ] Abrir o evento na aba Faculdade → nota aparece no modal de visualização
- [ ] Testar caso ambíguo: disciplina com 2+ provas cadastradas, mandar uma referência vaga (`"tirei 7 na prova de X"` sem dizer qual) → JARVIS pergunta qual avaliação é, lista as opções, e ao responder com o nome certo a nota é salva na prova certa

## 13. Plano de ensino em foto/PDF (múltiplos itens de uma vez)
Mandar uma foto ou PDF contendo pelo menos: data de uma prova, data de um trabalho, e a fórmula de média de uma disciplina cadastrada

- [ ] JARVIS responde com um resumo de tudo que encontrou (eventos + fórmula) e pede confirmação — nada é gravado antes do "sim"
- [ ] Confirmar com "sim" → eventos aparecem em `faculdade_eventos` e a fórmula em `faculdade_disciplinas`
- [ ] Mandar uma foto qualquer sem nada de faculdade (ex: foto de um produto) → cai no fluxo genérico normal (gasto/tarefa/nada), sem tentar forçar um plano de faculdade

## 14. Média calculada e resumo na tela
Com fórmula + pelo menos uma nota lançada numa disciplina, abrir o modal de detalhe dela na aba Faculdade

- [ ] Mostra a média atual calculada, um resumo em português do que falta pra passar, e a lista de provas/atividades com as notas lançadas
- [ ] Disciplina sem fórmula cadastrada → modal avisa que não tem fórmula ainda, sem tentar calcular nada
- [ ] Disciplina com fórmula mas nenhuma nota lançada → modal mostra a fórmula mas não tenta calcular média

## 15. Categorias por tipo em Configurações
Na aba Configurações → seção Categorias

- [ ] Criar uma categoria nova de tarefa, uma de gasto e uma de ganho → aparecem na lista filtrada certa
- [ ] Tentar criar uma categoria com nome que já existe no mesmo tipo → erro claro; criar uma com o mesmo nome mas tipo diferente (ex: "Outros" de um tipo que ainda não tem) → funciona normalmente
- [ ] Clicar em "Revisar categorias de tarefas" → mostra sugestões com checkbox, desmarcar uma e aplicar → só as marcadas mudam de categoria
- [ ] Clicar em "Revisar transações do mês" → mesma dinâmica, mas pras transações de gasto/ganho do mês atual

## 16. Alerta das 6h (verificação de código)
Já verificado por leitura de código nesta sessão: `enviarResumoDiario` (`cron/jobs.js`) monta aulas, eventos acadêmicos e tarefas em blocos independentes — nenhum bug encontrado. Não é necessário testar, mas se quiser confirmar na prática: no dia seguinte, comparar a mensagem das 6h com o que está cadastrado (tarefas do dia + aulas + eventos acadêmicos) e ver se bate.

## 17. Bug do item selecionado na sidebar (não reproduzido)
Testei extensivamente em viewport mobile (clique no botão de abrir/fechar, clique no backdrop, alternância rápida) e não reproduzi — o item certo ficou destacado em todos os casos, já que o destaque é 100% derivado da URL (`useLocation()`), sem estado duplicado. Você mencionou que só acontece no celular de verdade — quando notar de novo, tentar registrar: qual navegador (Safari/Chrome no iOS/Android), se é PWA instalado ou aba normal, e se acontece com toque no botão do menu ou com gesto de arrastar (swipe).

