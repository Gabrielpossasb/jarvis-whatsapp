import { useState, useMemo } from "react";
import IconeProduto from "./IconeProduto";
import {
  fmtMoeda, fmtPct, fmtDataCurta, mesDeData,
  TIPO_LANC_LABEL, TIPO_LANC_BADGE,
} from "./format";

const TIPOS = ["venda", "compra", "despesa"];

/**
 * Apura o mês. A distinção que importa: comprar 200kg de polpa não é
 * prejuízo, é estoque — então o LUCRO usa o custo só do que foi vendido
 * (CMV = quantidade vendida × preço de compra do produto), enquanto o
 * CAIXA mostra o que de fato entrou e saiu da conta no período. Um mês de
 * pedido grande costuma ter lucro positivo e caixa negativo; os dois
 * números juntos contam a história certa.
 */
function apurar(lancamentos, produtosPorId) {
  const vendas = lancamentos.filter(l => l.tipo === "venda");
  const compras = lancamentos.filter(l => l.tipo === "compra");
  const despesas = lancamentos.filter(l => l.tipo === "despesa");

  const receita = vendas.reduce((s, l) => s + Number(l.valor || 0), 0);
  const totalCompras = compras.reduce((s, l) => s + Number(l.valor || 0), 0);
  const totalDespesas = despesas.reduce((s, l) => s + Number(l.valor || 0), 0);

  // Custo da mercadoria vendida: preço de compra vigente do produto. Se o
  // produto ainda não tem preço de compra cadastrado, entra como 0 e o
  // contador `vendasSemCusto` avisa que o lucro está superestimado.
  let cmv = 0;
  let vendasSemCusto = 0;
  for (const l of vendas) {
    const p = produtosPorId[l.produto_id];
    if (!p || p.preco_compra == null) { vendasSemCusto++; continue; }
    cmv += Number(l.quantidade || 0) * Number(p.preco_compra);
  }

  const lucro = receita - cmv - totalDespesas;
  return {
    receita, cmv, totalCompras, totalDespesas, lucro, vendasSemCusto,
    margem: receita > 0 ? (lucro / receita) * 100 : null,
    caixa: receita - totalCompras - totalDespesas,
    qtdVendas: vendas.length,
  };
}

