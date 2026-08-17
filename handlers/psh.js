// ─────────────────────────────────────────────
//  handlers/psh.js — Comandos do negócio Polpa Santa Helena
// ─────────────────────────────────────────────
//
// Cobre pelo chat o que a aba Financeiro cobre pela web: registrar venda,
// lançar despesa operacional, atualizar preço e consultar o resultado.
//
// Segue o padrão do projeto (ver handlers/faculdade.js): gate rápido por
// regex antes de gastar uma chamada de IA, e a IA sempre com uma saída
// formal de "não sei fazer isso" (`nao_suportado`) em vez de forçar a
// interpretação mais próxima do schema.
//
// Venda NÃO grava direto: pede confirmação via pending-states, porque
// mexe em estoque e dinheiro ao mesmo tempo e um erro de interpretação
// sairia caro. Despesa e preço gravam direto (afetam uma linha só e são
// triviais de corrigir).

const { supabase } = require("../services/supabase");
const { extrairComandoPSHIA } = require("../services/openai");
const { salvarEstado } = require("../services/pending-states");

// Gate rápido: só chama a IA se a mensagem tiver cara de negócio. Palavras
// de dinheiro/venda sozinhas não bastam (senão engoliria gasto pessoal),
// por isso o gate exige ou um termo do negócio, ou um verbo de venda.
const TERMOS_NEGOCIO = /\b(polpa|polpas|psh|santa\s*helena|a[çc]a[íi]|freezer|c[âa]mara|revenda|fornecedor)\b/i;
const VERBOS_VENDA = /\b(vendi|vendeu|vendemos|saiu|sa[íi]ram|entreguei)\b/i;
const TERMOS_FINANCEIRO = /\b(lucro|lucrei|lucrou|margem|faturei|faturamento|receita|cmv|custo)\b/i;
const TERMOS_PRECO = /\b(pre[çc]o|custa|custando|kg|subiu|baixou|aumentou)\b/i;

