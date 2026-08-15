-- ─────────────────────────────────────────────────────
-- Migração: emoji editável por produto de estoque
-- ─────────────────────────────────────────────────────
-- O emoji de cada sabor era decidido no frontend (Estoque.jsx) por uma
-- função que tentava casar palavras-chave no nome ("morango" → 🍓) —
-- hardcoded e sem controle do usuário: nomes que não batiam com nenhuma
-- palavra prevista ficavam sem ícone ou com o ícone errado.
--
-- Vira uma coluna normal, no mesmo padrão de categorias.emoji: editável
-- pelo modal "Editar produto" na aba Estoque, sem precisar mexer em código.

ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS emoji TEXT;

-- Preenchimento inicial best-effort por palavra-chave — só para não
-- começar tudo vazio. Ajuste manualmente pelo modal de edição qualquer
-- um que ficar errado; o que não bater em nenhuma regra fica NULL e o
-- frontend mostra 🍹 como ícone padrão até você definir um.
UPDATE estoque_produtos SET emoji = '🍓' WHERE emoji IS NULL AND nome ILIKE '%morango%';
UPDATE estoque_produtos SET emoji = '🫐' WHERE emoji IS NULL AND (nome ILIKE '%açaí%' OR nome ILIKE '%acai%');
UPDATE estoque_produtos SET emoji = '🍍' WHERE emoji IS NULL AND nome ILIKE '%abacaxi%';
UPDATE estoque_produtos SET emoji = '💛' WHERE emoji IS NULL AND (nome ILIKE '%maracujá%' OR nome ILIKE '%maracuja%');
UPDATE estoque_produtos SET emoji = '🍇' WHERE emoji IS NULL AND nome ILIKE '%uva%';
UPDATE estoque_produtos SET emoji = '🍋' WHERE emoji IS NULL AND (nome ILIKE '%limão%' OR nome ILIKE '%limao%');
UPDATE estoque_produtos SET emoji = '🍒' WHERE emoji IS NULL AND nome ILIKE '%acerola%';
UPDATE estoque_produtos SET emoji = '🍈' WHERE emoji IS NULL AND nome ILIKE '%goiaba%';
UPDATE estoque_produtos SET emoji = '🍏' WHERE emoji IS NULL AND nome ILIKE '%graviola%';
UPDATE estoque_produtos SET emoji = '🥭' WHERE emoji IS NULL AND nome ILIKE '%caju%';
UPDATE estoque_produtos SET emoji = '🥥' WHERE emoji IS NULL AND (nome ILIKE '%cupuaçu%' OR nome ILIKE '%cupuacu%');
UPDATE estoque_produtos SET emoji = '🫐' WHERE emoji IS NULL AND nome ILIKE '%guavira%';
UPDATE estoque_produtos SET emoji = '🍓' WHERE emoji IS NULL AND nome ILIKE '%frutas vermelhas%';
UPDATE estoque_produtos SET emoji = '🧀' WHERE emoji IS NULL AND (nome ILIKE '%pão de queijo%' OR nome ILIKE '%pao de queijo%');
