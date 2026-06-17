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

REGRA ABSOLUTA DE DATAS — USE APENAS ESSES VALORES, NUNCA CALCULE:
${tabelaDatas}
- "amanhã" → ${amanha()}
- "depois de amanhã" → use +2 dias a partir de ${dataHoje}
- "semana que vem" → segunda-feira ${proximoDiaSemana("segunda", true)}
- "fim de semana" → ${proximoDiaSemana("sábado", false)}
- Sem data → "backlog"
- Sempre formato DD/mmm (ex: 02/jun)

CLASSIFICAÇÕES:
- "gasto": despesa, pagamento, compra já realizada ou valor mencionado como saída
- "ganho": entrada de dinheiro, recebimento, salário recebido, freela pago, repasse iFood, PIX recebido de alguém (ex: "recebi R$2000", "caiu meu salário", "freela de R$500", "iFood me pagou", "fulano me pagou")
- "tarefa": algo a fazer, compromisso, agendamento — se tiver data/hora futura e sem valor, é tarefa mesmo que use "comprar"
- "consulta": perguntas sobre tarefas (ex: "o que tenho hoje?", "tarefas da faculdade")
- "concluir": concluiu/fez tarefa (ex: "concluí X", "já fiz X", "feito: X")
- "excluir": remover tarefa (ex: "excluir X", "apagar X")
- "mudar_categoria": trocar categoria de tarefa (ex: "muda X para categoria Y")
- "adicionar_categoria": criar nova categoria (ex: "adicionar categoria Animais 🐾")
- "revisar_categorias": pede revisão das categorias das tarefas (ex: "revisa as categorias")
- "aprovar_revisao": aprova sugestões de revisão (ex: "aprovar tudo", "aprovar 1,3", "rejeitar 2")
- "alterar_tarefa": mudar data/hora/lembrete de uma tarefa existente (ex: "muda a data de X para Y", "muda o lembrete de X para toda sexta às 10h", "quero o horário de X às Y", "X às Y horas")
- "extrato_texto": quando o usuário cola um texto de extrato bancário com múltiplas transações (ex: lista de gastos, histórico de pagamentos)
CATEGORIAS DISPONÍVEIS: ${listaCategorias}
Identifique a categoria automaticamente pelo contexto da tarefa ou gasto.

Para GASTOS:
- tipo_despesa: "fixa" (cartão, fatura, assinatura, empréstimo) ou "variavel" (dia a dia)
- Meio de pagamento: SEMPRE "Nubank" como padrão, EXCETO se mencionar "Mercado Pago" ou "MP"
- Descrição em CAIXA ALTA

Para GANHOS:
- tipo_despesa: "variavel" (padrão para ganhos)
- Meio de pagamento: "Nubank" (onde o dinheiro entra)
- Categoria: "Salário" (folha CLT, salário mensal), "Freela" (cliente pagou, freela, projeto), "iFood (Entrega)" (repasse iFood, pagamento entregas), "Transferência recebida" (PIX de pessoa, TED), "Outros ganhos"
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
  "natureza": "gasto" ou "ganho" (só para classificacao=gasto ou ganho),
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

// Busca histórico do Supabase e monta dicionário de aprendizado
// Retorna string formatada para injetar no prompt
async function buscarHistoricoCategorizacao() {
  try {
    const { supabase } = require("../services/supabase");
    const { data } = await supabase
      .from("gastos")
      .select("descricao, categoria, tipo")
      .order("id", { ascending: false })
      .limit(200);

    if (!data || data.length === 0) return "";

    // Monta mapa: descricao_normalizada → { categoria, tipo, contagem }
    const mapa = {};
    for (const g of data) {
      if (!g.descricao || !g.categoria) continue;
      // Normaliza: remove parcela (ex: MERCADO LIVRE-2/6 → MERCADO LIVRE)
      const chave = g.descricao
        .replace(/-\d+\/\d+$/, "")  // remove -X/Y
        .replace(/\s+\d+\/\d+$/, "") // remove X/Y com espaço
        .trim()
        .toUpperCase();

      if (!mapa[chave]) {
        mapa[chave] = { categoria: g.categoria, tipo: g.tipo, contagem: 0 };
      }
      mapa[chave].contagem++;
    }

    // Monta string compacta para o prompt — só os mais frequentes
    const linhas = Object.entries(mapa)
      .sort((a, b) => b[1].contagem - a[1].contagem)
      .slice(0, 50) // máximo 50 entradas para não poluir o prompt
      .map(([desc, { categoria, tipo }]) => `  "${desc}" → ${categoria} (${tipo})`);

    if (linhas.length === 0) return "";

    return `\nHISTÓRICO DO USUÁRIO — use como referência prioritária:\n${linhas.join("\n")}\n`;
  } catch (err) {
    console.error("Erro ao buscar histórico:", err.message);
    return "";
  }
}

