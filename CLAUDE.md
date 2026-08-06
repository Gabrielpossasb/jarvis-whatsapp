# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

JARVIS é um assistente pessoal via WhatsApp: um servidor Node.js/Express que recebe mensagens (texto, áudio, foto, PDF) via webhook da Evolution API, interpreta com OpenAI (GPT-4o-mini / Whisper / Vision), e gerencia gastos, tarefas, estoque e calendário de faculdade. Tem também um frontend React (`jarvis-web/`) que consome as mesmas rotas da API e o Supabase diretamente.

Dois projetos Node independentes no mesmo repo, cada um com seu próprio `package.json`:
- raiz (`/`) — backend, hospedado no Railway
- `jarvis-web/` — frontend Vite/React, hospedado no Vercel

## Comandos

Backend (raiz):
```
npm start          # node index.js — não há watch/reload configurado
npm test           # jest — testes do backend (handlers/estoque, handlers/faculdade, extrato)
```

Frontend (`jarvis-web/`):
```
npm run dev         # vite dev server
npm run build        # vite build
npm run lint          # eslint .
npm run preview        # preview do build
```

## Arquitetura do backend

**Fluxo de mensagem**: `index.js` registra as rotas Express e delega toda a lógica de negócio para `handlers/webhook.js` (é o núcleo do sistema — domínio de estoque em `handlers/estoque.js`, domínio de faculdade em `handlers/faculdade.js`). O mesmo handler atende tanto o webhook do WhatsApp (`POST /webhook`) quanto o chat web (`POST /api/mensagem`), então qualquer funcionalidade nova de conversa passa por ali.

**Extração de dados com IA**: `services/openai.js` concentra todas as chamadas ao GPT — `extrairDados` (gastos/tarefas a partir de texto livre), `revisarCategorias`/`revisarCategoriasGastos`, `transcreverAudio` (Whisper), `analisarImagem`/`analisarPDF` (comprovantes), `extrairExtrato`/`extrairExtratoTexto` (extratos bancários em lote), `extrairEventoFaculdadeIA` (agendamento/nota/fórmula de faculdade), `extrairPlanoFaculdadeIA` (múltiplos itens de uma foto/PDF de plano de ensino) e `calcularMediaFaculdadeIA` (interpreta a fórmula em texto livre + notas lançadas). O padrão do projeto é: regex/gate rápido primeiro para decidir se vale chamar a IA, e só então IA para extrair o JSON estruturado — ver a detecção de eventos de faculdade em `handlers/faculdade.js` como referência desse padrão antes de adicionar novos fluxos de IA. `extrairDados` e `extrairEventoFaculdadeIA` usam `response_format: { type: "json_object" }` da OpenAI (não markdown-fence + `JSON.parse` manual); as demais funções ainda usam o padrão antigo de texto livre.

**Nomes de modelos de LLM centralizados em `config.js`**: nunca escrever strings de modelo (`"gpt-4o-mini"`, `"whisper-1"`, etc.) diretamente nas chamadas de IA — use sempre `MODELOS` de `config.js` (`{ rapido, visao, audio }`). Trocar de LLM é uma mudança de uma linha.

**A IA deve admitir incerteza, nunca "chutar" uma ação**: `extrairDados` tem uma classificação explícita `"nao_entendi"` para quando a mensagem não se encaixa com confiança em nada — não force um classificação só para responder algo. `extrairEventoFaculdadeIA` retorna um de 3 modos (`unico`, `intervalo`, `nao_suportado`); o modo `nao_suportado` faz o webhook responder e **parar**, sem cair no fluxo genérico de `extrairDados`. Ao criar um novo extrator de IA, siga esse padrão: sempre dar ao modelo uma saída formal de "não sei fazer isso" em vez de deixá-lo forçar a interpretação mais próxima do schema disponível.

