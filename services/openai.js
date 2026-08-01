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
- "nao_entendi": a mensagem não se encaixa com confiança em nenhuma classificação acima, está incompleta ou ambígua — NÃO force uma classificação só para responder algo; explique em "entendimento" o que faltou entender
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
  * "toda semana" ou "toda ${diaAtual.split("-")[0]}" → recorrente: "${DIAS_NOMES[agora().getDay()]}"
  * "uma vez por semana" sem dia específico → use o dia da semana de hoje: "${DIAS_NOMES[agora().getDay()]}"
  * "todo dia" / "todos os dias" → recorrente: "domingo,segunda,terça,quarta,quinta,sexta,sábado"
- intervalo_dias: número de dias entre recorrências para intervalos fixos (ex: 14 para "a cada 14 dias"), ou 0 se não aplicável
  * Quando intervalo_dias > 0, deixe recorrente: "Não"
  * "a cada 7 dias" → intervalo_dias: 7 (NÃO use recorrente)
  * "a cada 2 semanas" ou "quinzenalmente" → intervalo_dias: 14
  * "mensalmente" ou "todo mês" → intervalo_dias: 30
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
  "intervalo_dias": 0,
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
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content.trim();
  return JSON.parse(content);
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

// Revisão de categorias de gastos/ganhos — mesmo espírito de revisarCategorias, mas pra transações
async function revisarCategoriasGastos(gastos, listaCategoriasGasto, listaCategoriasGanho) {
  if (gastos.length === 0) return [];

  const lista = gastos.map((g, i) =>
    `${i + 1}. "${g.descricao}" (${g.natureza}) → atual: ${g.categoria}`
  ).join("\n");

  const prompt = `Você é um assistente organizador financeiro. Analise essas transações e verifique se as categorias fazem sentido.
Categorias de gasto disponíveis: ${listaCategoriasGasto}
Categorias de ganho disponíveis: ${listaCategoriasGanho}

Transações:
${lista}

Para cada transação que tiver uma categoria inadequada (errada pro tipo de despesa/ganho, ou claramente não combina com a descrição), sugira uma melhor — sempre da lista certa conforme a natureza (gasto usa categorias de gasto, ganho usa categorias de ganho).
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
        { type: "file", file: { filename: "documento.pdf", file_data: `data:application/pdf;base64,${base64}` } }
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

async function extrairEventoFaculdadeIA(texto, disciplinas = []) {
  const hoje = new Date().toISOString().slice(0, 10);
  const diaSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"][new Date().getDay()];
  const listaDisciplinas = disciplinas.length > 0 ? disciplinas.map(d => `- ${d}`).join("\n") : "(nenhuma disciplina cadastrada na grade)";
  const prompt = `Você é um extrator de eventos acadêmicos. Analise a mensagem e determine se ela menciona algo de faculdade para registrar.

Hoje é ${hoje} (${diaSemana}).

Disciplinas cadastradas na grade (use o nome exato quando a mensagem se referir a uma delas):
${listaDisciplinas}

Se a mensagem não é sobre faculdade → retorne a palavra null (sem JSON).

Se é sobre faculdade, retorne um JSON com um destes 6 modos:

1) "unico" — um evento pontual em uma única data:
{"modo":"unico","tipo":"prova"|"atividade"|"ead"|"aviso","disciplina":"nome exato ou null","titulo":"título descritivo","data":"YYYY-MM-DD","hora":"HH:MM:SS ou null"}

2) "intervalo" — o pedido se aplica a TODAS as ocorrências de uma disciplina dentro de um período (ex: "todas as aulas de X até o dia Y serão EAD", "essa semana toda de X é EAD"):
{"modo":"intervalo","tipo":"prova"|"atividade"|"ead"|"aviso","disciplina":"nome exato","titulo":"título descritivo","data_inicio":"YYYY-MM-DD (hoje se não especificado)","data_fim":"YYYY-MM-DD"}

