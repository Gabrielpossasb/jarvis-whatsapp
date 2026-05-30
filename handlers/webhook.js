// ─────────────────────────────────────────────
//  handlers/webhook.js — Lógica principal
// ─────────────────────────────────────────────

const { CONFIG } = require("../config");
const { pendingReviews } = require("../state");
const { enviarMensagem, baixarMidia } = require("../services/evolution");
const { extrairDados, revisarCategorias, transcreverAudio, analisarImagem, analisarPDF } = require("../services/openai");
const { getCategorias, getListaCategorias, adicionarCategoria, getEmoji } = require("../services/categorias");
const {
  adicionarGasto, adicionarTarefa,
  buscarTarefasPorPeriodo, buscarTodasTarefas,
  concluirTarefa, excluirTarefa,
  alterarCategoriaTarefa, alterarTarefa,
} = require("../services/sheets");
const { formatarData, formatarHora, agora, amanha } = require("../utils/date");

// ── Busca tarefa por nome ─────────────────────────────────────────
async function encontrarTarefa(descBusca) {
  const todas = await buscarTodasTarefas();
  const busca = descBusca.toLowerCase();
  return todas.find(t => t.status !== "Concluída" && t.descricao.toLowerCase().includes(busca));
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
    isBacklog ? `📂 Backlog (sem data)` : `📅 Data: ${dataRegistro}`,
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

  const filtroLabel = categoria !== "todas" ? ` (${categoria})` : "";
  let titulo;
  if (periodo === "hoje") titulo = `📋 *Tarefas de hoje (${formatarData()})${filtroLabel}:*`;
  else if (periodo === "amanhã" || periodo === "amanha") titulo = `📋 *Tarefas de amanhã (${amanha()})${filtroLabel}:*`;
  else if (periodo === "backlog") titulo = `📋 *Backlog${filtroLabel}:*`;
  else titulo = `📋 *Tarefas de ${periodo}${filtroLabel}:*`;

  if (tarefas.length === 0) return `${titulo}\n\nNenhuma tarefa encontrada! ✨`;

  // Agrupa por categoria se não filtrou por uma
  if (categoria === "todas") {
    const porCategoria = {};
    for (const t of tarefas) {
      const cat = t.categoria || "Outros";
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(t);
    }
    let msg = `${titulo}\n`;
    for (const [cat, itens] of Object.entries(porCategoria)) {
      const e = await getEmoji(cat);
      msg += `\n${e} *${cat}*\n`;
      const semH = itens.filter(t => !t.hora);
      const comH = itens.filter(t => t.hora).sort((a,b) => a.hora.localeCompare(b.hora));
      for (const t of semH) msg += `📌 ${t.descricao}\n`;
      for (const t of comH) msg += `⏰ ${t.hora} — ${t.descricao}\n`;
    }
    return msg;
  }

  let msg = `${titulo}\n\n`;
  const semH = tarefas.filter(t => !t.hora);
  const comH = tarefas.filter(t => t.hora).sort((a,b) => a.hora.localeCompare(b.hora));
  for (const t of semH) msg += `📌 ${t.descricao}\n`;
  for (const t of comH) msg += `⏰ ${t.hora} — ${t.descricao}\n`;
  return msg;
}