**Eventos de faculdade em lote**: `handlers/faculdade.js` (`processarEventoFaculdadeIntervalo`) resolve pedidos do tipo "todas as aulas de X até o dia Y" cruzando o `dia` da disciplina em `faculdade_aulas` com o intervalo de datas pedido, e **explode em uma linha por ocorrência** em `faculdade_eventos` (não há campo de intervalo na tabela). Como pode afetar várias linhas de uma vez, esse fluxo sempre pede confirmação antes de gravar — reaproveita `services/pending-states.js` com `state_type: "evento_faculdade_lote"`, no mesmo padrão do fluxo de extrato bancário.

**Estado de conversa em duas camadas**: `state.js` guarda `Map`s em RAM (`pendingReviews`, `pendingTaskAdd`, `pendingExtrato`, `pendingMultiTarefas`) para uso imediato, mas `services/pending-states.js` persiste o mesmo tipo de estado na tabela `pending_states` do Supabase (cache RAM → fallback Supabase em `obterEstado`), porque o Railway reinicia o processo em cada deploy e o RAM sozinho perderia confirmações em andamento. Ao adicionar um novo fluxo de confirmação multi-etapa (ex: "aprovar tudo", edição de lote), prefira o padrão persistido de `pending-states.js` em vez de um `Map` novo em `state.js`. `state_type` é string livre (sem CHECK constraint no banco — removido em `migrations/002_drop_pending_states_type_check.sql` porque travava toda vez que um fluxo novo era adicionado).

**Memória de contexto para perguntas de esclarecimento**: quando o bot pergunta algo e precisa da resposta do usuário pra continuar (disciplina ausente num evento de faculdade, `nao_suportado`, `nao_entendi`, ou "não encontrei essa tarefa" em `concluir`/`excluir`/`mudar_categoria`/`alterar_tarefa`), ele salva `state_type: "esclarecimento"` com `{ tipoOrigem, textoOriginal, contextoParcial }` antes de perguntar. Um bloco dedicado no topo de `processarMensagem` combina a resposta seguinte com o texto original (ou, no caso de tarefa não encontrada, já sabe a ação e só refaz `encontrarTarefa`) e reprocessa — assim o usuário não precisa repetir a mensagem inteira. Ao adicionar um novo ponto onde o bot pergunta algo, salve esse estado em vez de só responder e esquecer o contexto.

**Despacho de classificação separado do fluxo principal**: a lógica que decide o que fazer com `dados.classificacao` (saída de `extrairDados`) vive em `processarClassificacao(dados, texto, remoteJid, responder)`, separada de `processarMensagem`, porque o bloco de reprocessamento de esclarecimento precisa chamá-la de novo depois de recombinar a resposta do usuário — evita duplicar ~200 linhas de dispatch. `executarAcaoTarefa(acao, t, extra, responder)` faz o mesmo para as ações sobre uma tarefa já resolvida (concluir/excluir/mudar_categoria/alterar_tarefa), reaproveitado tanto no fluxo normal quanto no reprocessamento.

**Respostas com botões no chat web**: `responder(msg, opcoes)` aceita um segundo parâmetro opcional `{ botoes: [...], dica: "..." }` — só tem efeito no canal `"web"` (`processarMensagem` retorna `{ texto, opcoes }` em vez de string pura; o WhatsApp ignora `opcoes` e continua só texto, já que a Evolution API não suporta botões interativos no conector Baileys). Todo ponto que pede confirmação sim/não ou lista de números deve passar `opcoes` — é isso que faz o chat web (`jarvis-web/src/pages/Chat.jsx`) renderizar botões clicáveis em vez de exigir o usuário digitar.

**Tudo no Supabase**: tarefas, gastos, estoque, faculdade, configurações e cron_logs vivem todos no Postgres do Supabase (`services/supabase.js`). Tarefas e gastos são manipulados via `services/tarefas.js` (nome legado do arquivo era `sheets.js`, de uma versão anterior que usava Google Sheets — isso não existe mais no projeto; não recriar essa dependência).