// Sinal antes do "R$" ("-R$ 20,00", não "R$ -20,00") — lucro e caixa
// ficam negativos com frequência e o segundo formato lê mal.
const fmtMoeda = v => {
  const n = Number(v || 0);
  return `${n < 0 ? "-" : ""}R$ ${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
};
const fmtQtd = (v, u) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${u || ""}`.trim();

function normalizar(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function acharProduto(nome, produtos) {
  const n = normalizar(nome);
  return produtos.find(p => normalizar(p.nome) === n)
    || produtos.find(p => normalizar(p.nome).includes(n))
    || produtos.find(p => n.includes(normalizar(p.nome)))
    || null;
}

// ── Detecção ──────────────────────────────────────────────────────
async function detectarComandoPSH(texto) {
  const temNegocio = TERMOS_NEGOCIO.test(texto);
  const temVenda = VERBOS_VENDA.test(texto);
  const temFinanceiro = TERMOS_FINANCEIRO.test(texto);
  const temPreco = TERMOS_PRECO.test(texto);
  if (!temNegocio && !temVenda && !temFinanceiro && !(temPreco && temNegocio)) return null;

  const { data: produtos } = await supabase
    .from("estoque_produtos")
    .select("id, nome, unidade, preco, preco_compra, estoque_atual, estoque_atual_camara")
    .eq("ativo", true);
  if (!produtos || produtos.length === 0) return null;

  const { data: cats } = await supabase
    .from("categorias").select("nome").eq("tipo", "psh_despesa");

  const cmd = await extrairComandoPSHIA(texto, produtos, (cats || []).map(c => c.nome));
  if (!cmd) return null;
  return { cmd, produtos };
}

// ── Despacho ──────────────────────────────────────────────────────
async function processarComandoPSH({ cmd, produtos }, remoteJid, texto) {
  if (cmd.modo === "nao_suportado") {
    await salvarEstado(remoteJid, "esclarecimento", {
      tipoOrigem: "psh", textoOriginal: texto, contextoParcial: null,
    });
    return { texto: `🤔 Entendi que é sobre a Polpa Santa Helena, mas ${cmd.motivo}\n\nPode reformular?` };
  }
  if (cmd.modo === "venda") return prepararVenda(cmd, produtos, remoteJid);
  if (cmd.modo === "despesa") return lancarDespesa(cmd);
  if (cmd.modo === "preco") return atualizarPreco(cmd, produtos);
  if (cmd.modo === "consulta") return responderConsulta(cmd, produtos);
  return null;
}

// ── Venda (pede confirmação) ──────────────────────────────────────
async function prepararVenda(cmd, produtos, remoteJid) {
  const itens = [];
  const naoEncontrados = [];

  for (const item of cmd.itens) {
    const p = acharProduto(item.produto, produtos);
    if (!p) { naoEncontrados.push(item.produto); continue; }
    itens.push({
      produto_id: p.id, nome: p.nome, unidade: p.unidade,
      quantidade: Number(item.quantidade), preco: p.preco,
      estoque_atual: Number(p.estoque_atual),
    });
  }

  if (itens.length === 0) {
    return { texto: `⚠️ Não encontrei no estoque: _${naoEncontrados.join(", ")}_` };
  }

  const total = itens.reduce((s, i) => s + i.quantidade * Number(i.preco || 0), 0);
  const semPreco = itens.filter(i => i.preco == null);
  const semSaldo = itens.filter(i => i.quantidade > i.estoque_atual);

  await salvarEstado(remoteJid, "venda_psh", { itens, cliente: cmd.cliente || null });

  const linhas = ["🧾 *Confirmar venda:*", ""];
  for (const i of itens) {
    linhas.push(`• *${i.nome}* — ${fmtQtd(i.quantidade, i.unidade)}${i.preco != null ? ` = ${fmtMoeda(i.quantidade * i.preco)}` : " _(sem preço de venda)_"}`);
  }
  linhas.push("", `💰 Total: *${fmtMoeda(total)}*`);
  if (cmd.cliente) linhas.push(`👤 Cliente: ${cmd.cliente}`);
  if (semPreco.length > 0) linhas.push(`\n⚠️ ${semPreco.length} produto(s) sem preço de venda cadastrado.`);
  if (semSaldo.length > 0) {
    linhas.push(`\n⚠️ Estoque do freezer insuficiente: ${semSaldo.map(i => `${i.nome} (tem ${fmtQtd(i.estoque_atual, i.unidade)})`).join(", ")}`);
  }
  linhas.push("\nConfirma? (sim/não)");

  return {
    texto: linhas.join("\n"),
    opcoes: { botoes: [{ texto: "✅ Sim", valor: "sim" }, { texto: "❌ Não", valor: "não" }] },
  };
}

// Chamado pelo webhook quando o usuário confirma o estado "venda_psh".
// Grava só a movimentação de estoque — o lançamento financeiro nasce do
// trigger no banco (migrations/010_psh_financeiro.sql), então não há
// insert de receita aqui.
async function confirmarVendaPSH(estado) {
  const { itens, cliente } = estado;
  const agora = new Date().toISOString();

  const { error } = await supabase.from("estoque_movimentacoes").insert(
    itens.map(i => ({
      produto_id: i.produto_id,
      tipo: "venda",
      quantidade: i.quantidade,
      local: "freezer",
      pessoa: cliente || null,
      criado_em: agora,
    }))
  );
  if (error) return `❌ Erro ao registrar a venda: ${error.message}`;

  await Promise.all(itens.map(i =>
    supabase.from("estoque_produtos")
      .update({ estoque_atual: Math.max(0, i.estoque_atual - i.quantidade) })
      .eq("id", i.produto_id)
  ));

  const total = itens.reduce((s, i) => s + i.quantidade * Number(i.preco || 0), 0);
  const linhas = [`✅ *Venda registrada!* ${fmtMoeda(total)}`, ""];
  for (const i of itens) {
    linhas.push(`• ${i.nome}: ${fmtQtd(i.quantidade, i.unidade)} → restam ${fmtQtd(Math.max(0, i.estoque_atual - i.quantidade), i.unidade)}`);
  }
  if (cliente) linhas.push(`\n👤 ${cliente}`);
  return linhas.join("\n");
}

// ── Despesa operacional ───────────────────────────────────────────
async function lancarDespesa(cmd) {
  const { error } = await supabase.from("psh_lancamentos").insert({
    tipo: "despesa",
    valor: Number(cmd.valor),
    descricao: cmd.descricao || cmd.categoria || "Despesa",
    categoria: cmd.categoria || "Outros",
    data: new Date().toLocaleDateString("sv-SE"),
  });
  if (error) return { texto: `❌ Erro ao lançar a despesa: ${error.message}` };

  return { texto: `🧾 *Despesa lançada no PSH*\n\n${cmd.descricao || cmd.categoria}\n💸 ${fmtMoeda(cmd.valor)}${cmd.categoria ? `\n🏷️ ${cmd.categoria}` : ""}` };
}

// ── Preço de compra/venda ─────────────────────────────────────────
async function atualizarPreco(cmd, produtos) {
  const p = acharProduto(cmd.produto, produtos);
  if (!p) return { texto: `⚠️ Não encontrei o produto "${cmd.produto}" no estoque.` };

  const campo = cmd.campo === "compra" ? "preco_compra" : "preco";
  const anterior = p[campo];
  const { error } = await supabase.from("estoque_produtos")
    .update({ [campo]: Number(cmd.valor) }).eq("id", p.id);
  if (error) return { texto: `❌ Erro ao atualizar o preço: ${error.message}` };

  const compra = campo === "preco_compra" ? Number(cmd.valor) : p.preco_compra;
  const venda = campo === "preco" ? Number(cmd.valor) : p.preco;

  const linhas = [
    `💲 *${p.nome}* — preço de ${cmd.campo} atualizado`,
    `${anterior != null ? `${fmtMoeda(anterior)} → ` : ""}*${fmtMoeda(cmd.valor)}* por ${p.unidade}`,
  ];
  if (compra != null && venda != null) {
    const lucro = venda - compra;
    const margem = venda > 0 ? (lucro / venda) * 100 : 0;
    linhas.push(`\n📈 Lucro: *${fmtMoeda(lucro)}*/${p.unidade} · margem ${margem.toFixed(1)}%`);
  } else {
    linhas.push(`\n_Falta cadastrar o preço de ${compra == null ? "compra" : "venda"} pra calcular a margem._`);
  }
  return { texto: linhas.join("\n") };
}

// ── Consulta de resultado ─────────────────────────────────────────
async function responderConsulta(cmd, produtos) {
  // Margem de um produto é cadastro puro, não depende de lançamento.
  if (cmd.escopo === "produto" && cmd.produto) {
    const p = acharProduto(cmd.produto, produtos);
    if (!p) return { texto: `⚠️ Não encontrei o produto "${cmd.produto}".` };

    const linhas = [`📊 *${p.nome}*`, ""];
    linhas.push(`Compra: ${p.preco_compra != null ? fmtMoeda(p.preco_compra) : "não cadastrado"}/${p.unidade}`);
    linhas.push(`Venda: ${p.preco != null ? fmtMoeda(p.preco) : "não cadastrado"}/${p.unidade}`);
    if (p.preco != null && p.preco_compra != null) {
      const lucro = Number(p.preco) - Number(p.preco_compra);
      const margem = p.preco > 0 ? (lucro / p.preco) * 100 : 0;
      linhas.push(`\n📈 Lucro: *${fmtMoeda(lucro)}*/${p.unidade} · margem *${margem.toFixed(1)}%*`);
    }
    const geral = Number(p.estoque_atual || 0) + Number(p.estoque_atual_camara || 0);
    linhas.push(`\n📦 Estoque: ${fmtQtd(geral, p.unidade)} (${p.estoque_atual}🧊 · ${p.estoque_atual_camara}❄️)`);

    const { data: vendas } = await supabase
      .from("psh_lancamentos").select("valor, quantidade")
      .eq("tipo", "venda").eq("produto_id", p.id);
    if (vendas && vendas.length > 0) {
      const qtd = vendas.reduce((s, v) => s + Number(v.quantidade || 0), 0);
      const receita = vendas.reduce((s, v) => s + Number(v.valor || 0), 0);
      linhas.push(`\n💚 Já vendido: ${fmtQtd(qtd, p.unidade)} · ${fmtMoeda(receita)}`);
    }
    return { texto: linhas.join("\n") };
  }

  // Resultado do período. Mesma apuração da aba Financeiro: o custo que
  // entra no lucro é o do que foi VENDIDO (CMV), não o das compras do mês
  // — senão um mês de pedido grande apareceria como prejuízo.
  const inicioMes = new Date().toLocaleDateString("sv-SE").slice(0, 8) + "01";
  let query = supabase.from("psh_lancamentos").select("*");
  if (cmd.periodo !== "tudo") query = query.gte("data", inicioMes);
  const { data: lancs } = await query;

  if (!lancs || lancs.length === 0) {
    return { texto: "📊 Nenhum lançamento no período ainda." };
  }

  const porId = Object.fromEntries(produtos.map(p => [p.id, p]));
  const vendas = lancs.filter(l => l.tipo === "venda");
  const receita = vendas.reduce((s, l) => s + Number(l.valor || 0), 0);
  const totalCompras = lancs.filter(l => l.tipo === "compra").reduce((s, l) => s + Number(l.valor || 0), 0);
  const despesas = lancs.filter(l => l.tipo === "despesa").reduce((s, l) => s + Number(l.valor || 0), 0);

  let cmv = 0;
  let semCusto = 0;
  for (const l of vendas) {
    const p = porId[l.produto_id];
    if (!p || p.preco_compra == null) { semCusto++; continue; }
    cmv += Number(l.quantidade || 0) * Number(p.preco_compra);
  }

  const lucro = receita - cmv - despesas;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;
  const periodo = cmd.periodo === "tudo" ? "Desde o início" : "Este mês";

  const linhas = [
    `📊 *Polpa Santa Helena — ${periodo}*`, "",
    `💚 Receita: *${fmtMoeda(receita)}* _(${vendas.length} venda(s))_`,
    `📦 Custo do vendido: ${fmtMoeda(cmv)}`,
    `🧾 Despesas: ${fmtMoeda(despesas)}`,
    "",
    `📈 Lucro: *${fmtMoeda(lucro)}* · margem *${margem.toFixed(1)}%*`,
    `💵 Caixa: ${fmtMoeda(receita - totalCompras - despesas)} _(compras do período: ${fmtMoeda(totalCompras)})_`,
  ];
  if (semCusto > 0) linhas.push(`\n⚠️ ${semCusto} venda(s) de produto sem preço de compra — o lucro está superestimado.`);

  return { texto: linhas.join("\n") };
}

module.exports = { detectarComandoPSH, processarComandoPSH, confirmarVendaPSH };