3) "nota" — o usuário está informando o resultado/nota que tirou numa prova/atividade já existente (ex: "tirei 8.5 na prova de bd", "fiz 7 no trabalho de cálculo"):
{"modo":"nota","disciplina":"nome exato","evento_referencia":"trecho que identifica qual prova/atividade é (título ou tipo mencionado)","nota":8.5}

4) "formula" — o usuário está informando/definindo como a média final da disciplina é calculada (ex: "a média de cálculo é a soma das provas dividido por 2, mínimo 6 pra passar direto senão soma o exame final"):
{"modo":"formula","disciplina":"nome exato","formula_media":"a fórmula descrita, o mais fiel possível ao que foi dito"}

5) "aula" — o usuário quer CADASTRAR uma matéria nova na grade fixa semanal (ex: "tenho banco de dados terça e quinta das 9:35 às 11:35 com a professora Vanessa no bloco 14", "nova matéria: cálculo, segunda 08:00 às 10:00"):
{"modo":"aula","disciplina":"nome","professor":"nome ou null","turma":"turma ou null","dias":[array de dias da semana 0-6, domingo=0],"inicio":"HH:MM","fim":"HH:MM","local":"local ou null"}

6) "nao_suportado" — é sobre faculdade mas você não tem confiança de como registrar (disciplina não identificável, pedido ambíguo, ou não se encaixa em nenhum modo acima):
{"modo":"nao_suportado","motivo":"frase curta explicando o que faltou entender"}

Regras:
- "trabalho" → tipo "atividade"
- Datas relativas ("semana que vem na quinta", "próxima segunda", "daqui 2 semanas") → converter para data absoluta
- EAD = a(s) aula(s) será(ão) online → tipo "ead"
- NUNCA force o modo "unico" como chute quando o pedido na verdade é sobre um intervalo/várias aulas — use "intervalo" nesse caso
- NUNCA invente uma disciplina que não está na lista cadastrada — se não conseguir identificar com certeza, use "nao_suportado". EXCEÇÃO: no modo "aula" é normal e esperado que a disciplina NÃO esteja na lista — é justamente o modo de cadastrar uma matéria nova
- Título deve ser descritivo, ex: "Prova 1 — Banco de Dados", "Entrega do Trabalho", "Aula Online"

Responda APENAS com o JSON ({"resultado": null} se não for sobre faculdade, ou um dos formatos acima dentro de {"resultado": ...}).

Mensagem: "${texto.replace(/"/g, "'")}"`;

  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content.trim();
  try {
    const parsed = JSON.parse(content);
    const ev = parsed.resultado;
    if (!ev || !ev.modo) return null;
    if (ev.modo === "unico" && (!ev.tipo || !ev.data || !ev.titulo)) return null;
    if (ev.modo === "intervalo" && (!ev.tipo || !ev.disciplina || !ev.data_fim)) return null;
    if (ev.modo === "nota" && (!ev.disciplina || !ev.evento_referencia || ev.nota === undefined || ev.nota === null)) return null;
    if (ev.modo === "formula" && (!ev.disciplina || !ev.formula_media)) return null;
    if (ev.modo === "aula" && (!ev.disciplina || !Array.isArray(ev.dias) || ev.dias.length === 0 || !ev.inicio || !ev.fim)) return null;
    if (ev.modo === "nao_suportado" && !ev.motivo) return null;
    return ev;
  } catch {
    return null;
  }
}

