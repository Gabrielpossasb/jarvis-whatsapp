// ─────────────────────────────────────────────
//  handlers/webhook.js — Lógica principal
// ─────────────────────────────────────────────

const { CONFIG } = require("../config");
const { obterEstado, salvarEstado, deletarEstado } = require("../services/pending-states");
const { encontrarSimilar } = require("../utils/similarity");
const { enviarMensagem, baixarMidia } = require("../services/evolution");
const { extrairDados, revisarCategorias, transcreverAudio, analisarImagem, analisarPDF, extrairExtratoTexto, extrairExtrato, extrairEventoFaculdadeIA, extrairPlanoFaculdadeIA, calcularMediaFaculdadeIA } = require("../services/openai");
const { getCategorias, getListaCategorias, adicionarCategoria, getEmoji } = require("../services/categorias");
const {
  adicionarGasto, adicionarTarefa,
  buscarTarefasPorPeriodo, buscarTodasTarefas,
  buscarTarefasConcluidasHoje,
  concluirTarefa, concluirTarefaDoDia, excluirTarefa,
  alterarCategoriaTarefa, alterarTarefa,
} = require("../services/tarefas");
const { formatarData, formatarHora, agora, amanha } = require("../utils/date");

// Serializa intervalo_dias no campo recorrente para evitar mudança de schema
function resolverRecorrente(dados) {
  if (dados.intervalo_dias && dados.intervalo_dias > 0) {
    return `intervalo:${dados.intervalo_dias}:${new Date().toISOString().slice(0, 10)}`;
  }
  return dados.recorrente || "Não";
}

// ── Busca tarefa por nome ─────────────────────────────────────────
async function encontrarTarefa(descBusca) {
  const todas = await buscarTodasTarefas();
  const normalizar = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const busca = normalizar(descBusca);
  const exato = todas.find(t => t.status !== "Concluída" && normalizar(t.descricao).includes(busca));
  if (exato) return exato;
  return encontrarSimilar(descBusca, todas, 0.4);
}
// ── Verifica duplicatas no extrato ────────────────────────────────
async function verificarDuplicatasExtrato(transacoes) {
  const { supabase } = require("../services/supabase");
  const { data: gastosExistentes } = await supabase.from("gastos").select("descricao, valor, data, mes");
  const novas = [];
  const duplicatas = [];
  for (const t of transacoes) {
    const isDuplicata = (gastosExistentes || []).some(g => {
      if (g.mes !== t.mes) return false;
      const mesmoValor = Math.abs(Number(g.valor) - Number(t.valor)) < 0.01;
      const descA = g.descricao?.toLowerCase().trim() || "";
      const descB = t.descricao?.toLowerCase().trim() || "";
      const mesmaDesc = descA === descB ||
        (descA.length >= 10 && descB.length >= 10 && descA.slice(0, 15) === descB.slice(0, 15));
      return mesmoValor && mesmaDesc;
    });
    if (isDuplicata) duplicatas.push(t);
    else novas.push(t);
  }
  return { novas, duplicatas };
}

// ── Adiciona lote de gastos ───────────────────────────────────────
async function adicionarLoteGastos(transacoes) {
  const { supabase } = require("../services/supabase");
  const { MESES } = require("../config");
  const mes = MESES[agora().getMonth()];
  const registros = transacoes.map(t => ({
    data: t.data, descricao: t.descricao, valor: t.valor,
    meio_pagamento: t.meio_pagamento, categoria: t.categoria,
    tipo: t.tipo, mes: t.mes || mes,
    natureza: t.natureza || "gasto",
  }));
  const { error } = await supabase.from("gastos").insert(registros);
  if (error) throw error;
  return registros.length;
}

// ── Formata mensagem do extrato ───────────────────────────────────
function formatarMsgExtrato(transacoes, titulo) {
  const total = transacoes.reduce((s, t) => s + Number(t.valor || 0), 0);
  let msg = `${titulo}\n\n`;
  transacoes.forEach((t, i) => {
    msg += `*${i + 1}.* ${t.descricao}\n`;
    msg += `   💰 R$ ${t.valor.toFixed(2)} · 📅 ${t.data} · 🏷️ ${t.categoria}\n\n`;
  });
  msg += `💸 Total: R$ ${total.toFixed(2)}`;
  return msg;
}

// ── Resposta de gasto ─────────────────────────────────────────────
function respostaGasto(dados, dataRegistro) {
  const emoji = dados.tipo_despesa === "fixa" ? "📌" : "💸";
  return [
    `✅ *Gasto registrado!*`, ``,
    `${emoji} *${dados.tipo_despesa === "fixa" ? "Despesa Fixa" : "Despesa Variável"}*`,
    `📅 ${dataRegistro} | 📝 ${dados.descricao}`,
    `💰 R$ ${Number(dados.valor).toFixed(2)} | 💳 ${dados.meio_pagamento}`,
    `🏷️ ${dados.categoria}`,
    ``, `🤖 _${dados.entendimento}_`,
  ].join("\n");
}

// ── Resposta de ganho ─────────────────────────────────────────────
function respostaGanho(dados, dataRegistro) {
  return [
    `✅ *Ganho registrado!*`, ``,
    `💚 *${dados.categoria}*`,
    `📅 ${dataRegistro} | 📝 ${dados.descricao}`,
    `💰 R$ ${Number(dados.valor).toFixed(2)} | 💜 ${dados.meio_pagamento}`,
    ``, `🤖 _${dados.entendimento}_`,
  ].join("\n");
}

