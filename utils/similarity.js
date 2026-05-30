// ─────────────────────────────────────────────
//  utils/similarity.js — Comparação de strings
// ─────────────────────────────────────────────

// Normaliza string: minúsculo, sem acento, sem caracteres especiais
function normalizar(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// Calcula similaridade entre duas strings (0 a 1)
// 1 = idênticas, 0 = completamente diferentes
function calcularSimilaridade(str1, str2) {
  const a = normalizar(str1);
  const b = normalizar(str2);

  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  // Similaridade por sobreposição de palavras (ignora palavras curtas)
  const wordsA = new Set(a.split(" ").filter(w => w.length > 2));
  const wordsB = new Set(b.split(" ").filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersecao = [...wordsA].filter(w => wordsB.has(w));
  const uniao = new Set([...wordsA, ...wordsB]);

  return intersecao.length / uniao.size;
}

// Retorna a tarefa mais similar acima do limiar
// limiar padrão: 0.6 (60% de similaridade)
function encontrarSimilar(novaDescricao, tarefas, limiar = 0.6) {
  let melhorMatch = null;
  let melhorScore = 0;

  for (const tarefa of tarefas) {
    if (tarefa.status === "Concluída") continue;
    const score = calcularSimilaridade(novaDescricao, tarefa.descricao);
    if (score >= limiar && score > melhorScore) {
      melhorScore = score;
      melhorMatch = tarefa;
    }
  }

  return melhorMatch;
}

module.exports = { calcularSimilaridade, encontrarSimilar };
