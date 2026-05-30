// ─────────────────────────────────────────────
//  services/openai.js — GPT, Whisper e Vision
// ─────────────────────────────────────────────

const OpenAI = require("openai");
const axios = require("axios");
const FormData = require("form-data");
const { CONFIG, MESES_CURTOS, DIAS_SEMANA } = require("../config");
const { getListaCategorias } = require("./categorias");
const { formatarData, formatarHora, agora, amanha, proximoDiaSemana } = require("../utils/date");

const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });

async function extrairDados(texto) {
  const dataHoje = formatarData();
  const DIAS_NOMES = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
  const tabelaDatas = DIAS_NOMES.map(dia => {
    const proxima  = proximoDiaSemana(dia, false);
    const seguinte = proximoDiaSemana(dia, true);
    return `  "${dia}"/"na ${dia}" → ${proxima} | "próxima ${dia}"/"${dia} que vem" → ${seguinte}`;
  }).join("\n");
  console.log("TABELA DATAS:\n" + tabelaDatas);
  const horaAgora = formatarHora();
  const diaAtual = DIAS_SEMANA[agora().getDay()];
  const mesAtual = MESES_CURTOS[agora().getMonth()];
  const anoAtual = agora().getFullYear();
  const listaCategorias = await getListaCategorias();

  const prompt = `Você é o JARVIS, assistente pessoal inteligente. Analise e classifique a mensagem.

Data: ${dataHoje} (${diaAtual}). Hora: ${horaAgora}. Fuso: GMT-4. Mês: ${mesAtual}/${anoAtual}.

Datas pré-calculadas a partir de hoje (${dataHoje}, ${diaAtual}):
${tabelaDatas}
- "amanhã" → ${amanha()}
- "depois de amanhã" → use +2 dias a partir de ${dataHoje}
- "semana que vem" → segunda-feira ${proximoDiaSemana("segunda", true)}
- "fim de semana" → ${proximoDiaSemana("sábado", false)}
- Sem data → "backlog"
- Sempre formato DD/mmm (ex: 02/jun)

CLASSIFICAÇÕES:
- "gasto": despesa, pagamento, compra
- "tarefa": algo a fazer, compromisso, agendamento
- "consulta": perguntas sobre tarefas (ex: "o que tenho hoje?", "tarefas da faculdade")
- "concluir": concluiu/fez tarefa (ex: "concluí X", "já fiz X", "feito: X")
- "excluir": remover tarefa (ex: "excluir X", "apagar X")
- "mudar_categoria": trocar categoria de tarefa (ex: "muda X para categoria Y")
- "adicionar_categoria": criar nova categoria (ex: "adicionar categoria Animais 🐾")
- "revisar_categorias": pede revisão das categorias das tarefas (ex: "revisa as categorias")
- "aprovar_revisao": aprova sugestões de revisão (ex: "aprovar tudo", "aprovar 1,3", "rejeitar 2")
- "alterar_tarefa": mudar data/hora/lembrete de uma tarefa existente (ex: "muda a data de X para Y", "muda o lembrete de X para toda sexta às 10h")

CATEGORIAS DISPONÍVEIS: ${listaCategorias}
Identifique a categoria automaticamente pelo contexto da tarefa ou gasto.

Para GASTOS:
- tipo_despesa: "fixa" (cartão, fatura, assinatura, empréstimo) ou "variavel" (dia a dia)
- Meio de pagamento: SEMPRE "Nubank" como padrão, EXCETO se mencionar "Mercado Pago" ou "MP"
- Descrição em CAIXA ALTA

Para TAREFAS:
- hora: horário específico da tarefa (HH:MM) ou vazio
- recorrente: dias separados por vírgula para tarefas recorrentes (ex: "segunda,quarta,sexta") ou "Não"
- dias_lembrete: dias para enviar lembretes independentes (ex: "segunda,quinta") — diferente de recorrente!
- hora_lembrete: horário do lembrete independente (HH:MM)
- Se a tarefa tem prazo mas você quer lembretes em outros dias → use dias_lembrete + hora_lembrete
- Se a tarefa em si acontece em dias recorrentes → use recorrente

Para ADICIONAR_CATEGORIA:
- nova_categoria_nome: nome da nova categoria
- nova_categoria_emoji: emoji escolhido

Para ALTERAR_TAREFA:
- descricao: nome da tarefa a alterar
- alteracoes: objeto com campos a mudar { data?, hora?, dias_lembrete?, hora_lembrete? }

Para CONSULTAS:
- periodo: "hoje", "amanhã", "backlog" ou "DD/mmm"
- categoria_filtro: categoria específica ou "todas"

Para APROVAR_REVISAO:
- aprovados: "tudo" ou lista de números (ex: "1,3") ou "nenhum"
- rejeitados: lista de números rejeitados ou vazio

Responda APENAS com JSON válido, sem markdown:
{
  "classificacao": "...",
  "descricao": "CAIXA ALTA",
  "data": "DD/mmm ou backlog",
  "tipo_despesa": "fixa|variavel",
  "valor": número,
  "meio_pagamento": "Nubank|Mercado Pago",
  "categoria": "categoria",
  "hora": "HH:MM ou vazio",
  "recorrente": "dias ou Não",
  "dias_lembrete": "dias ou vazio",
  "hora_lembrete": "HH:MM ou vazio",
  "periodo": "hoje|amanhã|backlog|DD/mmm",
  "categoria_filtro": "categoria ou todas",
  "nova_categoria": "nova categoria (mudar_categoria)",
  "nova_categoria_nome": "nome (adicionar_categoria)",
  "nova_categoria_emoji": "emoji (adicionar_categoria)",
  "alteracoes": { "data": "...", "hora": "...", "dias_lembrete": "...", "hora_lembrete": "..." },
  "aprovados": "tudo|1,3|nenhum",
  "entendimento": "frase curta"
}

Mensagem: "${texto}"`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const content = response.choices[0].message.content.trim();
  return JSON.parse(content.replace(/```json|```/g, "").trim());
}