// ── Handler principal ─────────────────────────────────────────────
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

    const dados = await extrairDados(textoParaAnalisar);
    const dataRegistro = dados.data || formatarData();

    // ── GASTO ──────────────────────────────────────────────────────
    if (dados.classificacao === "gasto") {
      await adicionarGasto(dataRegistro, dados.descricao, dados.valor, dados.meio_pagamento, dados.categoria, dados.tipo_despesa);
      await enviarMensagem(remoteJid, respostaGasto(dados, dataRegistro));

    // ── TAREFA ─────────────────────────────────────────────────────
    } else if (dados.classificacao === "tarefa") {
      await adicionarTarefa(dados.descricao, dataRegistro, dados.hora || "", dados.recorrente || "Não", dados.categoria || "Outros", dados.dias_lembrete || "", dados.hora_lembrete || "");
      await enviarMensagem(remoteJid, await respostaTarefa(dados, dataRegistro));

    // ── CONSULTA ───────────────────────────────────────────────────
    } else if (dados.classificacao === "consulta") {
      await enviarMensagem(remoteJid, await respostaConsulta(dados));

    // ── CONCLUIR ───────────────────────────────────────────────────
    } else if (dados.classificacao === "concluir") {
      const t = await encontrarTarefa(dados.descricao);
      if (t) {
        await concluirTarefa(t.linha);
        const e = await getEmoji(t.categoria);
        await enviarMensagem(remoteJid, `✅ *Concluída!*\n\n${e} ~~${t.descricao}~~\n\n💪 _Boa, Gabriel!_`);
      } else {
        await enviarMensagem(remoteJid, `⚠️ Não encontrei _"${dados.descricao}"_ em aberto.`);
      }

    // ── EXCLUIR ────────────────────────────────────────────────────
    } else if (dados.classificacao === "excluir") {
      const t = await encontrarTarefa(dados.descricao);
      if (t) {
        await excluirTarefa(t.linha);
        await enviarMensagem(remoteJid, `🗑️ *${t.descricao}* excluída!`);
      } else {
        await enviarMensagem(remoteJid, `⚠️ Não encontrei _"${dados.descricao}"_.`);
      }

    // ── MUDAR CATEGORIA ────────────────────────────────────────────
    } else if (dados.classificacao === "mudar_categoria") {
      const t = await encontrarTarefa(dados.descricao);
      if (t) {
        const anterior = t.categoria;
        await alterarCategoriaTarefa(t.linha, dados.nova_categoria);
        const eNovo = await getEmoji(dados.nova_categoria);
        await enviarMensagem(remoteJid, `✅ *Categoria alterada!*\n\n📋 *${t.descricao}*\n🔄 ${anterior} → ${eNovo} ${dados.nova_categoria}`);
      } else {
        await enviarMensagem(remoteJid, `⚠️ Não encontrei _"${dados.descricao}"_.`);
      }

    // ── ADICIONAR CATEGORIA ────────────────────────────────────────
    } else if (dados.classificacao === "adicionar_categoria") {
      const nome = dados.nova_categoria_nome;
      const emoji = dados.nova_categoria_emoji || "📌";
      const adicionou = await adicionarCategoria(nome, emoji);
      if (adicionou) {
        await enviarMensagem(remoteJid, `✅ *Categoria criada!*\n\n${emoji} *${nome}*\n\nJá pode usá-la nas suas tarefas!`);
      } else {
        await enviarMensagem(remoteJid, `⚠️ A categoria *${nome}* já existe!`);
      }

    // ── REVISAR CATEGORIAS ─────────────────────────────────────────
    } else if (dados.classificacao === "revisar_categorias") {
      await enviarMensagem(remoteJid, "🔍 Analisando categorias das suas tarefas...");
      const tarefas = await buscarTodasTarefas();
      const pendentes = tarefas.filter(t => t.status !== "Concluída");

      if (pendentes.length === 0) {
        await enviarMensagem(remoteJid, "Nenhuma tarefa pendente para revisar! ✨");
        return;
      }

      const listaCats = await getListaCategorias();
      const sugestoes = await revisarCategorias(pendentes, listaCats);

      if (sugestoes.length === 0) {
        await enviarMensagem(remoteJid, "✅ Todas as categorias estão corretas! Nenhuma sugestão.");
        return;
      }

      // Mapeia sugestões usando índice real da tarefa
      const sugestoesComLinha = sugestoes.map(s => {
        const tarefa = pendentes[s.numero - 1];
        return { ...s, linha: tarefa?.linha };
      });

      // Salva no estado para aprovação posterior
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
      await enviarMensagem(remoteJid, msg);

    // ── APROVAR REVISÃO ────────────────────────────────────────────
    } else if (dados.classificacao === "aprovar_revisao") {
      const sugestoes = pendingReviews.get(remoteJid);
      if (!sugestoes || sugestoes.length === 0) {
        await enviarMensagem(remoteJid, "⚠️ Nenhuma revisão pendente. Peça _\"revisa as categorias\"_ primeiro!");
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
        pendingReviews.delete(remoteJid);
        await enviarMensagem(remoteJid, "❌ Revisão cancelada. Nenhuma alteração feita.");
        return;
      }

      for (const s of paraAplicar) {
        if (s.linha) await alterarCategoriaTarefa(s.linha, s.categoriaSugerida);
      }

      pendingReviews.delete(remoteJid);
      const emoji = await getEmoji(paraAplicar[0]?.categoriaSugerida);
      await enviarMensagem(remoteJid, `✅ *${paraAplicar.length} categoria(s) atualizada(s)!*\n\n${paraAplicar.map(s => `📋 ${s.descricao} → ${s.categoriaSugerida}`).join("\n")}`);

    // ── ALTERAR TAREFA ─────────────────────────────────────────────
    } else if (dados.classificacao === "alterar_tarefa") {
      const t = await encontrarTarefa(dados.descricao);
      if (!t) {
        await enviarMensagem(remoteJid, `⚠️ Não encontrei _"${dados.descricao}"_.`);
        return;
      }

      const alteracoes = dados.alteracoes || {};
      if (Object.keys(alteracoes).length === 0) {
        await enviarMensagem(remoteJid, `⚠️ Não entendi o que alterar. Tente: _"muda a data de X para Y"_`);
        return;
      }

      await alterarTarefa(t.linha, alteracoes);

      const e = await getEmoji(t.categoria);
      const mudancas = [];
      if (alteracoes.data) mudancas.push(`📅 Data: ${alteracoes.data}`);
      if (alteracoes.hora) mudancas.push(`⏰ Hora: ${alteracoes.hora}`);
      if (alteracoes.dias_lembrete) mudancas.push(`📆 Dias lembrete: ${alteracoes.dias_lembrete}`);
      if (alteracoes.hora_lembrete) mudancas.push(`🔔 Hora lembrete: ${alteracoes.hora_lembrete}`);

      await enviarMensagem(remoteJid, [
        `✅ *Tarefa atualizada!*`, ``,
        `${e} *${t.descricao}*`,
        ...mudancas,
        ``, `🤖 _${dados.entendimento}_`,
      ].join("\n"));

    } else {
      await enviarMensagem(remoteJid, `🤖 *JARVIS:* ${dados.entendimento}`);
    }

  } catch (err) {
    console.error("Erro webhook:", err);
    try {
      const remoteJid = req.body?.data?.key?.remoteJid;
      if (remoteJid) await enviarMensagem(remoteJid, `❌ Erro: ${err.message}`);
    } catch (_) {}
  }
}

module.exports = { handleWebhook };