// Extrai múltiplos itens de uma vez (foto/PDF de plano de ensino): eventos (provas/atividades) + fórmula da disciplina
async function extrairPlanoFaculdadeIA(base64, mimetype, disciplinas = []) {
  const hoje = new Date().toISOString().slice(0, 10);
  const listaDisciplinas = disciplinas.length > 0 ? disciplinas.map(d => `- ${d}`).join("\n") : "(nenhuma disciplina cadastrada na grade)";
  const prompt = `Você é um extrator de informações acadêmicas. Analise essa imagem/documento (pode ser um plano de ensino, cronograma, print de aviso, OU um horário/grade de aulas semanal — tabela de dia da semana × matéria, o tipo de imagem que a faculdade disponibiliza pro aluno) e extraia TODOS os itens relevantes de uma vez: datas de provas/atividades/trabalhos, a fórmula de cálculo da média, e/ou as matérias da grade semanal (com dia, horário, local, professor), conforme o que estiver presente.

Hoje é ${hoje}.

Disciplinas cadastradas na grade (use o nome exato quando identificar uma delas; se não conseguir identificar com certeza, use null nesse item):
${listaDisciplinas}

Responda APENAS com JSON válido, sem markdown:
{
  "eventos": [
    {"tipo":"prova"|"atividade"|"ead"|"aviso","disciplina":"nome exato ou null","titulo":"título descritivo","data":"YYYY-MM-DD","hora":"HH:MM:SS ou null"}
  ],
  "formula": {"disciplina":"nome exato","formula_media":"a fórmula descrita"} ou null,
  "aulas": [
    {"disciplina":"nome","professor":"nome ou null","turma":"turma ou null","dia":número de 0 (domingo) a 6 (sábado),"inicio":"HH:MM","fim":"HH:MM","local":"local ou null"}
  ]
}
Regras:
- "trabalho" e "lista de exercícios" → tipo "atividade"
- Se a imagem for uma grade/horário semanal, uma linha em "aulas" pra cada ocorrência (se a matéria tem 2 horários na semana, são 2 itens em "aulas", um por dia)
- Pra "aulas", a disciplina NÃO precisa estar na lista já cadastrada — é normal ser uma matéria nova (troca de semestre)
- Se não encontrar nada, retorne {"eventos":[],"formula":null,"aulas":[]}
- NUNCA invente datas, horários ou disciplinas que não estão claramente no documento`;

  const isImage = mimetype && (mimetype.includes("image") || mimetype.includes("jpeg") || mimetype.includes("png") || mimetype.includes("webp"));
  const content = isImage
    ? [{ type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } }, { type: "text", text: prompt }]
    : [{ type: "text", text: prompt }, { type: "file", file: { filename: "documento.pdf", file_data: `data:application/pdf;base64,${base64}` } }];

  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content }],
    max_tokens: 2800,
    response_format: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(response.choices[0].message.content.trim());
    return { eventos: parsed.eventos || [], formula: parsed.formula || null, aulas: parsed.aulas || [] };
  } catch {
    return { eventos: [], formula: null, aulas: [] };
  }
}

// Calcula a média/resumo de uma disciplina a partir da fórmula em texto livre + notas já lançadas
async function calcularMediaFaculdadeIA(disciplina, formulaMedia, eventos) {
  const lista = eventos.map(e =>
    `- ${e.tipo} "${e.titulo}": ${e.nota !== null && e.nota !== undefined ? `nota ${e.nota}` : "ainda sem nota"} (peso ${e.peso ?? 1})`
  ).join("\n");

  const prompt = `Você é um assistente que calcula médias acadêmicas. A nota de corte para passar é 6.0.

Disciplina: ${disciplina}
Fórmula de cálculo da média: ${formulaMedia}

Avaliações:
${lista}

Calcule a média atual (considerando só o que já tem nota) e explique, em um resumo curto e direto em português, o que falta pro aluno pra ser aprovado — por exemplo quanto precisa tirar nas avaliações que ainda não têm nota, ou se já está aprovado/reprovado.

Responda APENAS com JSON válido, sem markdown:
{"media_atual": número ou null se nenhuma nota lançada ainda, "notas_faltando": "frase curta sobre o que falta, ex: precisa de 7.0 na P2 pra passar direto", "resumo": "1-2 frases resumindo a situação"}`;

  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  try {
    return JSON.parse(response.choices[0].message.content.trim());
  } catch {
    return { media_atual: null, notas_faltando: "", resumo: "Não consegui calcular a média com a fórmula informada." };
  }
}

module.exports = { extrairDados, revisarCategorias, revisarCategoriasGastos, transcreverAudio, analisarImagem, analisarPDF, extrairExtrato, extrairExtratoTexto, extrairEventoFaculdadeIA, extrairPlanoFaculdadeIA, calcularMediaFaculdadeIA };
