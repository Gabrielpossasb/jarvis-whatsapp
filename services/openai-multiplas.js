// ─────────────────────────────────────────────
//  PASSO 1 — Em openai.js, adicionar nova classificação no prompt de extrairDados
//  Ctrl+F por:
//    - "extrato_texto": quando o usuário cola um texto de extrato bancário
//  Adicionar ANTES dessa linha:
//
//    - "multiplas_tarefas": quando o usuário menciona 2 ou mais tarefas/compromissos de uma vez (ex: "reunião amanhã e dentista sexta", "adicionar: X, Y, Z")
//
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  PASSO 2 — Adicionar função antes do module.exports
// ─────────────────────────────────────────────

async function extrairMultiplasTarefas(texto) {
  const { DIAS_SEMANA, MESES_CURTOS } = require("../config");
  const { proximoDiaSemana, formatarData, formatarHora, agora, amanha } = require("../utils/date");
  const { getListaCategorias } = require("./categorias");

  const dataHoje = formatarData();
  const diaAtual = DIAS_SEMANA[agora().getDay()];
  const listaCategorias = await getListaCategorias();

  const DIAS_NOMES = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
  const tabelaDatas = DIAS_NOMES.map(dia => {
    const proxima  = proximoDiaSemana(dia, false);
    const seguinte = proximoDiaSemana(dia, true);
    return `  "${dia}" → ${proxima} | "próxima ${dia}" → ${seguinte}`;
  }).join("\n");

  const prompt = `Extraia TODAS as tarefas mencionadas no texto abaixo. Cada compromisso, afazer ou evento é uma tarefa separada.

Data atual: ${dataHoje} (${diaAtual})

DATAS PRÉ-CALCULADAS:
${tabelaDatas}
- "amanhã" → ${amanha()}
- Sem data → "backlog"
- Formato: DD/mmm (ex: 02/jun)

CATEGORIAS DISPONÍVEIS: ${listaCategorias}

Para cada tarefa extraia:
- descricao: CAIXA ALTA, objetivo claro
- data: DD/mmm ou "backlog"
- hora: HH:MM ou ""
- recorrente: dias separados por vírgula (ex: "segunda,quarta") ou "Não"
- categoria: identifique pelo contexto
- dias_lembrete: dias para lembrete independente ou ""
- hora_lembrete: HH:MM ou ""

Responda APENAS com JSON válido, sem markdown:
{ "tarefas": [
  { "descricao": "NOME", "data": "DD/mmm", "hora": "", "recorrente": "Não", "categoria": "...", "dias_lembrete": "", "hora_lembrete": "" }
]}

Texto: "${texto}"`;

  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0].message.content.trim();
  const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
  return parsed.tarefas || [];
}

// ─────────────────────────────────────────────
//  PASSO 3 — Atualizar module.exports
//  Adicionar extrairMultiplasTarefas na lista
// ─────────────────────────────────────────────