// Revisão de categorias — GPT analisa todas as tarefas e sugere melhorias
async function revisarCategorias(tarefas, listaCategorias) {
  if (tarefas.length === 0) return [];

  const lista = tarefas.map((t, i) =>
    `${i + 1}. "${t.descricao}" → atual: ${t.categoria}`
  ).join("\n");

  const prompt = `Você é um assistente organizador. Analise essas tarefas e verifique se as categorias fazem sentido.
Categorias disponíveis: ${listaCategorias}

Tarefas:
${lista}

Para cada tarefa que tiver uma categoria inadequada, sugira uma melhor.
Responda APENAS com JSON (array), sem markdown:
[
  { "numero": 1, "descricao": "nome", "categoriaAtual": "X", "categoriaSugerida": "Y", "motivo": "breve motivo" }
]
Se todas estiverem corretas, retorne array vazio: []`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const content = response.choices[0].message.content.trim();
  return JSON.parse(content.replace(/```json|```/g, "").trim());
}

async function transcreverAudio(base64, mimetype) {
  const buffer = Buffer.from(base64, "base64");
  const formData = new FormData();
  formData.append("file", buffer, { filename: "audio.ogg", contentType: mimetype || "audio/ogg" });
  formData.append("model", "whisper-1");
  formData.append("language", "pt");

  const response = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    formData,
    { headers: { Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`, ...formData.getHeaders() } }
  );
  return response.data.text;
}

async function analisarImagem(base64, mimetype) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
        { type: "text", text: "Analise essa imagem e extraia informações de despesa/gasto ou tarefa. Responda em português." }
      ]
    }],
    max_tokens: 500,
  });
  return response.choices[0].message.content;
}

async function analisarPDF(base64) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Analise esse documento e extraia despesas/gastos ou tarefas. Responda em português." },
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      ]
    }],
    max_tokens: 1000,
  });
  return response.choices[0].message.content;
}

module.exports = { extrairDados, revisarCategorias, transcreverAudio, analisarImagem, analisarPDF };
