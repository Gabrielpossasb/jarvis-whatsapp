// Constantes e formatadores compartilhados por toda a página de Estoque
// (card de produto, histórico, os modais de movimentação/contagem/gerenciar
// e a exportação de lista de faltantes). Nada aqui depende de estado do
// componente — só formata valores ou nomeia categorias/tipos.

export const CATEGORIAS = ["Polpas", "Frutas", "Outros", "Açaí em pote"];

export const EMOJI_PADRAO = "🍹";

// Bucket do Supabase Storage onde ficam as imagens de produto enviadas
// pelos modais de edição/criação (ver ModalEditarProduto e ModalNovoProduto).
export const BUCKET_ICONES = "estoque-icones";

export const fmtQtd = (v, u) =>
  `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${u}`;

// Sinal antes do "R$" ("-R$ 20,00", não "R$ -20,00") — lucro e caixa ficam
// negativos com frequência e o segundo formato lê mal.
export const fmtMoeda = v => {
  if (v == null) return null;
  const n = Number(v);
  return `${n < 0 ? "-" : ""}R$ ${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
};

export const fmtPct = v =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : null;

// Margem sobre o preço de VENDA (lucro ÷ venda), não markup sobre o custo —
// é como se lê "quanto de cada real que entra é lucro", que é a leitura útil
// pra decidir preço. Retorna null quando falta preço de compra ou de venda,
// pra UI poder mostrar "faltando" em vez de fingir 100% de margem.
export function calcLucro(produto) {
  const venda = produto.preco == null ? null : Number(produto.preco);
  const compra = produto.preco_compra == null ? null : Number(produto.preco_compra);
  if (venda == null || compra == null) return { lucro: null, margem: null, venda, compra };
  const lucro = venda - compra;
  return { lucro, margem: venda > 0 ? (lucro / venda) * 100 : null, venda, compra };
}

// Estoque somado dos dois locais — a aba Tabela mostra a posição geral do
// produto, não a de um local (a separação freezer/câmara é operacional, o
// capital parado é o total).
export const estoqueGeral = p =>
  Number(p.estoque_atual || 0) + Number(p.estoque_atual_camara || 0);

export const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// "2026-08-17" → "Agosto/2026". Trabalha em cima da string ISO em vez de
// new Date(): `data` é um DATE do Postgres (sem hora), e o construtor Date
// interpretaria como UTC, jogando o dia 1 pro mês anterior no fuso -04.
export function mesDeData(dataIso) {
  const [ano, mes] = String(dataIso).split("-");
  return `${MESES_PT[Number(mes) - 1]}/${ano}`;
}

export const fmtDataCurta = dataIso => {
  const [, mes, dia] = String(dataIso).split("-");
  return `${dia}/${mes}`;
};

export const TIPO_LANC_LABEL = { venda: "Venda", compra: "Compra", despesa: "Despesa" };
export const TIPO_LANC_BADGE = {
  venda: "bg-emerald-500/15 text-emerald-400",
  compra: "bg-amber-500/15 text-amber-400",
  despesa: "bg-red-500/15 text-red-400",
};

export const fmtData = s =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Quantidade que falta pra bater o mínimo (ModalFaltantes) — sem casas
// decimais quando o valor é inteiro, já que os estoques hoje são contados
// sempre de 1 em 1.
export const fmtFalta = v =>
  Number(v).toLocaleString("pt-BR", { minimumFractionDigits: v % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 });

// Monta o texto "o que falta pra bater o mínimo", pronto pra colar no
// WhatsApp (pedido pra quem vai trazer da câmara fria) — agrupado por
// categoria, com *negrito* (sintaxe do WhatsApp) no título de cada grupo.
// Sem emoji: pedido explícito do Gabriel. Usado por ModalFaltantes.
export function gerarTextoFaltantes(produtos) {
  const faltantes = produtos
    .filter(p => Number(p.estoque_atual) < Number(p.estoque_minimo))
    .map(p => ({ ...p, falta: Number(p.estoque_minimo) - Number(p.estoque_atual) }));

  if (faltantes.length === 0) return "Nada abaixo do mínimo agora 🎉";

  const grupos = CATEGORIAS.map(cat => ({
    cat,
    itens: faltantes.filter(p => p.categoria === cat),
  })).filter(g => g.itens.length > 0);

  const linhas = [`Pedido — ${new Date().toLocaleDateString("pt-BR")}`, ""];
  for (const { cat, itens } of grupos) {
    linhas.push(`*${cat}*`);
    for (const p of itens) {
      linhas.push(`${p.nome} — ${fmtFalta(p.falta)} ${p.unidade}`);
    }
    linhas.push("");
  }
  return linhas.join("\n").trim();
}

// Remapeia estoque_atual/estoque_minimo pro par "_camara" quando o local é a
// câmara fria — freezer usa os campos originais (ver
// 009_estoque_camara_fria.sql). Compartilhado entre a página (produtosView)
// e ModalContagem, que precisa alternar o local por dentro do próprio modal.
export function produtosParaLocal(produtos, local) {
  return local === "freezer"
    ? produtos
    : produtos.map(p => ({ ...p, estoque_atual: p.estoque_atual_camara, estoque_minimo: p.estoque_minimo_camara }));
}

export const TIPO_LABEL = { entrada: "Entrada", venda: "Venda", consumo: "Consumo", transferencia: "Transferência", contagem: "Contagem" };
export const TIPO_SINAL = { entrada: "+", venda: "−", consumo: "−", transferencia: "+", contagem: "=" };
export const TIPO_BADGE = {
  entrada: "bg-emerald-500/15 text-emerald-400",
  venda: "bg-red-500/15 text-red-400",
  consumo: "bg-amber-500/15 text-amber-400",
  transferencia: "bg-roxo-700/15 text-roxo-400",
  contagem: "bg-sky-500/15 text-sky-400",
};
