// Paleta fixa usada pra colorir a borda da matéria na grade semanal (Faculdade.jsx).
// corParaDisciplina é usado quando uma aula é cadastrada por texto/foto (sem o usuário
// escolher a cor manualmente, como faz no formulário) — hash determinístico do nome
// garante que a mesma disciplina sempre caia na mesma cor.
const PALETA = ["#7c3aed", "#0ea5e9", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#64748b", "#84cc16"];

function corParaDisciplina(nome) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA[hash % PALETA.length];
}

module.exports = { PALETA, corParaDisciplina };