async function extrairExtrato(base64, mimetype, contexto = "") {
  const { MESES_CURTOS } = require("../config");
  const dataAtual = new Date().toLocaleDateString("pt-BR");
  const historico = await buscarHistoricoCategorizacao();
  const prompt = `Você é um assistente financeiro. Analise esse extrato bancário (Nubank ou Mercado Pago) e extraia TODAS as transações: gastos (saídas de dinheiro) E ganhos (entradas de dinheiro como PIX recebido, salário, freela).

Data atual: ${dataAtual}

REGRAS — GASTOS (natureza: "gasto"):
- Extraia TODAS as transações de saída: compras, parcelas, assinaturas, empréstimos, financiamentos da fatura, iFood, Uber, Apple, Google, streaming, e qualquer pagamento feito.
- Ignore: "Pagamento da fatura" (é crédito), estornos, cashback e reembolsos (não são nem gasto nem ganho).
- ATENÇÃO — seção "Movimentações na fatura" ou "Parcelamentos ativos": extraia as linhas "Parcela da fatura de ..." como despesa de saída. Ignore apenas "Pagamento da fatura de ..." nessa seção.

REGRAS — GANHOS (natureza: "ganho"):
- Extraia como ganho: PIX recebido, depósito recebido, salário/folha de pagamento, transferência recebida, repasse iFood.
- Ignore: estornos, cashback, reembolsos (não são ganhos reais).

FORMATO DE CADA TRANSAÇÃO (aplica a gastos e ganhos):
- natureza: "gasto" ou "ganho"
- data: DD/mmm (ex: 15/mai, 03/jun)
- valor: número positivo (ex: 45.90)
- meio_pagamento: "Nubank" ou "Mercado Pago" conforme o extrato
- descricao: nome em CAIXA ALTA; se tiver parcela: NOME-X/Y (ex: "MERCADO LIVRE-2/6")
- tipo: "fixa" para parcelas em aberto, assinaturas recorrentes e empréstimos; "variavel" para o restante (ganhos sempre "variavel")
- mes: para fatura de cartão use o mês da fatura (leia cabeçalho/vencimento); para conta corrente use o mês da transação. Nome completo: "Janeiro"..."Dezembro".
- categoria dos gastos:
  Assinaturas: Spotify, Netflix, Amazon Prime, Disney, HBO, Apple, iFood Club, Hostgator, cursos
  Cartão/Fatura: parcelas, fatura, Mercado Livre, Shopee, Amazon compras, Gazin, lojas
  Dívidas/Empréstimo: empréstimo, parcela de empréstimo
  Transporte: Uber, 99, combustível, gasolina, estacionamento
  Alimentação: iFood, restaurante, mercado, supermercado, padaria, café, lanche
  Relacionamento: presentes para pessoas, encontros, programas
  Presentes: presentes, flores, floricultora
  Cuidados Pessoais: barbearia, salão, farmácia (higiene)
  Saúde: farmácia (remédio), médico, plano de saúde
  Outros: qualquer outro gasto
  ${historico}
- categoria dos ganhos: "Salário" (folha, CLT, holerite), "Freela" (cliente pagou, projeto), "iFood (Entrega)" (repasse iFood), "Transferência recebida" (PIX de pessoa, TED), "Outros ganhos"

Responda APENAS com JSON válido, sem markdown:
{
  "banco": "Nubank" ou "Mercado Pago",
  "transacoes": [
    {
      "natureza": "gasto" ou "ganho",
      "data": "DD/mmm",
      "descricao": "NOME EM CAIXA ALTA",
      "valor": 00.00,
      "meio_pagamento": "Nubank" ou "Mercado Pago",
      "categoria": "categoria",
      "tipo": "fixa" ou "variavel",
      "mes": "NomeMesExtenso"
    }
  ]
}`;

  const contextoExtra = contexto ? `\nCONTEXTO DO USUÁRIO: "${contexto}"\n` : "";
  const isImage = mimetype && (mimetype.includes("image") || mimetype.includes("jpeg") || mimetype.includes("png") || mimetype.includes("webp"));

  let content;
  if (isImage) {
    content = [
      { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
      { type: "text", text: contextoExtra + prompt }
    ];
  } else {
    content = [
      { type: "text", text: contextoExtra + prompt },
      { type: "file", file: { filename: "extrato.pdf", file_data: `data:application/pdf;base64,${base64}` } }
    ];
  }

  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content }],
    max_tokens: 16000,
  });

  const text = response.choices[0].message.content.trim();
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // JSON truncado — tenta recuperar array parcial
    const match = clean.match(/\[\s*\{[\s\S]*\}/);
    if (match) {
      const recovered = match[0].replace(/,\s*$/, "") + "]";
      parsed = { transacoes: JSON.parse(recovered) };
    } else {
      throw new Error("Resposta da IA inválida ou incompleta. Tente novamente.");
    }
  }
  return parsed.transacoes || [];
}

