# Fluxo de dados da Polpa de Frutas

**Contexto:** Gabriel tem uma empresa de venda de polpa de frutas. O JARVIS gerencia estoque dessa empresa.

**Como funciona (a confirmar — baseado no código existente):**

O JARVIS não usa RAG (Retrieval-Augmented Generation) no sentido técnico de vetores/embeddings. O "RAG" aqui é operacional:

1. **Produtos cadastrados no Supabase** (`estoque_produtos`) com nome, categoria, unidade, estoque atual e mínimo.
2. **Movimentações** (`estoque_movimentacoes`) registram entradas, vendas e consumo por pessoa.
3. **Contagem via WhatsApp:** usuário envia texto no formato `Morango — 5 kg` (uma linha por produto). `parsearContagemEstoque` transforma em itens, `processarContagemEstoque` faz match fuzzy pelo nome e atualiza o banco.
4. **Frontend Estoque** (a implementar — plano em `.claude/plans/precious-booping-barto.md`): lista produtos por categoria com alertas de estoque mínimo.

**a completar:** detalhes sobre consumo por pessoa e fluxo de vendas — aguardar implementação da aba Estoque no frontend.

**Referências:** `handlers/estoque.js`, `services/tarefas.js` (não — estoque usa Supabase direto), tabelas `estoque_produtos` e `estoque_movimentacoes`