**Cron jobs** (`cron/jobs.js`, `node-cron`, timezone fixo `America/Campo_Grande` em `config.js`): todo job é registrado via `executarComLog` (`services/cron-logs.js`), que grava o resultado na tabela `cron_logs` — sempre envolva jobs novos nesse wrapper para manter a observabilidade. `iniciarCronJobs`/`atualizarCronJobs` permitem reconfigurar horário/timezone em runtime a partir da tabela `configuracoes` (editável pelo frontend em `/api/config`), sem precisar reiniciar o processo.

**Categorias dinâmicas, separadas por tipo**: `services/categorias.js` busca categorias do banco com cache — nunca hardcode uma lista de categorias no código; elas são definidas pelo usuário e podem mudar. A tabela `categorias` tem uma coluna `tipo` (`"tarefa" | "gasto" | "ganho"`, `migrations/003_categorias_tipo.sql`) — `getCategorias`/`getListaCategorias`/`adicionarCategoria` recebem `tipo` como parâmetro (default `"tarefa"`, pra não quebrar quem já chamava sem esse argumento) e o cache é uma entrada por tipo, não um cache único global. Nomes podem se repetir entre tipos (ex: "Outros" existe tanto pra tarefa quanto pra gasto) — a checagem de duplicidade em `adicionarCategoria` é por `(nome, tipo)`, nunca só por `nome`.

**Notas e média por disciplina**: `faculdade_eventos` tem `nota`/`peso` (nullable), e `faculdade_disciplinas` (chaveada por `nome`, não FK — mesma convenção de string livre do resto do módulo de faculdade) guarda `formula_media` em texto livre, porque cada disciplina pode ter uma fórmula diferente (incluindo lógica condicional tipo "exame final substitui a menor nota") que não cabe num cálculo de peso simples em código. A média em si **nunca é calculada em JS** — `calcularMediaFaculdadeIA` manda a fórmula + as notas lançadas pro GPT interpretar sob demanda (chamado tanto pelo chat quanto por `GET /api/faculdade/:disciplina/media`, usado no modal de detalhe da disciplina em `Faculdade.jsx`). Notas são lançadas só via chat (`extrairEventoFaculdadeIA` modo `"nota"`, casa a referência da prova/atividade contra os eventos da disciplina via `encontrarSimilar` — se não achar, cai no mesmo padrão de esclarecimento usado no resto do projeto) — a tela é só leitura.

**Foto/PDF pode conter múltiplos itens de faculdade de uma vez**: antes do fluxo genérico de `analisarImagem`/`analisarPDF` (gasto/tarefa), `handleWebhook` e `handleMensagemArquivo` tentam `extrairPlanoFaculdadeIA` primeiro (ex: foto de um plano de ensino com data de prova + data de trabalho + fórmula de média, tudo numa imagem só) — se não achar nada relacionado a faculdade, cai no fluxo genérico normalmente. Isso custa uma chamada de IA a mais por imagem/PDF recebido; aceitável pro volume de uso pessoal do projeto. O resultado (múltiplos eventos + fórmula opcional) sempre pede confirmação antes de gravar (`state_type: "plano_faculdade"`), mesmo padrão dos outros lotes.

**Matching fuzzy**: `utils/similarity.js` (`encontrarSimilar`) é usado para casar a descrição de uma tarefa mencionada em linguagem natural com a tarefa real no banco, com um threshold de similaridade — usado em `encontrarTarefa` no webhook.

**Cadastro de matéria (grade fixa) e troca de semestre**: `faculdade_aulas` (disciplina, dia, horário, local, professor, cor, `ativo`) não tinha nenhum caminho de escrita até ganhar uma migração própria (`migrations/006_faculdade_aulas_flags.sql`, `CREATE TABLE IF NOT EXISTS` porque a tabela nunca foi versionada). Cadastro manual é direto pelo client Supabase na aba "Matérias" de `Faculdade.jsx` (sem endpoint, mesmo padrão de `faculdade_eventos`); por chat, `extrairEventoFaculdadeIA` modo `"aula"` (texto) e `extrairPlanoFaculdadeIA` campo `aulas` (foto do horário oficial da faculdade, que tipicamente traz várias matérias de uma vez) — ambos sempre pedem confirmação antes de gravar, porque errar a grade é estrutural (afeta o semestre inteiro), diferente de um evento avulso. Cor de matéria cadastrada por chat é automática via `utils/coresFaculdade.js` (`corParaDisciplina`, hash determinístico do nome); no formulário manual o usuário escolhe entre a mesma paleta. "Encerrar semestre" não é um conceito novo no schema — é só `UPDATE faculdade_aulas SET ativo=false WHERE ativo=true`, reaproveitando a coluna `ativo` que todo o resto do código já filtra.

