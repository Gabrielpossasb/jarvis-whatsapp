// ─────────────────────────────────────────────
//  handlers/estoque.js — Contagem e atualização de estoque
// ─────────────────────────────────────────────

const { supabase } = require("../services/supabase");

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

module.exports = { parsearContagemEstoque, normalizarNome, processarContagemEstoque };
