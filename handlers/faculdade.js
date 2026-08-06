// ─────────────────────────────────────────────
//  handlers/faculdade.js — Eventos e grade de faculdade
// ─────────────────────────────────────────────

const { supabase } = require("../services/supabase");
const { salvarEstado } = require("../services/pending-states");
const { encontrarSimilar } = require("../utils/similarity");
const { corParaDisciplina } = require("../utils/coresFaculdade");
const { extrairEventoFaculdadeIA, extrairPlanoFaculdadeIA } = require("../services/openai");

const DIAS_SEMANA_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Gate rápido: só chama a IA se houver palavras-chave acadêmicas
function podeSerEventoFaculdade(texto) {
  const norm = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /\b(prova|atividade|trabalho|ead|aula online|aviso de faculdade|facul|nota|media|tirei|passar|resumo da materia|lista de exerc|materia|disciplina|horario|grade)\b/.test(norm);
}

async function buscarDisciplinas() {
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
  const { error } = await supabase
    .from("faculdade_disciplinas")
    .upsert({ nome: evento.disciplina, formula_media: evento.formula_media }, { onConflict: "nome" });
  if (error) throw error;
  return { texto: `✅ *Fórmula de média salva!*\n\n📚 ${evento.disciplina}\n_${evento.formula_media}_` };
}

// Cadastra uma matéria nova na grade fixa (1 linha por dia da semana informado) — sempre pede
// confirmação antes de gravar, porque é uma mudança estrutural na grade do semestre inteiro
async function processarEventoFaculdadeAula(evento, remoteJid) {
  const cor = corParaDisciplina(evento.disciplina);
  const aulas = evento.dias.map(dia => ({
    disciplina: evento.disciplina,
    professor: evento.professor || null,
    turma: evento.turma || null,
    dia,
    inicio: evento.inicio,
    fim: evento.fim,
    local: evento.local || null,
    cor,
    ativo: true,
  }));

  await salvarEstado(remoteJid, "aula_faculdade", { aulas });

  const linhas = [
    `📚 Vou cadastrar *${evento.disciplina}*:`, ``,
    ...aulas.map(a => `- ${DIAS_SEMANA_NOME[a.dia]}, ${a.inicio}–${a.fim}${a.local ? ` — ${a.local}` : ""}`),
    ``, `✅ _"sim"_ para confirmar`, `❌ _"não"_ para cancelar`,
  ];
  return { texto: linhas.join("\n"), opcoes: { botoes: ["✅ Sim", "❌ Não"] } };
}

// Despacha o resultado de extrairEventoFaculdadeIA pelos 6 modos — usado tanto no fluxo normal quanto no reprocessamento após esclarecimento
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
  } else if (eventoFac.modo === "aula") {
    return processarEventoFaculdadeAula(eventoFac, remoteJid);
  }
  return processarEventoFaculdadeUnico(eventoFac);
}

// Explode o plano extraído de uma foto/PDF (vários eventos + fórmula opcional) e pede confirmação antes de gravar
async function processarPlanoFaculdade(plano, remoteJid) {
  const eventos = (plano.eventos || []).map(e => ({
    tipo: e.tipo, disciplina: e.disciplina || null, titulo: e.titulo, data: e.data, hora: e.hora || null, concluido: false,
  }));
  const aulas = (plano.aulas || []).map(a => ({
    disciplina: a.disciplina, professor: a.professor || null, turma: a.turma || null,
    dia: a.dia, inicio: a.inicio, fim: a.fim, local: a.local || null,
    cor: corParaDisciplina(a.disciplina), ativo: true,
  }));

  if (eventos.length === 0 && !plano.formula && aulas.length === 0) {
    return null;
  }

  await salvarEstado(remoteJid, "plano_faculdade", { eventos, formula: plano.formula || null, aulas });

  const TIPOS_EMOJI = { prova: "📝", atividade: "📋", ead: "💻", aviso: "📢" };
  const linhas = [`📄 *Encontrei isso no documento:*`, ``];
  for (const a of aulas) {
    linhas.push(`📚 ${a.disciplina} — ${DIAS_SEMANA_NOME[a.dia]}, ${a.inicio}–${a.fim}${a.local ? ` — ${a.local}` : ""}`);
  }
  for (const e of eventos) {
    linhas.push(`${TIPOS_EMOJI[e.tipo] || "📅"} ${e.titulo}${e.disciplina ? ` — ${e.disciplina}` : ""} (${ddmm(e.data)})`);
  }
  if (plano.formula) {
    linhas.push(``, `📐 Fórmula de ${plano.formula.disciplina}: _${plano.formula.formula_media}_`);
  }
  linhas.push(``, `✅ _"sim"_ para confirmar e salvar tudo`, `❌ _"não"_ para cancelar`);

  return { texto: linhas.join("\n"), opcoes: { botoes: ["✅ Sim", "❌ Não"] } };
}

// Tenta extrair um plano de faculdade (provas/atividades/fórmula) de uma foto ou PDF antes do fluxo genérico de gasto/tarefa
async function detectarPlanoFaculdadeDeArquivo(base64, mimetype, remoteJid) {
  const disciplinas = await buscarDisciplinas();
  const plano = await extrairPlanoFaculdadeIA(base64, mimetype, disciplinas);
  return processarPlanoFaculdade(plano, remoteJid);
}

module.exports = {
  podeSerEventoFaculdade, buscarDisciplinas, detectarEventoFaculdade,
  ddmm, datasNoIntervalo,
  processarEventoFaculdadeUnico, processarEventoFaculdadeIntervalo,
  processarEventoFaculdadeNota, processarEventoFaculdadeFormula,
  processarEventoFaculdadeAula, despacharEventoFaculdade,
  processarPlanoFaculdade, detectarPlanoFaculdadeDeArquivo,
};
