# RLS desabilitado + chave anon pública = banco aberto

**Status: PENDENTE — o Gabriel quer resolver depois.** Não é regressão de
nada recente; é o estado desde sempre. Anotado em 17/08/2026.

## O problema

`VITE_SUPABASE_KEY` (frontend, Vercel) e `SUPABASE_KEY` (backend, Railway)
são as duas chaves **publishable** (anon) — verificado pelo prefixo
`sb_publishable_`. RLS aplica-se a elas, mas **nenhuma tabela tem RLS
ligado**, então a chave anon tem leitura e escrita totais.

A chave do frontend vai no bundle JS que o Vercel serve: qualquer um que
abra o código-fonte da página extrai. Consequência: quem achar a chave lê e
escreve `gastos` (finanças pessoais), `estoque_*`, `faculdade_*`,
`psh_lancamentos` (financeiro do negócio) e `tarefas`.

Prova concreta de que não há RLS: em 17/08/2026 um `DELETE` de 24 linhas em
`estoque_movimentacoes` rodou com a chave anon sem qualquer bloqueio.

Isso é **ortogonal** ao `autenticarWeb` de `.memory/decisions/autenticacao-rotas.md`
— aquele token protege as rotas do Express, mas o frontend fala com o
Supabase direto pelo navegador, sem passar por ele.

## Por que não foi resolvido junto com o financeiro do PSH

Ligar RLS só na `psh_lancamentos` quebraria a aba Financeiro (nenhuma policy
pra anon) sem ganhar segurança nenhuma: quem tem a chave já lê
`estoque_produtos`, onde `preco`/`preco_compra` vivem. Meia-solução aqui é
pior que nada.

## Caminhos reais (quando for atacar)

1. **Supabase Auth + policies** (`auth.uid()`): o certo. Exige tela de login
   no app — hoje não existe nenhuma. Mexe em todas as páginas.
2. **Tirar o acesso direto do navegador ao Supabase**: mover as queries do
   frontend pras rotas do Express, que já têm token. Menos invasivo, mas
   reescreve `src/lib/supabase.js` e todo call-site que hoje usa o client
   direto (Estoque, Faculdade, Gastos, Financeiro).

Se o repositório for tornado público ou compartilhado, **rotacionar as
chaves** é pré-requisito — mesmo com `.env` fora do git, elas circulam em
prints, deploys e histórico de conversa.