// ── Resposta de tarefa ────────────────────────────────────────────
async function respostaTarefa(dados, dataRegistro) {
  const temHora = dados.hora && dados.hora !== "";
  const ehRecorrente = dados.recorrente && dados.recorrente !== "Não";
  const temLembrete = dados.dias_lembrete && dados.hora_lembrete;
  const isBacklog = dataRegistro === "backlog";
  const emoji = await getEmoji(dados.categoria);

  let horaLembrete1h = null;
  if (temHora && !ehRecorrente && !temLembrete) {
    const [h, m] = dados.hora.split(":").map(Number);
    const d = new Date(); d.setHours(h - 1, m);
    horaLembrete1h = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  return [
    `✅ *Tarefa adicionada!*`, ``,
    `${emoji} *${dados.descricao}*`,
    `🏷️ Categoria: ${dados.categoria}`,
    isBacklog ? `📂 Sem data definida` : `📅 Data: ${dataRegistro}`,
    ehRecorrente ? `🔁 Recorrente: toda ${dados.recorrente}` : ``,
    temHora && ehRecorrente ? `🔔 Lembrete às: ${dados.hora}` : ``,
    temHora && !ehRecorrente ? `⏰ Horário: ${dados.hora}` : ``,
    horaLembrete1h ? `🔔 Lembrete: ${horaLembrete1h} (1h antes)` : ``,
    temLembrete ? `📆 Lembretes: toda ${dados.dias_lembrete} às ${dados.hora_lembrete}` : ``,
    !temHora && !temLembrete && !isBacklog ? `📢 Aparece no resumo das 7h` : ``,
    ``, `🤖 _${dados.entendimento}_`,
  ].filter(l => l !== "").join("\n");
}

// ── Resposta de consulta ──────────────────────────────────────────
async function respostaConsulta(dados) {
  const periodo = dados.periodo || "hoje";
  const categoria = dados.categoria_filtro || "todas";
  const tarefas = await buscarTarefasPorPeriodo(periodo, categoria);

  let tarefasConcluidas = [];
  if (periodo === "hoje") {
    const todas = await buscarTarefasConcluidasHoje();
    tarefasConcluidas = categoria === "todas"
      ? todas
      : todas.filter(t => t.categoria.toLowerCase() === categoria.toLowerCase());
  }

  let titulo;
  const temCategoria = categoria !== "todas";

  if (periodo === "hoje") {
    titulo = temCategoria
      ? `${await getEmoji(categoria)} *Tarefas de ${categoria} — hoje (${formatarData()}):*`
      : `📋 *Tarefas de hoje (${formatarData()}):*`;
  } else if (periodo === "amanhã" || periodo === "amanha") {
    titulo = temCategoria
      ? `${await getEmoji(categoria)} *Tarefas de ${categoria} — amanhã (${amanha()}):*`
      : `📋 *Tarefas de amanhã (${amanha()}):*`;
  } else if (periodo === "backlog") {
    titulo = temCategoria
      ? `${await getEmoji(categoria)} *Tarefas de ${categoria}:*`
      : `📋 *Suas tarefas pendentes:*`;
  } else {
    titulo = temCategoria
      ? `${await getEmoji(categoria)} *Tarefas de ${categoria} — ${periodo}:*`
      : `📋 *Tarefas de ${periodo}:*`;
  }

  if (tarefas.length === 0 && tarefasConcluidas.length === 0) {
    return `${titulo}\n\nNenhuma tarefa encontrada! ✨`;
  }

  let msg = "";

  if (tarefas.length === 0) {
    msg = `${titulo}\n\n✅ Todas concluídas por hoje!`;
  } else if (categoria === "todas") {
    const porCategoria = {};
    for (const t of tarefas) {
      const cat = t.categoria || "Outros";
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(t);
    }
    msg = `${titulo}\n`;
    for (const [cat, itens] of Object.entries(porCategoria)) {
      const e = await getEmoji(cat);
      msg += `\n${e} *${cat}*\n`;
      const semH = itens.filter(t => !t.hora);
      const comH = itens.filter(t => t.hora).sort((a,b) => a.hora.localeCompare(b.hora));
      for (const t of semH) msg += `📌 ${t.descricao}\n`;
      for (const t of comH) msg += `⏰ ${t.hora} — ${t.descricao}\n`;
    }
  } else {
    msg = `${titulo}\n\n`;
    const semH = tarefas.filter(t => !t.hora);
    const comH = tarefas.filter(t => t.hora).sort((a,b) => a.hora.localeCompare(b.hora));
    for (const t of semH) msg += `📌 ${t.descricao}\n`;
    for (const t of comH) msg += `⏰ ${t.hora} — ${t.descricao}\n`;
  }

  if (tarefasConcluidas.length > 0) {
    msg += `\n✅ *Concluídas hoje:*\n`;
    for (const t of tarefasConcluidas) {
      const e = await getEmoji(t.categoria);
      msg += `${e} ~~${t.descricao}~~\n`;
    }
  }

  return msg;
}

// ════════════════════════════════════════════
//  CONTAGEM DE ESTOQUE — parseamento e atualização
// ════════════════════════════════════════════
const LINHA_CONTAGEM = /^(.+?)\s*[—–-]+\s*([\d,\.]+)\s*(kg|un)?\s*$/i;

function parsearContagemEstoque(texto) {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const itens = [];
  for (const linha of linhas) {
    const m = linha.match(LINHA_CONTAGEM);
    if (m) {
      const qtd = parseFloat(m[2].replace(",", "."));
      if (!isNaN(qtd) && qtd >= 0) {
        itens.push({ nome: m[1].trim(), quantidade: qtd, unidade: (m[3] || "").toLowerCase() || null });
      }
    }
  }
  return itens;
}

function normalizarNome(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

async function processarContagemEstoque(itens) {
  const { supabase } = require("../services/supabase");
  const { data: produtos } = await supabase
    .from("estoque_produtos")
    .select("id, nome, unidade, estoque_atual")
    .eq("ativo", true);

  if (!produtos || produtos.length === 0) return "⚠️ Nenhum produto cadastrado no estoque.";

  const atualizados = [];
  const naoEncontrados = [];
  const semAlteracao = [];
  const agora = new Date().toISOString();

  for (const item of itens) {
    const buscaNorm = normalizarNome(item.nome);
    const produto = produtos.find(p => normalizarNome(p.nome) === buscaNorm)
      || produtos.find(p => normalizarNome(p.nome).includes(buscaNorm))
      || produtos.find(p => buscaNorm.includes(normalizarNome(p.nome)));

    if (!produto) { naoEncontrados.push(item.nome); continue; }

    const novoValor = item.quantidade;
    const valorAtual = Number(produto.estoque_atual);
    if (novoValor === valorAtual) { semAlteracao.push(produto.nome); continue; }

    atualizados.push({ produto, novoValor, valorAtual });
  }

  if (atualizados.length === 0) {
    const linhas = ["📦 *Contagem recebida — sem alterações.*"];
    if (naoEncontrados.length > 0) linhas.push(`\n⚠️ Não encontrados: ${naoEncontrados.join(", ")}`);
    return linhas.join("\n");
  }

  const movimentos = atualizados.map(({ produto, novoValor, valorAtual }) => ({
    produto_id: produto.id,
    tipo: "contagem",
    quantidade: novoValor,
    observacao: `era ${valorAtual.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} → agora ${novoValor.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} ${produto.unidade}`,
    criado_em: agora,
  }));

  await supabase.from("estoque_movimentacoes").insert(movimentos);
  await Promise.all(
    atualizados.map(({ produto, novoValor }) =>
      supabase.from("estoque_produtos").update({ estoque_atual: novoValor }).eq("id", produto.id)
    )
  );

  let msg = `📦 *Estoque atualizado! ${atualizados.length} produto(s):*\n`;
  for (const { produto, novoValor, valorAtual } of atualizados) {
    const delta = novoValor - valorAtual;
    const sinal = delta > 0 ? `▲ +${Math.abs(delta).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}` : `▼ -${Math.abs(delta).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}`;
    msg += `\n• *${produto.nome}*: ${valorAtual.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} → ${novoValor.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} ${produto.unidade} _(${sinal})_`;
  }
  if (naoEncontrados.length > 0) msg += `\n\n⚠️ Não encontrados: _${naoEncontrados.join(", ")}_`;
  return msg;
}

// ════════════════════════════════════════════
//  EVENTOS DE FACULDADE — detecção via IA
// ════════════════════════════════════════════

// Gate rápido: só chama a IA se houver palavras-chave acadêmicas
function podeSerEventoFaculdade(texto) {
  const norm = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /\b(prova|atividade|trabalho|ead|aula online|aviso de faculdade|facul|nota|media|tirei|passar|resumo da materia|lista de exerc)\b/.test(norm);
}

async function buscarDisciplinas() {
  const { supabase } = require("../services/supabase");
  const { data } = await supabase.from("faculdade_aulas").select("disciplina").eq("ativo", true);
  return [...new Set((data || []).map(a => a.disciplina))];
}

async function detectarEventoFaculdade(texto) {
  if (!podeSerEventoFaculdade(texto)) return null;
  const disciplinas = await buscarDisciplinas();
  return extrairEventoFaculdadeIA(texto, disciplinas);
}

function ddmm(dataISO) {
  const [, m, d] = dataISO.split("-");
  return `${d}/${m}`;
}

// Enumera datas ISO entre início e fim (inclusive) cujo dia da semana bate com diaSemana (0-6)
function datasNoIntervalo(dataInicioISO, dataFimISO, diaSemana) {
  const datas = [];
  const [yi, mi, di] = dataInicioISO.split("-").map(Number);
  const [yf, mf, df] = dataFimISO.split("-").map(Number);
  const cursor = new Date(yi, mi - 1, di);
  const fim = new Date(yf, mf - 1, df);
  while (cursor <= fim) {
    if (cursor.getDay() === diaSemana) {
      datas.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return datas;
}

async function processarEventoFaculdadeUnico(evento) {
  const { supabase } = require("../services/supabase");
  const row = {
    tipo: evento.tipo,
    disciplina: evento.disciplina || null,
    titulo: evento.titulo,
    data: evento.data,
    hora: evento.hora || null,
    concluido: false,
  };
  const { error } = await supabase.from("faculdade_eventos").insert(row);
  if (error) throw error;

  const TIPOS_EMOJI = { prova: "📝 Prova", atividade: "📋 Atividade", ead: "💻 EAD", aviso: "📢 Aviso" };
  const texto = [
    `✅ *Evento registrado!*`, ``,
    `${TIPOS_EMOJI[evento.tipo] || "📅"}: *${evento.titulo}*`,
    evento.disciplina ? `📚 ${evento.disciplina}` : "",
    `📅 ${ddmm(evento.data)}${evento.hora ? ` às ${evento.hora.slice(0, 5)}` : ""}`,
    ``, `_Abra a aba Faculdade para ver todos os eventos._`,
  ].filter(Boolean).join("\n");
  return { texto };
}

// Aplica um evento (ex: EAD) a TODAS as ocorrências de uma disciplina num período — pede confirmação antes de gravar
async function processarEventoFaculdadeIntervalo(evento, remoteJid, texto) {
  if (!evento.disciplina) {
    await salvarEstado(remoteJid, "esclarecimento", { tipoOrigem: "evento_faculdade", textoOriginal: texto, contextoParcial: null });
    return { texto: `🤔 Entendi que é sobre várias aulas, mas não identifiquei de qual disciplina — pode especificar o nome?` };
  }

  const { supabase } = require("../services/supabase");
  const { data: aulas } = await supabase
    .from("faculdade_aulas")
    .select("dia, inicio")
    .eq("disciplina", evento.disciplina)
    .eq("ativo", true);

  if (!aulas || aulas.length === 0) {
    return { texto: `⚠️ Não encontrei aula de *${evento.disciplina}* na sua grade — não consegui aplicar em lote.` };
  }

  const dataInicio = evento.data_inicio || new Date().toISOString().slice(0, 10);
  const eventos = [];
  for (const aula of aulas) {
    for (const data of datasNoIntervalo(dataInicio, evento.data_fim, aula.dia)) {
      eventos.push({
        tipo: evento.tipo,
        disciplina: evento.disciplina,
        titulo: evento.titulo,
        data,
        hora: aula.inicio ? `${aula.inicio}:00` : null,
        concluido: false,
      });
    }
  }

  if (eventos.length === 0) {
    return { texto: `⚠️ Não há nenhuma aula de *${evento.disciplina}* entre ${ddmm(dataInicio)} e ${ddmm(evento.data_fim)}.` };
  }

  await salvarEstado(remoteJid, "evento_faculdade_lote", { eventos });

  const TIPOS_EMOJI = { prova: "📝", atividade: "📋", ead: "💻", aviso: "📢" };
  return {
    texto: [
      `${TIPOS_EMOJI[evento.tipo] || "📅"} Vou marcar *${eventos.length} aula(s)* de *${evento.disciplina}* como *${evento.tipo}* entre ${ddmm(dataInicio)} e ${ddmm(evento.data_fim)}:`,
      ``,
      eventos.map(e => ddmm(e.data)).join(", "),
      ``,
      `✅ _"sim"_ para confirmar`,
      `❌ _"não"_ para cancelar`,
    ].join("\n"),
    opcoes: { botoes: ["✅ Sim", "❌ Não"] },
  };
}

// Registra a nota de uma prova/atividade já cadastrada — casa evento_referencia contra os eventos da disciplina
async function processarEventoFaculdadeNota(evento, remoteJid, texto) {
  const { supabase } = require("../services/supabase");
  const { data: eventosDisc } = await supabase
    .from("faculdade_eventos")
    .select("id, tipo, titulo")
    .eq("disciplina", evento.disciplina);

  if (!eventosDisc || eventosDisc.length === 0) {
    return { texto: `⚠️ Não encontrei nenhuma prova/atividade cadastrada de *${evento.disciplina}* — cadastre o evento primeiro.` };
  }

  const candidatos = eventosDisc.map(e => ({ ...e, descricao: `${e.tipo} ${e.titulo}` }));
  const match = encontrarSimilar(evento.evento_referencia, candidatos, 0.35);

  if (!match) {
    await salvarEstado(remoteJid, "esclarecimento", { tipoOrigem: "nota_faculdade", textoOriginal: texto, contextoParcial: { disciplina: evento.disciplina, nota: evento.nota } });
    const lista = eventosDisc.map(e => `- ${e.tipo}: ${e.titulo}`).join("\n");
    return { texto: `🤔 Não identifiquei qual avaliação de *${evento.disciplina}* é essa nota. Qual delas?\n\n${lista}` };
  }

  const { error } = await supabase.from("faculdade_eventos").update({ nota: evento.nota }).eq("id", match.id);
  if (error) throw error;

  return { texto: `✅ *Nota registrada!*\n\n📚 ${evento.disciplina}\n${match.tipo === "prova" ? "📝" : "📋"} ${match.titulo}: *${evento.nota}*` };
}

// Cadastra/atualiza a fórmula de cálculo da média de uma disciplina
async function processarEventoFaculdadeFormula(evento) {
  const { supabase } = require("../services/supabase");
  const { error } = await supabase
    .from("faculdade_disciplinas")
    .upsert({ nome: evento.disciplina, formula_media: evento.formula_media }, { onConflict: "nome" });
  if (error) throw error;
  return { texto: `✅ *Fórmula de média salva!*\n\n📚 ${evento.disciplina}\n_${evento.formula_media}_` };
}

// Despacha o resultado de extrairEventoFaculdadeIA pelos 5 modos — usado tanto no fluxo normal quanto no reprocessamento após esclarecimento
async function despacharEventoFaculdade(eventoFac, remoteJid, texto) {
  if (eventoFac.modo === "nao_suportado") {
    await salvarEstado(remoteJid, "esclarecimento", { tipoOrigem: "evento_faculdade", textoOriginal: texto, contextoParcial: null });
    return { texto: `🤔 Entendi que é sobre faculdade, mas ${eventoFac.motivo}. Pode reformular?` };
  } else if (eventoFac.modo === "intervalo") {
    return processarEventoFaculdadeIntervalo(eventoFac, remoteJid, texto);
  } else if (eventoFac.modo === "nota") {
    return processarEventoFaculdadeNota(eventoFac, remoteJid, texto);
  } else if (eventoFac.modo === "formula") {
    return processarEventoFaculdadeFormula(eventoFac);
  }
  return processarEventoFaculdadeUnico(eventoFac);
}

// Explode o plano extraído de uma foto/PDF (vários eventos + fórmula opcional) e pede confirmação antes de gravar
async function processarPlanoFaculdade(plano, remoteJid) {
  const eventos = (plano.eventos || []).map(e => ({
    tipo: e.tipo, disciplina: e.disciplina || null, titulo: e.titulo, data: e.data, hora: e.hora || null, concluido: false,
  }));

  if (eventos.length === 0 && !plano.formula) {
    return null;
  }

  await salvarEstado(remoteJid, "plano_faculdade", { eventos, formula: plano.formula || null });

  const TIPOS_EMOJI = { prova: "📝", atividade: "📋", ead: "💻", aviso: "📢" };
  const linhas = [`📄 *Encontrei isso no documento:*`, ``];
  for (const e of eventos) {
    linhas.push(`${TIPOS_EMOJI[e.tipo] || "📅"} ${e.titulo}${e.disciplina ? ` — ${e.disciplina}` : ""} (${ddmm(e.data)})`);
  }
  if (plano.formula) {
    linhas.push(``, `📐 Fórmula de ${plano.formula.disciplina}: _${plano.formula.formula_media}_`);
  }
  linhas.push(``, `✅ _"sim"_ para confirmar e salvar tudo`, `❌ _"não"_ para cancelar`);

  return { texto: linhas.join("\n"), opcoes: { botoes: ["✅ Sim", "❌ Não"] } };
}

// ════════════════════════════════════════════
//  PROCESSAMENTO CENTRAL — usado pelo WhatsApp e pelo site
// ════════════════════════════════════════════
async function processarMensagem(texto, remoteJid, canal = "whatsapp") {
  // Função de envio — no WhatsApp manda pelo Evolution, no site retorna texto + opções de resposta rápida
  const respostas = [];
  let opcoesFinais = null;
  const responder = async (msg, opcoes) => {
    if (opcoes !== undefined) opcoesFinais = opcoes;
    if (canal === "web") {
      respostas.push(msg);
    } else {
      await enviarMensagem(remoteJid, msg);
    }
  };
  // ── Verifica extrato pendente ─────────────────────────────────
  const estadoExtrato = await obterEstado(remoteJid, "extrato");
  if (estadoExtrato) {
    const texto_lower = texto.toLowerCase().trim();
    const { novas, duplicatas } = estadoExtrato;

    if (["sim", "s", "tudo", "adicionar tudo", "pode", "confirmar"].some(p => texto_lower === p || texto_lower.includes(p))) {
      await deletarEstado(remoteJid, "extrato");
      const qtd = await adicionarLoteGastos(novas);
      await responder(`✅ *${qtd} gastos adicionados!*\n💸 Total: R$ ${novas.reduce((s,t) => s + t.valor, 0).toFixed(2)}`);
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }

    const matchNumeros = texto_lower.match(/(?:adicionar\s+)?([\d,\s]+)/);
    if (matchNumeros) {
      const nums = matchNumeros[1].split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      const selecionadas = nums.map(n => {
        if (n <= novas.length) return novas[n - 1];
        return (duplicatas || [])[n - novas.length - 1];
      }).filter(Boolean);
      if (selecionadas.length > 0) {
        await deletarEstado(remoteJid, "extrato");
        const qtd = await adicionarLoteGastos(selecionadas);
        await responder(`✅ *${qtd} gastos adicionados!*\n💸 Total: R$ ${selecionadas.reduce((s,t) => s + t.valor, 0).toFixed(2)}`);
        return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
      }
    }

    if (["não", "nao", "n", "cancelar", "cancel"].some(p => texto_lower === p || texto_lower.includes(p))) {
      await deletarEstado(remoteJid, "extrato");
      await responder("❌ Importação cancelada.");
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }

    // Detecta pedido de mudança de mês ("adicionar no julho", "muda para junho", "é de março")
    const MESES_DETECCAO = {
      "janeiro": "Janeiro", "fevereiro": "Fevereiro", "março": "Março", "marco": "Março",
      "abril": "Abril", "maio": "Maio", "junho": "Junho", "julho": "Julho",
      "agosto": "Agosto", "setembro": "Setembro", "outubro": "Outubro",
      "novembro": "Novembro", "dezembro": "Dezembro",
    };
    const mesMencionado = Object.keys(MESES_DETECCAO).find(m => texto_lower.includes(m));
    if (mesMencionado) {
      const novoMes = MESES_DETECCAO[mesMencionado];
      const novasAtualizadas = novas.map(t => ({ ...t, mes: novoMes }));
      await salvarEstado(remoteJid, "extrato", { novas: novasAtualizadas, duplicatas });
      const total = novasAtualizadas.reduce((s, t) => s + Number(t.valor || 0), 0);
      await responder([
        `📅 *Mês alterado para ${novoMes}!*`,
        ``,
        `${novasAtualizadas.length} transações · R$ ${total.toFixed(2)}`,
        ``,
        `✅ _"sim"_ para confirmar`,
        `❌ _"não"_ para cancelar`,
      ].join("\n"), { botoes: ["✅ Sim", "❌ Não"], dica: "Ou digite os números (ex: 1,3,5)" });
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }

    await responder(`Não entendi. Responda:\n✅ _"sim"_ para adicionar todas as ${novas.length} transações\n✅ _"1,3,5"_ para escolher\n📅 _"julho"_ para mudar o mês\n❌ _"não"_ para cancelar`, { botoes: ["✅ Sim", "❌ Não"], dica: "Ou digite os números (ex: 1,3,5)" });
    return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
  }
  
  // ── Verifica se há tarefa pendente de confirmação ─────────────
  const estadoTarefa = await obterEstado(remoteJid, "tarefa");
  if (estadoTarefa) {
    const textoBusca = texto.toLowerCase().trim();
    const { dados: dadosPendentes, dataRegistro: dataPendente } = estadoTarefa;

    const confirmou = ["sim", "s", "pode", "adicionar", "confirmar", "yes"].some(p => textoBusca.includes(p));
    const cancelou  = ["não", "nao", "n", "cancelar", "cancel", "no"].some(p => textoBusca.includes(p));

    if (confirmou) {
      await deletarEstado(remoteJid, "tarefa");
      await adicionarTarefa(dadosPendentes.descricao, dataPendente, dadosPendentes.hora || "", resolverRecorrente(dadosPendentes), dadosPendentes.categoria || "Outros", dadosPendentes.dias_lembrete || "", dadosPendentes.hora_lembrete || "");
      await responder(await respostaTarefa(dadosPendentes, dataPendente));
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    } else if (cancelou) {
      await deletarEstado(remoteJid, "tarefa");
      await responder(`❌ Cancelado! Tarefa não adicionada.`);
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }
    await deletarEstado(remoteJid, "tarefa");
  }

  // ── Verifica lote de eventos de faculdade pendente de confirmação ──
  const estadoEventoLote = await obterEstado(remoteJid, "evento_faculdade_lote");
  if (estadoEventoLote) {
    const textoBusca = texto.toLowerCase().trim();
    const { eventos } = estadoEventoLote;

    const confirmou = ["sim", "s", "pode", "confirmar", "yes"].some(p => textoBusca.includes(p));
    const cancelou  = ["não", "nao", "n", "cancelar", "cancel", "no"].some(p => textoBusca.includes(p));

    if (confirmou) {
      await deletarEstado(remoteJid, "evento_faculdade_lote");
      const { supabase } = require("../services/supabase");
      const { error } = await supabase.from("faculdade_eventos").insert(eventos);
      if (error) throw error;
      await responder(`✅ *${eventos.length} evento(s) registrado(s)!*\n\n_Abra a aba Faculdade para ver todos._`);
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    } else if (cancelou) {
      await deletarEstado(remoteJid, "evento_faculdade_lote");
      await responder(`❌ Cancelado! Nenhum evento adicionado.`);
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }
    await deletarEstado(remoteJid, "evento_faculdade_lote");
  }

  // ── Verifica plano de faculdade pendente (extraído de foto/PDF) de confirmação ──
  const estadoPlano = await obterEstado(remoteJid, "plano_faculdade");
  if (estadoPlano) {
    const textoBusca = texto.toLowerCase().trim();
    const { eventos, formula } = estadoPlano;

    const confirmou = ["sim", "s", "pode", "confirmar", "yes"].some(p => textoBusca.includes(p));
    const cancelou  = ["não", "nao", "n", "cancelar", "cancel", "no"].some(p => textoBusca.includes(p));

    if (confirmou) {
      await deletarEstado(remoteJid, "plano_faculdade");
      const { supabase } = require("../services/supabase");
      if (eventos.length > 0) {
        const { error } = await supabase.from("faculdade_eventos").insert(eventos);
        if (error) throw error;
      }
      if (formula) {
        const { error } = await supabase.from("faculdade_disciplinas").upsert({ nome: formula.disciplina, formula_media: formula.formula_media }, { onConflict: "nome" });
        if (error) throw error;
      }
      await responder(`✅ *Salvo!* ${eventos.length} evento(s)${formula ? " + fórmula de média" : ""} registrado(s).\n\n_Abra a aba Faculdade para ver tudo._`);
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    } else if (cancelou) {
      await deletarEstado(remoteJid, "plano_faculdade");
      await responder(`❌ Cancelado! Nada foi salvo.`);
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }
    await deletarEstado(remoteJid, "plano_faculdade");
  }

  // ── Verifica esclarecimento pendente (bot fez uma pergunta e espera resposta) ──
  const estadoEsclarecimento = await obterEstado(remoteJid, "esclarecimento");
  if (estadoEsclarecimento) {
    await deletarEstado(remoteJid, "esclarecimento");
    const { tipoOrigem, textoOriginal, contextoParcial } = estadoEsclarecimento;

    if (tipoOrigem === "evento_faculdade") {
      const textoCombinado = `${textoOriginal} (${texto})`;
      const eventoFac2 = await detectarEventoFaculdade(textoCombinado);
      const falhouDeNovo = !eventoFac2 || eventoFac2.modo === "nao_suportado" || (eventoFac2.modo === "intervalo" && !eventoFac2.disciplina);
      if (falhouDeNovo) {
        await responder("🤔 Ainda não consegui entender — manda a mensagem completa de novo?");
      } else {
        const r = await despacharEventoFaculdade(eventoFac2, remoteJid, textoCombinado);
        await responder(r.texto, r.opcoes);
      }
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }

    if (tipoOrigem === "dados_gerais") {
      const textoCombinado = `${textoOriginal} (${texto})`;
      const dados2 = await extrairDados(textoCombinado);
      if (dados2.classificacao === "nao_entendi") {
        await responder("🤔 Ainda não consegui entender — manda a mensagem completa de novo?");
      } else {
        await processarClassificacao(dados2, textoCombinado, remoteJid, responder);
      }
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }

    if (tipoOrigem === "tarefa_nao_encontrada") {
      const t = await encontrarTarefa(texto);
      if (!t) {
        await responder(`⚠️ Ainda não encontrei _"${texto}"_ — vamos começar de novo?`);
      } else {
        await executarAcaoTarefa(contextoParcial.acao, t, contextoParcial.extra, responder);
      }
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }

    if (tipoOrigem === "nota_faculdade") {
      const { supabase } = require("../services/supabase");
      const { data: eventosDisc } = await supabase
        .from("faculdade_eventos")
        .select("id, tipo, titulo")
        .eq("disciplina", contextoParcial.disciplina);
      const candidatos = (eventosDisc || []).map(e => ({ ...e, descricao: `${e.tipo} ${e.titulo}` }));
      const match = encontrarSimilar(texto, candidatos, 0.3);
      if (!match) {
        await responder(`⚠️ Ainda não identifiquei — vamos começar de novo?`);
      } else {
        const { error } = await supabase.from("faculdade_eventos").update({ nota: contextoParcial.nota }).eq("id", match.id);
        if (error) throw error;
        await responder(`✅ *Nota registrada!*\n\n📚 ${contextoParcial.disciplina}\n${match.tipo === "prova" ? "📝" : "📋"} ${match.titulo}: *${contextoParcial.nota}*`);
      }
      return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
    }
  }

  // ── Detecta contagem de estoque (formato "Produto — N kg/un") ──
  const itensContagem = parsearContagemEstoque(texto);
  if (itensContagem.length >= 2) {
    const resultado = await processarContagemEstoque(itensContagem);
    await responder(resultado);
    return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
  }

  // ── Detecta evento de faculdade (prova/atividade/EAD + data) ───
  const eventoFac = await detectarEventoFaculdade(texto);
  if (eventoFac) {
    const r = await despacharEventoFaculdade(eventoFac, remoteJid, texto);
    await responder(r.texto, r.opcoes);
    return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
  }

  const dados = await extrairDados(texto);
  await processarClassificacao(dados, texto, remoteJid, responder);

  return { texto: respostas.join("\n\n"), opcoes: opcoesFinais };
}

// ── Executa a ação (concluir/excluir/mudar_categoria/alterar_tarefa) já com a tarefa resolvida ──
async function executarAcaoTarefa(acao, t, extra, responder) {
  if (acao === "concluir") {
    const ehRecorrente = t.recorrente && t.recorrente !== "Não";
    if (ehRecorrente) await concluirTarefaDoDia(t.linha); else await concluirTarefa(t.linha);
    const e = await getEmoji(t.categoria);
    await responder(`✅ *Concluída!*\n\n${e} ~~${t.descricao}~~\n\n💪 _Boa, Gabriel!_`);

  } else if (acao === "excluir") {
    await excluirTarefa(t.linha);
    await responder(`🗑️ *${t.descricao}* excluída!`);

  } else if (acao === "mudar_categoria") {
    const anterior = t.categoria;
    await alterarCategoriaTarefa(t.linha, extra.novaCategoria);
    const eNovo = await getEmoji(extra.novaCategoria);
    await responder(`✅ *Categoria alterada!*\n\n📋 *${t.descricao}*\n🔄 ${anterior} → ${eNovo} ${extra.novaCategoria}`);

  } else if (acao === "alterar_tarefa") {
    const alteracoes = extra.alteracoes || {};
    if (Object.keys(alteracoes).length === 0) {
      await responder(`⚠️ Não entendi o que alterar. Tente: _"muda a data de X para Y"_`);
      return;
    }
    await alterarTarefa(t.linha, alteracoes);
    const e = await getEmoji(t.categoria);
    const mudancas = [];
    if (alteracoes.data) mudancas.push(`📅 Data: ${alteracoes.data === 'backlog' ? 'sem data definida' : alteracoes.data}`);
    if (alteracoes.hora) mudancas.push(`⏰ Hora: ${alteracoes.hora}`);
    if (alteracoes.dias_lembrete) mudancas.push(`📆 Dias lembrete: ${alteracoes.dias_lembrete}`);
    if (alteracoes.hora_lembrete) mudancas.push(`🔔 Hora lembrete: ${alteracoes.hora_lembrete}`);
    await responder([
      `✅ *Tarefa atualizada!*`, ``,
      `${e} *${t.descricao}*`,
      ...mudancas,
    ].join("\n"));
  }
}

// ── Despacha dados.classificacao (saída de extrairDados) ──
async function processarClassificacao(dados, texto, remoteJid, responder) {
  const dataRegistro = dados.data || formatarData();

  // ── GASTO ──────────────────────────────────────────────────────
  if (dados.classificacao === "gasto") {
    await adicionarGasto(dataRegistro, dados.descricao, dados.valor, dados.meio_pagamento, dados.categoria, dados.tipo_despesa, "gasto");
    await responder(respostaGasto(dados, dataRegistro));

  // ── GANHO ──────────────────────────────────────────────────────
  } else if (dados.classificacao === "ganho") {
    await adicionarGasto(dataRegistro, dados.descricao, dados.valor, dados.meio_pagamento, dados.categoria, "variavel", "ganho");
    await responder(respostaGanho(dados, dataRegistro));

  // ── TAREFA ─────────────────────────────────────────────────────
  } else if (dados.classificacao === "tarefa") {
    const todasParaVerificar = await buscarTodasTarefas();
    const similar = encontrarSimilar(dados.descricao, todasParaVerificar);

    if (similar) {
      await salvarEstado(remoteJid, "tarefa", { dados, dataRegistro });
      const eSimilar = await getEmoji(similar.categoria);
      const infoData = similar.data === "backlog" ? "sem data" : similar.data;
      await responder([
        `⚠️ *Tarefa parecida já existe!*`, ``,
        `${eSimilar} *${similar.descricao}*`,
        `📅 ${infoData} | 🏷️ ${similar.categoria} | 📌 ${similar.status}`,
        ``, `Quer adicionar mesmo assim?`,
        `✅ _"sim"_ para confirmar`,
        `❌ _"não"_ para cancelar`,
      ].join("\n"), { botoes: ["✅ Sim", "❌ Não"] });
      return;
    }

    await adicionarTarefa(dados.descricao, dataRegistro, dados.hora || "", resolverRecorrente(dados), dados.categoria || "Outros", dados.dias_lembrete || "", dados.hora_lembrete || "");
    await responder(await respostaTarefa(dados, dataRegistro));

  // ── CONSULTA ───────────────────────────────────────────────────
  } else if (dados.classificacao === "consulta") {
    await responder(await respostaConsulta(dados));

  // ── CONCLUIR ───────────────────────────────────────────────────
  } else if (dados.classificacao === "concluir") {
    const t = await encontrarTarefa(dados.descricao);
    if (t) {
      await executarAcaoTarefa("concluir", t, null, responder);
    } else {
      await salvarEstado(remoteJid, "esclarecimento", { tipoOrigem: "tarefa_nao_encontrada", textoOriginal: texto, contextoParcial: { acao: "concluir", extra: null } });
      await responder(`⚠️ Não encontrei _"${dados.descricao}"_ em aberto. Responda só com o nome certo da tarefa.`);
    }

  // ── EXCLUIR ────────────────────────────────────────────────────
  } else if (dados.classificacao === "excluir") {
    const t = await encontrarTarefa(dados.descricao);
    if (t) {
      await executarAcaoTarefa("excluir", t, null, responder);
    } else {
      await salvarEstado(remoteJid, "esclarecimento", { tipoOrigem: "tarefa_nao_encontrada", textoOriginal: texto, contextoParcial: { acao: "excluir", extra: null } });
      await responder(`⚠️ Não encontrei _"${dados.descricao}"_. Responda só com o nome certo da tarefa.`);
    }

  // ── MUDAR CATEGORIA ────────────────────────────────────────────
  } else if (dados.classificacao === "mudar_categoria") {
    const t = await encontrarTarefa(dados.descricao);
    if (t) {
      await executarAcaoTarefa("mudar_categoria", t, { novaCategoria: dados.nova_categoria }, responder);
    } else {
      await salvarEstado(remoteJid, "esclarecimento", { tipoOrigem: "tarefa_nao_encontrada", textoOriginal: texto, contextoParcial: { acao: "mudar_categoria", extra: { novaCategoria: dados.nova_categoria } } });
      await responder(`⚠️ Não encontrei _"${dados.descricao}"_. Responda só com o nome certo da tarefa.`);
    }

  // ── ADICIONAR CATEGORIA ────────────────────────────────────────
  } else if (dados.classificacao === "adicionar_categoria") {
    const nome = dados.nova_categoria_nome;
    const emoji = dados.nova_categoria_emoji || "📌";
    const adicionou = await adicionarCategoria(nome, emoji);
    if (adicionou) {
      await responder(`✅ *Categoria criada!*\n\n${emoji} *${nome}*\n\nJá pode usá-la nas suas tarefas!`);
    } else {
      await responder(`⚠️ A categoria *${nome}* já existe!`);
    }

  // ── REVISAR CATEGORIAS ─────────────────────────────────────────
  } else if (dados.classificacao === "revisar_categorias") {
    await responder("🔍 Analisando categorias das suas tarefas...");
    const tarefas = await buscarTodasTarefas();
    const pendentes = tarefas.filter(t => t.status !== "Concluída");

    if (pendentes.length === 0) {
      await responder("Nenhuma tarefa pendente para revisar! ✨");
      return;
    }

    const listaCats = await getListaCategorias();
    const sugestoes = await revisarCategorias(pendentes, listaCats);

    if (sugestoes.length === 0) {
      await responder("✅ Todas as categorias estão corretas! Nenhuma sugestão.");
      return;
    }

    const sugestoesComLinha = sugestoes.map(s => {
      const tarefa = pendentes[s.numero - 1];
      return { ...s, linha: tarefa?.linha };
    });

    await salvarEstado(remoteJid, "review", sugestoesComLinha);

    let msg = `🔍 *Sugestões de categoria (${sugestoes.length}):*\n\n`;
    for (const s of sugestoes) {
      const eAtual = await getEmoji(s.categoriaAtual);
      const eSugerida = await getEmoji(s.categoriaSugerida);
      msg += `*${s.numero}.* ${s.descricao}\n`;
      msg += `   ${eAtual} ${s.categoriaAtual} → ${eSugerida} ${s.categoriaSugerida}\n`;
      msg += `   _${s.motivo}_\n\n`;
    }
    msg += `Responda:\n✅ _"aprovar tudo"_ para aplicar todas\n✅ _"aprovar 1,3"_ para escolher\n❌ _"rejeitar tudo"_ para cancelar`;
    await responder(msg, { botoes: ["✅ Aprovar tudo", "❌ Rejeitar tudo"], dica: "Ou digite os números que quer aprovar (ex: 1,3)" });

  // ── APROVAR REVISÃO ────────────────────────────────────────────
  } else if (dados.classificacao === "aprovar_revisao") {
    const sugestoes = await obterEstado(remoteJid, "review");
    if (!sugestoes || sugestoes.length === 0) {
      await responder("⚠️ Nenhuma revisão pendente. Peça _\"revisa as categorias\"_ primeiro!");
      return;
    }

    const aprovados = dados.aprovados || "nenhum";
    let paraAplicar = [];

    if (aprovados === "tudo") {
      paraAplicar = sugestoes;
    } else if (aprovados !== "nenhum") {
      const nums = aprovados.split(",").map(n => parseInt(n.trim()));
      paraAplicar = sugestoes.filter(s => nums.includes(s.numero));
    }

    if (paraAplicar.length === 0) {
      await deletarEstado(remoteJid, "review");
      await responder("❌ Revisão cancelada. Nenhuma alteração feita.");
      return;
    }

    for (const s of paraAplicar) {
      if (s.linha) await alterarCategoriaTarefa(s.linha, s.categoriaSugerida);
    }

    await deletarEstado(remoteJid, "review");
    await responder(`✅ *${paraAplicar.length} categoria(s) atualizada(s)!*\n\n${paraAplicar.map(s => `📋 ${s.descricao} → ${s.categoriaSugerida}`).join("\n")}`);

  // ── ALTERAR TAREFA ─────────────────────────────────────────────
  } else if (dados.classificacao === "alterar_tarefa") {
    const t = await encontrarTarefa(dados.descricao);
    if (!t) {
      await salvarEstado(remoteJid, "esclarecimento", { tipoOrigem: "tarefa_nao_encontrada", textoOriginal: texto, contextoParcial: { acao: "alterar_tarefa", extra: { alteracoes: dados.alteracoes || {} } } });
      await responder(`⚠️ Não encontrei _"${dados.descricao}"_. Responda só com o nome certo da tarefa.`);
      return;
    }

    await executarAcaoTarefa("alterar_tarefa", t, { alteracoes: dados.alteracoes || {} }, responder);

  } else if (dados.classificacao === "extrato_texto") {
    await responder("📊 Analisando extrato...");
    try {
      const transacoes = await extrairExtratoTexto(texto);
      if (!transacoes || transacoes.length === 0) {
        await responder("⚠️ Não encontrei transações no texto enviado.");
        return;
      }
      const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
      if (novas.length === 0) {
        await responder(`⚠️ Todas as ${transacoes.length} transações já existem nos seus gastos!`);
        return;
      }
      await salvarEstado(remoteJid, "extrato", { novas, duplicatas });
      let msg = `📊 *Extrato analisado!*\nEncontrei *${transacoes.length} transações*.\n\n`;
      msg += formatarMsgExtrato(novas, `✅ *${novas.length} novas transações:*`);
      if (duplicatas.length > 0) {
        msg += `\n\n⚠️ *${duplicatas.length} possíveis duplicatas* (já existem no mês):\n`;
        duplicatas.forEach((t, i) => {
          msg += `*${novas.length + i + 1}.* ${t.descricao} — R$ ${t.valor.toFixed(2)} · ${t.data}\n`;
        });
        msg += `_Use o número para incluir mesmo assim._\n`;
      }
      msg += `\n\nO que deseja?\n✅ _"sim"_ para adicionar todas as novas\n✅ _"1,3,5"_ para escolher (inclua o nº da duplicata se quiser)\n❌ _"não"_ para cancelar`;
      await responder(msg, { botoes: ["✅ Sim", "❌ Não"], dica: "Ou digite os números (ex: 1,3,5)" });
    } catch (err) {
      await responder(`❌ Erro ao analisar extrato: ${err.message}`);
    }

  } else {
    await salvarEstado(remoteJid, "esclarecimento", { tipoOrigem: "dados_gerais", textoOriginal: texto, contextoParcial: null });
    await responder(`🤔 *Não tive certeza:* ${dados.entendimento}`);
  }
}

// Tenta extrair um plano de faculdade (provas/atividades/fórmula) de uma foto ou PDF antes do fluxo genérico de gasto/tarefa
async function detectarPlanoFaculdadeDeArquivo(base64, mimetype, remoteJid) {
  const disciplinas = await buscarDisciplinas();
  const plano = await extrairPlanoFaculdadeIA(base64, mimetype, disciplinas);
  return processarPlanoFaculdade(plano, remoteJid);
}

// ════════════════════════════════════════════
//  WEBHOOK — WhatsApp via Evolution API
// ════════════════════════════════════════════
async function handleWebhook(req, res) {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.event !== "messages.upsert") return;

    const data = body.data;
    const remoteJid = data?.key?.remoteJid;
    const fromMe = data?.key?.fromMe;

    if (remoteJid !== CONFIG.NUMERO_AUTORIZADO) return;
    if (fromMe === true && !data?.pushName) return;

    const message = data?.message;
    if (!message) return;

    let textoParaAnalisar = null;

    if (message.conversation || message.extendedTextMessage?.text) {
      textoParaAnalisar = message.conversation || message.extendedTextMessage?.text;
    } else if (message.audioMessage || message.pttMessage) {
      await enviarMensagem(remoteJid, "🎤 Transcrevendo áudio...");
      const base64 = await baixarMidia(data);
      textoParaAnalisar = await transcreverAudio(base64, "audio/ogg; codecs=opus");
      await enviarMensagem(remoteJid, `📝 _"${textoParaAnalisar}"_\n\nAnalisando...`);
    } else if (message.imageMessage) {
      await enviarMensagem(remoteJid, "📸 Analisando foto...");
      const base64 = await baixarMidia(data);
      const mimetype = message.imageMessage.mimetype || "image/jpeg";
      const plano = await detectarPlanoFaculdadeDeArquivo(base64, mimetype, remoteJid);
      if (plano) { await enviarMensagem(remoteJid, plano.texto); return; }
      textoParaAnalisar = await analisarImagem(base64, mimetype);
    } else if (message.documentMessage) {
      if (!message.documentMessage.mimetype?.includes("pdf")) {
        await enviarMensagem(remoteJid, "⚠️ Só aceito PDFs!");
        return;
      }
      await enviarMensagem(remoteJid, "📄 Analisando PDF...");
      const base64 = await baixarMidia(data);
      const plano = await detectarPlanoFaculdadeDeArquivo(base64, "application/pdf", remoteJid);
      if (plano) { await enviarMensagem(remoteJid, plano.texto); return; }
      textoParaAnalisar = await analisarPDF(base64);
    } else {
      await enviarMensagem(remoteJid, "⚠️ Mande texto, áudio, foto ou PDF!");
      return;
    }

    if (!textoParaAnalisar) return;

    await processarMensagem(textoParaAnalisar, remoteJid, "whatsapp");

  } catch (err) {
    console.error("Erro webhook:", err);
    try {
      const remoteJid = req.body?.data?.key?.remoteJid;
      if (remoteJid) await enviarMensagem(remoteJid, `❌ Erro: ${err.message}`);
    } catch (_) {}
  }
}

// ════════════════════════════════════════════
//  API WEB — Site/App
// ════════════════════════════════════════════
async function handleWebChat(req, res) {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ erro: "texto obrigatório" });

    // Usa o número autorizado como ID de sessão para manter estado (pendingTaskAdd etc.)
    const sessionId = CONFIG.NUMERO_AUTORIZADO;
    const resultado = await processarMensagem(texto, sessionId, "web");

    res.json(resultado);
  } catch (err) {
    console.error("Erro web chat:", err);
    res.status(500).json({ erro: err.message });
  }
}