async function extrairExtratoTexto(texto) {
  const { MESES_CURTOS } = require("../config");
  const dataAtual = new Date().toLocaleDateString("pt-BR");
  const historico = await buscarHistoricoCategorizacao();
  const prompt = `Você é um assistente financeiro. Analise esse texto de extrato bancário e extraia TODAS as transações — tanto gastos quanto ganhos (entradas de dinheiro).

REGRA CRÍTICA: Extraia CADA linha como uma transação separada, mesmo que a descrição seja IDÊNTICA a outra. Nunca agrupe, combine ou descarte transações por terem o mesmo nome.

Data atual: ${dataAtual}

REGRAS — GASTOS (natureza: "gasto"):
- Extraia compras, pagamentos, parcelas, assinaturas, PIX enviado, transferência enviada.
- Ignore estornos, cashback e reembolsos (não são gasto nem ganho).

REGRAS — GANHOS (natureza: "ganho"):
- Extraia PIX recebido, depósito recebido, salário/folha de pagamento, transferência recebida.
- Categoria dos ganhos: "Salário" (folha, CLT), "Freela" (cliente, freela, projeto), "iFood (Entrega)" (repasse iFood), "Transferência recebida" (PIX de pessoa, TED), "Outros ganhos".

Para cada transação extraia:
- natureza: "gasto" ou "ganho"
- data: formato DD/mmm (ex: 15/mai)
- valor: número positivo
- meio_pagamento: "Nubank" ou "Mercado Pago" conforme o extrato
- Categorias para gastos:
  Assinaturas: Spotify, Netflix, Amazon Prime, Disney, HBO, Apple, iFood Club, Hostgator, cursos
  Cartão/Fatura: parcelas, fatura, Mercado Livre, Shopee, Amazon compras, Gazin, lojas
  Dívidas/Empréstimo: empréstimo, parcela de empréstimo
  Transporte: Uber, 99, combustível, gasolina, estacionamento
  Alimentação: iFood, restaurante, mercado, supermercado, padaria, café, lanche
  Relacionamento: presentes para pessoas, encontros, programas
  Presentes: presentes, flores, floricultora
  Cuidados Pessoais: barbearia, salão, farmácia (higiene)
  Saúde: farmácia (remédio), médico, plano de saúde
  Outros: qualquer outro gasto
  ${historico}
- descricao: nome em CAIXA ALTA. Se tiver parcela, adicione no formato NOME-X/Y (ex: "MERCADO LIVRE-2/6")
- tipo: "fixa" para parcelas em aberto, assinaturas recorrentes e empréstimos; "variavel" para o restante
- mes: mês de faturamento ou mês mais recente das datas. Nome completo: "Janeiro"..."Dezembro".

Responda APENAS com JSON válido, sem markdown:
{ "transacoes": [ { "natureza": "gasto", "data": "DD/mmm", "descricao": "NOME", "valor": 0.00, "meio_pagamento": "...", "categoria": "...", "tipo": "...", "mes": "NomeMes" } ] }
Texto do extrato:
${texto}`;

  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 16000,
    temperature: 0.1,
  });

  const content = response.choices[0].message.content.trim();
  const clean = content.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\[\s*\{[\s\S]*\}/);
    if (match) {
      const recovered = match[0].replace(/,\s*$/, "") + "]";
      parsed = { transacoes: JSON.parse(recovered) };
    } else {
      throw new Error("Resposta da IA inválida ou incompleta. Tente novamente.");
    }
  }
  return parsed.transacoes || [];
}

module.exports = { extrairDados, revisarCategorias, transcreverAudio, analisarImagem, analisarPDF, extrairExtrato, extrairExtratoTexto };
