// ─────────────────────────────────────────────
//  handlers/webhook.js — Lógica principal
// ─────────────────────────────────────────────

const { CONFIG } = require("../config");
const { pendingReviews, pendingTaskAdd, pendingExtrato } = require("../state");
const { encontrarSimilar } = require("../utils/similarity");
const { enviarMensagem, baixarMidia } = require("../services/evolution");
const { extrairDados, revisarCategorias, transcreverAudio, analisarImagem, analisarPDF, extrairExtratoTexto, extrairExtrato } = require("../services/openai");
const { getCategorias, getListaCategorias, adicionarCategoria, getEmoji } = require("../services/categorias");
const {
  adicionarGasto, adicionarTarefa,
  buscarTarefasPorPeriodo, buscarTodasTarefas,
  buscarTarefasConcluidasHoje,
  concluirTarefa, concluirTarefaDoDia, excluirTarefa,
  alterarCategoriaTarefa, alterarTarefa,
} = require("../services/sheets");
const { formatarData, formatarHora, agora, amanha } = require("../utils/date");

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
      const mesmoValor = Math.abs(Number(g.valor) - Number(t.valor)) < 0.01;
      const mesmaDesc = g.descricao?.toLowerCase().includes(t.descricao?.toLowerCase().slice(0, 6)) ||
                        t.descricao?.toLowerCase().includes(g.descricao?.toLowerCase().slice(0, 6));
      const mesmaData = g.data === t.data;
      return mesmoValor && (mesmaDesc || mesmaData);
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
//  PROCESSAMENTO CENTRAL — usado pelo WhatsApp e pelo site
// ════════════════════════════════════════════
async function processarMensagem(texto, remoteJid, canal = "whatsapp") {
  // Função de envio — no WhatsApp manda pelo Evolution, no site retorna texto
  const respostas = [];
  const responder = async (msg) => {
    if (canal === "web") {
      respostas.push(msg);
    } else {
      await enviarMensagem(remoteJid, msg);
    }
  };
  // ── Verifica extrato pendente ─────────────────────────────────
  if (pendingExtrato.has(remoteJid)) {
    const texto_lower = texto.toLowerCase().trim();
    const { novas, duplicatas } = pendingExtrato.get(remoteJid);

    if (["sim", "s", "tudo", "adicionar tudo", "pode", "confirmar"].some(p => texto_lower === p || texto_lower.includes(p))) {
      pendingExtrato.delete(remoteJid);
      const qtd = await adicionarLoteGastos(novas);
      await responder(`✅ *${qtd} gastos adicionados!*\n💸 Total: R$ ${novas.reduce((s,t) => s + t.valor, 0).toFixed(2)}`);
      return respostas.join("\n\n");
    }

    const matchNumeros = texto_lower.match(/(?:adicionar\s+)?([\d,\s]+)/);
    if (matchNumeros) {
      const nums = matchNumeros[1].split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      const selecionadas = nums.map(n => novas[n - 1]).filter(Boolean);
      if (selecionadas.length > 0) {
        pendingExtrato.delete(remoteJid);
        const qtd = await adicionarLoteGastos(selecionadas);
        await responder(`✅ *${qtd} gastos adicionados!*\n💸 Total: R$ ${selecionadas.reduce((s,t) => s + t.valor, 0).toFixed(2)}`);
        return respostas.join("\n\n");
      }
    }

    if (["não", "nao", "n", "cancelar", "cancel"].some(p => texto_lower === p || texto_lower.includes(p))) {
      pendingExtrato.delete(remoteJid);
      await responder("❌ Importação cancelada.");
      return respostas.join("\n\n");
    }

    await responder(`Não entendi. Responda:\n✅ _"sim"_ para adicionar todas as ${novas.length} transações\n✅ _"1,3,5"_ para escolher\n❌ _"não"_ para cancelar`);
    return respostas.join("\n\n");
  }
  
  // ── Verifica se há tarefa pendente de confirmação ─────────────
  if (pendingTaskAdd.has(remoteJid)) {
    const textoBusca = texto.toLowerCase().trim();
    const { dados: dadosPendentes, dataRegistro: dataPendente } = pendingTaskAdd.get(remoteJid);

    const confirmou = ["sim", "s", "pode", "adicionar", "confirmar", "yes"].some(p => textoBusca.includes(p));
    const cancelou  = ["não", "nao", "n", "cancelar", "cancel", "no"].some(p => textoBusca.includes(p));

    if (confirmou) {
      pendingTaskAdd.delete(remoteJid);
      await adicionarTarefa(dadosPendentes.descricao, dataPendente, dadosPendentes.hora || "", dadosPendentes.recorrente || "Não", dadosPendentes.categoria || "Outros", dadosPendentes.dias_lembrete || "", dadosPendentes.hora_lembrete || "");
      await responder(await respostaTarefa(dadosPendentes, dataPendente));
      return respostas.join("\n\n");
    } else if (cancelou) {
      pendingTaskAdd.delete(remoteJid);
      await responder(`❌ Cancelado! Tarefa não adicionada.`);
      return respostas.join("\n\n");
    }
    pendingTaskAdd.delete(remoteJid);
  }

  const dados = await extrairDados(texto);
  const dataRegistro = dados.data || formatarData();

  // ── GASTO ──────────────────────────────────────────────────────
  if (dados.classificacao === "gasto") {
    await adicionarGasto(dataRegistro, dados.descricao, dados.valor, dados.meio_pagamento, dados.categoria, dados.tipo_despesa);
    await responder(respostaGasto(dados, dataRegistro));

  // ── TAREFA ─────────────────────────────────────────────────────
  } else if (dados.classificacao === "tarefa") {
    const todasParaVerificar = await buscarTodasTarefas();
    const similar = encontrarSimilar(dados.descricao, todasParaVerificar);

    if (similar) {
      pendingTaskAdd.set(remoteJid, { dados, dataRegistro });
      const eSimilar = await getEmoji(similar.categoria);
      const infoData = similar.data === "backlog" ? "sem data" : similar.data;
      await responder([
        `⚠️ *Tarefa parecida já existe!*`, ``,
        `${eSimilar} *${similar.descricao}*`,
        `📅 ${infoData} | 🏷️ ${similar.categoria} | 📌 ${similar.status}`,
        ``, `Quer adicionar mesmo assim?`,
        `✅ _"sim"_ para confirmar`,
        `❌ _"não"_ para cancelar`,
      ].join("\n"));
      return respostas.join("\n\n");
    }

    await adicionarTarefa(dados.descricao, dataRegistro, dados.hora || "", dados.recorrente || "Não", dados.categoria || "Outros", dados.dias_lembrete || "", dados.hora_lembrete || "");
    await responder(await respostaTarefa(dados, dataRegistro));

  // ── CONSULTA ───────────────────────────────────────────────────
  } else if (dados.classificacao === "consulta") {
    await responder(await respostaConsulta(dados));

  // ── CONCLUIR ───────────────────────────────────────────────────
  } else if (dados.classificacao === "concluir") {
    const t = await encontrarTarefa(dados.descricao);
    if (t) {
      const ehRecorrente = t.recorrente && t.recorrente !== "Não";
      if (ehRecorrente) {
        await concluirTarefaDoDia(t.linha);
      } else {
        await concluirTarefa(t.linha);
      }
      const e = await getEmoji(t.categoria);
      await responder(`✅ *Concluída!*\n\n${e} ~~${t.descricao}~~\n\n💪 _Boa, Gabriel!_`);
    } else {
      await responder(`⚠️ Não encontrei _"${dados.descricao}"_ em aberto.`);
    }

  // ── EXCLUIR ────────────────────────────────────────────────────
  } else if (dados.classificacao === "excluir") {
    const t = await encontrarTarefa(dados.descricao);
    if (t) {
      await excluirTarefa(t.linha);
      await responder(`🗑️ *${t.descricao}* excluída!`);
    } else {
      await responder(`⚠️ Não encontrei _"${dados.descricao}"_.`);
    }

  // ── MUDAR CATEGORIA ────────────────────────────────────────────
  } else if (dados.classificacao === "mudar_categoria") {
    const t = await encontrarTarefa(dados.descricao);
    if (t) {
      const anterior = t.categoria;
      await alterarCategoriaTarefa(t.linha, dados.nova_categoria);
      const eNovo = await getEmoji(dados.nova_categoria);
      await responder(`✅ *Categoria alterada!*\n\n📋 *${t.descricao}*\n🔄 ${anterior} → ${eNovo} ${dados.nova_categoria}`);
    } else {
      await responder(`⚠️ Não encontrei _"${dados.descricao}"_.`);
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
      return respostas.join("\n\n");
    }

    const listaCats = await getListaCategorias();
    const sugestoes = await revisarCategorias(pendentes, listaCats);

    if (sugestoes.length === 0) {
      await responder("✅ Todas as categorias estão corretas! Nenhuma sugestão.");
      return respostas.join("\n\n");
    }

    const sugestoesComLinha = sugestoes.map(s => {
      const tarefa = pendentes[s.numero - 1];
      return { ...s, linha: tarefa?.linha };
    });

    pendingReviews.set(remoteJid, sugestoesComLinha);

    let msg = `🔍 *Sugestões de categoria (${sugestoes.length}):*\n\n`;
    for (const s of sugestoes) {
      const eAtual = await getEmoji(s.categoriaAtual);
      const eSugerida = await getEmoji(s.categoriaSugerida);
      msg += `*${s.numero}.* ${s.descricao}\n`;
      msg += `   ${eAtual} ${s.categoriaAtual} → ${eSugerida} ${s.categoriaSugerida}\n`;
      msg += `   _${s.motivo}_\n\n`;
    }
    msg += `Responda:\n✅ _"aprovar tudo"_ para aplicar todas\n✅ _"aprovar 1,3"_ para escolher\n❌ _"rejeitar tudo"_ para cancelar`;
    await responder(msg);

  // ── APROVAR REVISÃO ────────────────────────────────────────────
  } else if (dados.classificacao === "aprovar_revisao") {
    const sugestoes = pendingReviews.get(remoteJid);
    if (!sugestoes || sugestoes.length === 0) {
      await responder("⚠️ Nenhuma revisão pendente. Peça _\"revisa as categorias\"_ primeiro!");
      return respostas.join("\n\n");
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
      pendingReviews.delete(remoteJid);
      await responder("❌ Revisão cancelada. Nenhuma alteração feita.");
      return respostas.join("\n\n");
    }

    for (const s of paraAplicar) {
      if (s.linha) await alterarCategoriaTarefa(s.linha, s.categoriaSugerida);
    }

    pendingReviews.delete(remoteJid);
    await responder(`✅ *${paraAplicar.length} categoria(s) atualizada(s)!*\n\n${paraAplicar.map(s => `📋 ${s.descricao} → ${s.categoriaSugerida}`).join("\n")}`);

  // ── ALTERAR TAREFA ─────────────────────────────────────────────
  } else if (dados.classificacao === "alterar_tarefa") {
    const t = await encontrarTarefa(dados.descricao);
    if (!t) {
      await responder(`⚠️ Não encontrei _"${dados.descricao}"_.`);
      return respostas.join("\n\n");
    }

    const alteracoes = dados.alteracoes || {};
    if (Object.keys(alteracoes).length === 0) {
      await responder(`⚠️ Não entendi o que alterar. Tente: _"muda a data de X para Y"_`);
      return respostas.join("\n\n");
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
      ``, `🤖 _${dados.entendimento}_`,
    ].join("\n"));

    } else if (dados.classificacao === "extrato_texto") {
    await responder("📊 Analisando extrato...");
    try {
      const transacoes = await extrairExtratoTexto(texto);
      if (!transacoes || transacoes.length === 0) {
        await responder("⚠️ Não encontrei transações no texto enviado.");
        return respostas.join("\n\n");
      }
      const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
      if (novas.length === 0) {
        await responder(`⚠️ Todas as ${transacoes.length} transações já existem nos seus gastos!`);
        return respostas.join("\n\n");
      }
      pendingExtrato.set(remoteJid, { novas, duplicatas });
      let msg = `📊 *Extrato analisado!*\nEncontrei *${transacoes.length} transações*.\n\n`;
      msg += formatarMsgExtrato(novas, `✅ *${novas.length} novas transações:*`);
      if (duplicatas.length > 0) {
        msg += `\n\n⚠️ *${duplicatas.length} possíveis duplicatas:*\n`;
        duplicatas.forEach(t => { msg += `• ${t.descricao} — R$ ${t.valor.toFixed(2)} · ${t.data}\n`; });
      }
      msg += `\n\nO que deseja?\n✅ _"sim"_ para adicionar todas\n✅ _"1,3,5"_ para escolher\n❌ _"não"_ para cancelar`;
      await responder(msg);
    } catch (err) {
      await responder(`❌ Erro ao analisar extrato: ${err.message}`);
    }

  } else {
    await responder(`🤖 *JARVIS:* ${dados.entendimento}`);
  }

  return respostas.join("\n\n");
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
      textoParaAnalisar = await analisarImagem(base64, message.imageMessage.mimetype || "image/jpeg");
    } else if (message.documentMessage) {
      if (!message.documentMessage.mimetype?.includes("pdf")) {
        await enviarMensagem(remoteJid, "⚠️ Só aceito PDFs!");
        return;
      }
      await enviarMensagem(remoteJid, "📄 Analisando PDF...");
      const base64 = await baixarMidia(data);
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
    const resposta = await processarMensagem(texto, sessionId, "web");

    res.json({ texto: resposta });
  } catch (err) {
    console.error("Erro web chat:", err);
    res.status(500).json({ erro: err.message });
  }
}

async function handleExtratoUpload(req, res) {
  try {
    const { base64, mimetype } = req.body;
    if (!base64 || !mimetype) return res.status(400).json({ erro: "base64 e mimetype obrigatórios" });
    const transacoes = await extrairExtrato(base64, mimetype);
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

module.exports = { handleWebhook, handleWebChat, handleExtratoUpload, handleExtratoConfirmar };