## Arquitetura do frontend (`jarvis-web/`)

React Router com páginas em `src/pages/` (Chat, Tarefas, Gastos, Financeiro, Estoque, Faculdade, Configuracoes), cada uma mapeando a um domínio do backend/Supabase. `src/lib/supabase.js` cria o client Supabase usado para leitura direta de tabelas (estoque, faculdade, gastos) — não tudo passa pela API do backend, só o que envolve lógica de negócio (webhook, cron, config). `HeaderContext` (`src/contexts/`) controla o título/ações do header por página.

**Modais animados**: `src/components/Modal.jsx` é o wrapper padrão pra qualquer janela flutuante (fade + scale, ~200ms) — usado em todas as páginas com modal. Como fechar zera o estado que aciona o modal (ex: `setModal(null)`) mas a animação de saída precisa continuar renderizando o conteúdo antigo, cada página guarda um `modalConteudo` separado que só atualiza ao abrir (nunca ao fechar) — via um helper `abrirModal(m)` chamado em todo call-site de abertura, ou via ajuste em render (`if (modal && modal !== modalConteudo) setModalConteudo(modal)`, direto no corpo do componente, não em `useEffect`) quando mexer em todo call-site existente não vale a pena. Ao adicionar um modal novo em qualquer página, seguir esse padrão em vez de um `fixed inset-0` cru.

**Paleta de cores nomeada**: `tailwind.config.js` define `theme.extend.colors.cinza` (950→50, do fundo mais escuro ao texto mais claro) e `.roxo` (900→400, cor de destaque). Nunca usar hex solto em `className` (`text-[#...]`) — sempre os tokens nomeados (`text-cinza-350`, `border-roxo-700`, etc). Os tons de texto mais escuros que existiam antes (`#4a4a6a`, `#6a6a8a` etc, baixo contraste) foram mapeados para tokens mais claros do que a leitura "literal" do hex sugeriria (ex: um antigo `text-[#4a4a6a]` virou `text-cinza-350`, não um tom escuro correspondente) — isso foi proposital, pra resolver legibilidade; ao adicionar um novo texto secundário, prefira `cinza-300`/`cinza-350`/`cinza-200` a reintroduzir um tom escuro. `CORES_CAT` (cores de categoria financeira em `Financeiro.jsx`/`Gastos.jsx`, hoje duplicado nos dois arquivos) fica fora dessa paleta — é uma paleta semântica separada, não mexida nessa padronização.

## Regras para agentes (Claude Code)

- **Nunca tocar em `.env` ou credenciais** — variáveis de ambiente ficam no Railway/Vercel, nunca no repositório.
- **Commit pequeno por etapa** — uma funcionalidade ou refatoração por commit, mensagem clara no imperativo.
- **Rodar `npm test` antes de cada commit** — os 34 testes do backend devem passar antes de qualquer mudança ir para o repo. Se um teste quebrar, investigar a causa antes de prosseguir.

## Convenções

- CommonJS no backend (`require`/`module.exports`), ESM no frontend.
- Sem comentários explicando o óbvio; comentários só para decisões não óbvias (padrão já seguido no código existente).
- Nunca hardcodar listas que o usuário pode querer mudar (categorias, produtos de estoque, disciplinas) — sempre puxar do Supabase.
- Português nas mensagens de usuário, logs e nomes de campos de banco.