async function handleMensagemArquivo(req, res) {
  try {
    const { base64, mimetype, texto } = req.body;
    if (!base64 || !mimetype) return res.status(400).json({ erro: "base64 e mimetype obrigatórios" });

    const sessionId = CONFIG.NUMERO_AUTORIZADO;
    if (mimetype.startsWith("image/") || mimetype === "application/pdf") {
      const plano = await detectarPlanoFaculdadeDeArquivo(base64, mimetype, sessionId);
      if (plano) return res.json(plano);
    }

    let conteudo = "";
    if (mimetype.startsWith("audio/")) {
      conteudo = await transcreverAudio(base64, mimetype);
    } else if (mimetype.startsWith("image/")) {
      conteudo = await analisarImagem(base64, mimetype);
    } else if (mimetype === "application/pdf") {
      conteudo = await analisarPDF(base64);
    }

    const mensagem = [texto, conteudo].filter(Boolean).join("\n");
    const resultado = await processarMensagem(mensagem, sessionId, "web");
    res.json(resultado);
  } catch (err) {
    console.error("Erro mensagem arquivo:", err);
    res.status(500).json({ erro: err.message });
  }
}

async function handleTranscricaoAudio(req, res) {
  try {
    const { base64, mimetype } = req.body;
    if (!base64 || !mimetype) return res.status(400).json({ erro: "base64 e mimetype obrigatórios" });
    const texto = await transcreverAudio(base64, mimetype);
    res.json({ texto });
  } catch (err) {
    console.error("Erro transcrição áudio:", err);
    res.status(500).json({ erro: err.message });
  }
}

async function handleExtratoUpload(req, res) {
  try {
    const { base64, mimetype, contexto } = req.body;
    if (!base64 || !mimetype) return res.status(400).json({ erro: "base64 e mimetype obrigatórios" });
    const transacoes = await extrairExtrato(base64, mimetype, contexto || "");
    if (!transacoes || transacoes.length === 0) {
      return res.status(422).json({ erro: "Nenhuma transação encontrada no extrato" });
    }
    const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
    res.json({ transacoes, novas, duplicatas });
  } catch (err) {
    console.error("Erro extrato upload:", err);
    res.status(500).json({ erro: err.message });
  }
}

async function handleExtratoConfirmar(req, res) {
  try {
    const { transacoes } = req.body;
    if (!transacoes || transacoes.length === 0) {
      return res.status(400).json({ erro: "Nenhuma transação para adicionar" });
    }
    const qtd = await adicionarLoteGastos(transacoes);
    res.json({ adicionados: qtd });
  } catch (err) {
    console.error("Erro confirmar extrato:", err);
    res.status(500).json({ erro: err.message });
  }
}

module.exports = { handleWebhook, handleWebChat, handleMensagemArquivo, handleTranscricaoAudio, handleExtratoUpload, handleExtratoConfirmar };