function Card({ label, valor, cor, sub }) {
  return (
    <div className="bg-cinza-900 border border-cinza-800 rounded-xl px-2.5 sm:px-3 py-2 sm:py-2.5 min-w-0">
      <div className="text-[9px] text-cinza-350 mb-1 leading-tight">{label}</div>
      <div className={`font-mono tabular-nums text-xs md:text-sm font-medium truncate ${cor}`}>{valor}</div>
      {sub && <div className="text-[9px] text-cinza-350 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/**
 * Aba "💰 Financeiro": apuração do PSH por mês. Vendas e compras não são
 * digitadas aqui — elas chegam sozinhas das movimentações de estoque (um
 * trigger no banco cria o lançamento a cada venda/entrada, ver
 * migrations/010_psh_financeiro.sql); esta tela lança as despesas
 * operacionais e permite corrigir o valor de qualquer lançamento quando o
 * preço do dia diferiu do cadastrado.
 *
 * @param {object[]} lancamentos
 * @param {object[]} produtos
 * @param {() => void} onNovaDespesa
 * @param {(lancamento: object) => void} onEditar
 */
export default function AbaFinanceiro({ lancamentos, produtos, onNovaDespesa, onEditar }) {
  const [mesSel, setMesSel] = useState(null); // null = mês mais recente
  const [tiposAtivos, setTiposAtivos] = useState(new Set());

  const produtosPorId = useMemo(
    () => Object.fromEntries(produtos.map(p => [p.id, p])), [produtos]);

  // Meses do mais recente pro mais antigo. As datas vêm como DATE do
  // Postgres ("2026-08-17"), então ordenar as chaves ISO já ordena o tempo.
  const meses = useMemo(() => {
    const chaves = [...new Set(lancamentos.map(l => String(l.data).slice(0, 7)))];
    return chaves.sort().reverse();
  }, [lancamentos]);

  const mesAtivo = mesSel && meses.includes(mesSel) ? mesSel : meses[0];
  const doMes = useMemo(
    () => lancamentos.filter(l => String(l.data).slice(0, 7) === mesAtivo),
    [lancamentos, mesAtivo]);

  const a = apurar(doMes, produtosPorId);

  const visiveis = doMes
    .filter(l => tiposAtivos.size === 0 || tiposAtivos.has(l.tipo))
    .sort((x, y) => String(y.data).localeCompare(String(x.data))
      || String(y.criado_em).localeCompare(String(x.criado_em)));

  function toggleTipo(t) {
    setTiposAtivos(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  if (lancamentos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
        <div className="text-cinza-350 text-sm text-center">
          Nenhum lançamento ainda.<br />
          <span className="text-[11px]">Vendas e compras aparecem aqui sozinhas quando você registra no estoque.</span>
        </div>
        <button onClick={onNovaDespesa}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-roxo-700 hover:bg-roxo-600 text-white transition-colors">
          + Lançar despesa
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filtro de mês */}
      <div className="px-4 md:px-6 pt-3 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {meses.map(m => (
          <button key={m} onClick={() => setMesSel(m)}
            className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
              ${mesAtivo === m
                ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
            {mesDeData(`${m}-01`)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3">
        {/* Apuração */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <Card label="💚 Receita" valor={fmtMoeda(a.receita)} cor="text-emerald-400"
            sub={`${a.qtdVendas} venda(s)`} />
          <Card label="📦 Custo do vendido" valor={fmtMoeda(a.cmv)} cor="text-amber-400" sub="CMV" />
          <Card label="🧾 Despesas" valor={fmtMoeda(a.totalDespesas)} cor="text-red-400" />
          <Card label="📈 Lucro" valor={fmtMoeda(a.lucro)}
            cor={a.lucro >= 0 ? "text-emerald-400" : "text-red-400"}
            sub={a.margem != null ? `margem ${fmtPct(a.margem)}` : null} />
        </div>

        {/* Caixa — leitura separada do lucro (ver comentário em apurar) */}
        <div className="flex items-center justify-between bg-cinza-900 border border-cinza-800 rounded-xl px-3 py-2 mb-3">
          <span className="text-[10px] text-cinza-350">
            💵 Caixa do mês
            <span className="hidden sm:inline"> — entrou {fmtMoeda(a.receita)}, saiu {fmtMoeda(a.totalCompras + a.totalDespesas)} (compras + despesas)</span>
          </span>
          <span className={`font-mono text-xs font-semibold ${a.caixa >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmtMoeda(a.caixa)}
          </span>
        </div>

        {a.vendasSemCusto > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] text-amber-400">
              ⚠️ {a.vendasSemCusto} venda(s) de produto sem preço de compra — o lucro está superestimado.
            </span>
          </div>
        )}

        {/* Filtro de tipo + nova despesa. O botão fica FORA do container
            que rola: com `ml-auto` dentro dele, no celular ele saía da
            área visível e só aparecia arrastando pro lado — invisível pra
            quem não soubesse que estava lá. */}
        <div className="flex gap-2 items-center mb-2">
          <div className="flex gap-2 items-center overflow-x-auto no-scrollbar flex-1 min-w-0">
            <button onClick={() => setTiposAtivos(new Set())}
              className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
                ${tiposAtivos.size === 0
                  ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                  : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
              Todos
            </button>
            {TIPOS.map(t => (
              <button key={t} onClick={() => toggleTipo(t)}
                className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
                  ${tiposAtivos.has(t)
                    ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                    : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                {TIPO_LANC_LABEL[t]}
              </button>
            ))}
          </div>
          <button onClick={onNovaDespesa}
            className="px-3 py-1.5 sm:py-1 rounded-full text-xs font-semibold bg-roxo-700/10 border border-roxo-700/30 text-roxo-400 hover:bg-roxo-700/20 transition-colors whitespace-nowrap shrink-0">
            + Despesa
          </button>
        </div>

        {/* Lançamentos */}
        {visiveis.length === 0 ? (
          <div className="text-center text-cinza-350 text-sm py-10">Nenhum lançamento com esse filtro</div>
        ) : (
          <div className="bg-cinza-900 border border-cinza-800 rounded-xl overflow-hidden">
            {visiveis.map((l, i) => (
              <button key={l.id} onClick={() => onEditar(l)}
                className={`w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 text-left hover:bg-cinza-850 transition-colors
                  ${i < visiveis.length - 1 ? "border-b border-cinza-850" : ""}`}>
                <span className={`text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-medium shrink-0 ${TIPO_LANC_BADGE[l.tipo]}`}>
                  {TIPO_LANC_LABEL[l.tipo]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-cinza-50 min-w-0">
                    {l.produto_id && produtosPorId[l.produto_id] && (
                      <IconeProduto p={produtosPorId[l.produto_id]} size={20} />
                    )}
                    <span className="truncate">{l.descricao || l.categoria || "—"}</span>
                    {/* sem shrink-0: um nome de cliente longo empurrava o
                        valor pra fora da linha no celular */}
                    {l.pessoa && <span className="text-cinza-200 truncate">· {l.pessoa}</span>}
                  </div>
                  <div className="text-[10px] text-cinza-350 mt-0.5 truncate">
                    {fmtDataCurta(l.data)}
                    {l.quantidade != null && (
                      <span> · {Number(l.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {produtosPorId[l.produto_id]?.unidade || ""}</span>
                    )}
                    {l.categoria && l.tipo === "despesa" && <span> · {l.categoria}</span>}
                    {l.editado && <span className="text-roxo-400"> · editado</span>}
                  </div>
                </div>
                <span className={`font-mono tabular-nums text-xs font-semibold shrink-0
                  ${l.tipo === "venda" ? "text-emerald-400" : "text-red-400"}`}>
                  {l.tipo === "venda" ? "+" : "−"}{fmtMoeda(l.valor)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
