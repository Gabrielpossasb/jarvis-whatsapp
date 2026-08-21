import { useState } from "react";
import IconeProduto from "./IconeProduto";
import { CATEGORIAS, fmtMoeda, fmtPct, calcLucro, estoqueGeral } from "./format";

const COLUNAS = "minmax(150px,1.6fr) 92px 92px 100px 96px 76px";

const corMargem = m =>
  m == null ? "text-cinza-300" : m >= 30 ? "text-emerald-400" : m >= 15 ? "text-amber-400" : "text-red-400";

/**
 * Versão da linha para telas estreitas. A tabela de 6 colunas precisa de
 * 620px e no celular virava scroll horizontal permanente — aqui os mesmos
 * dados viram um card: nome e margem em cima (o par que se lê primeiro) e
 * compra/venda/estoque numa grade de três embaixo.
 */
function CardProduto({ p, onEditar }) {
  const { lucro, margem, venda, compra } = calcLucro(p);
  const un = p.unidade;

  return (
    <button onClick={() => onEditar(p)}
      className="w-full text-left bg-cinza-900 border border-cinza-800 rounded-xl px-3 py-2.5 hover:bg-cinza-850 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <IconeProduto p={p} size={26} />
        <span className="text-xs text-cinza-50 flex-1 min-w-0 break-words leading-tight">{p.nome}</span>
        <span className={`font-mono text-sm font-semibold shrink-0 ${corMargem(margem)}`}>
          {margem == null ? "—" : fmtPct(margem)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-[9px] text-cinza-350">COMPRA</div>
          <div className={`font-mono ${compra == null ? "text-cinza-300" : "text-amber-400"}`}>
            {compra == null ? "—" : fmtMoeda(compra)}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-cinza-350">VENDA</div>
          <div className={`font-mono ${venda == null ? "text-cinza-300" : "text-cinza-100"}`}>
            {venda == null ? "—" : fmtMoeda(venda)}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-cinza-350">ESTOQUE</div>
          <div className="font-mono text-cinza-200">
            {estoqueGeral(p).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {un}
          </div>
        </div>
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-cinza-850 flex items-center justify-between text-[10px]">
        <span className="text-cinza-350">
          {Number(p.estoque_atual || 0)}🧊 · {Number(p.estoque_atual_camara || 0)}❄️
        </span>
        <span className={`font-mono font-semibold
          ${lucro == null ? "text-cinza-300" : lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {lucro == null ? "sem lucro calculado" : `${fmtMoeda(lucro)}/${un}`}
        </span>
      </div>
    </button>
  );
}

function CabecalhoTabela() {
  return (
    <div className="grid px-4 py-2.5 border-b border-cinza-800 text-[10px] text-cinza-350 tracking-wider sticky top-0 bg-cinza-900 z-10"
      style={{ gridTemplateColumns: COLUNAS }}>
      <span>PRODUTO</span>
      <span className="text-right">COMPRA</span>
      <span className="text-right">VENDA</span>
      <span className="text-right">ESTOQUE</span>
      <span className="text-right">LUCRO</span>
      <span className="text-right">MARGEM</span>
    </div>
  );
}

function LinhaProduto({ p, onEditar, ultima }) {
  const { lucro, margem, venda, compra } = calcLucro(p);
  const geral = estoqueGeral(p);
  const un = p.unidade;

  return (
    <button
      onClick={() => onEditar(p)}
      className={`w-full grid items-center px-4 py-2.5 text-left hover:bg-cinza-850 transition-colors
        ${ultima ? "" : "border-b border-cinza-850"}`}
      style={{ gridTemplateColumns: COLUNAS }}>
      <span className="flex items-center gap-2 min-w-0">
        <IconeProduto p={p} size={24} />
        <span className="text-xs text-cinza-50 truncate">{p.nome}</span>
      </span>

      <span className={`text-right font-mono text-[11px] ${compra == null ? "text-cinza-300" : "text-amber-400"}`}>
        {compra == null ? "—" : fmtMoeda(compra)}
      </span>

      <span className={`text-right font-mono text-[11px] ${venda == null ? "text-cinza-300" : "text-cinza-100"}`}>
        {venda == null ? "—" : fmtMoeda(venda)}
      </span>

      <span className="text-right font-mono text-[11px] text-cinza-200">
        {geral.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {un}
        <span className="block text-[9px] text-cinza-350">
          {Number(p.estoque_atual || 0)}🧊 · {Number(p.estoque_atual_camara || 0)}❄️
        </span>
      </span>

      <span className={`text-right font-mono text-[11px] font-semibold
        ${lucro == null ? "text-cinza-300" : lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {lucro == null ? "—" : fmtMoeda(lucro)}
        {lucro != null && <span className="block text-[9px] font-normal text-cinza-350">/{un}</span>}
      </span>

      <span className={`text-right font-mono text-[11px] font-semibold ${corMargem(margem)}`}>
        {margem == null ? "—" : fmtPct(margem)}
      </span>
    </button>
  );
}

/**
 * Aba "📊 Tabela": visão de gerenciamento de todos os produtos numa grade
 * — preço de compra, preço de venda, estoque somado dos dois locais, lucro
 * por kg/un e margem. Clicar numa linha abre o mesmo modal de edição de
 * produto usado na aba Estoque (é lá que os dois preços são editados).
 *
 * Só leitura: nenhuma escrita acontece aqui, tudo passa por onEditar.
 *
 * @param {object[]} produtos - lista "crua" (com os dois estoques e os dois preços)
 * @param {(produto: object) => void} onEditar
 */
export default function AbaTabela({ produtos, onEditar }) {
  const [ordem, setOrdem] = useState("categoria"); // "categoria" | "margem" | "lucro" | "estoque"

  const semCompra = produtos.filter(p => p.preco_compra == null).length;

  const capitalParado = produtos.reduce(
    (s, p) => s + estoqueGeral(p) * Number(p.preco_compra || 0), 0);
  const receitaPotencial = produtos.reduce(
    (s, p) => s + estoqueGeral(p) * Number(p.preco || 0), 0);
  const lucroPotencial = receitaPotencial - capitalParado;

  // Ordenação por categoria mantém os grupos (é a visão de conferência);
  // as outras ordens achatam tudo numa lista só, porque o ponto ali é
  // justamente comparar produtos entre categorias.
  const grupos = ordem === "categoria"
    ? CATEGORIAS.map(cat => ({ cat, itens: produtos.filter(p => p.categoria === cat) }))
      .filter(g => g.itens.length > 0)
    : [{
      cat: null,
      itens: [...produtos].sort((a, b) => {
        if (ordem === "estoque") return estoqueGeral(b) - estoqueGeral(a);
        const va = ordem === "margem" ? calcLucro(a).margem : calcLucro(a).lucro;
        const vb = ordem === "margem" ? calcLucro(b).margem : calcLucro(b).lucro;
        // Produtos sem preço cadastrado vão pro fim em vez de virarem "0".
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va;
      }),
    }];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 md:px-6 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {[["categoria", "Por categoria"], ["margem", "Maior margem"], ["lucro", "Maior lucro"], ["estoque", "Maior estoque"]].map(([v, label]) => (
          <button key={v} onClick={() => setOrdem(v)}
            className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
              ${ordem === v
                ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
        {/* Resumo do capital em estoque */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3">
          {[
            { label: "Capital parado", valor: capitalParado, cor: "text-amber-400", dica: "estoque × preço de compra" },
            { label: "Se vender tudo", valor: receitaPotencial, cor: "text-cinza-100", dica: "estoque × preço de venda" },
            { label: "Lucro potencial", valor: lucroPotencial, cor: lucroPotencial >= 0 ? "text-emerald-400" : "text-red-400", dica: "diferença entre os dois" },
          ].map(c => (
            <div key={c.label} className="bg-cinza-900 border border-cinza-800 rounded-xl px-2 sm:px-3 py-2 sm:py-2.5 min-w-0" title={c.dica}>
              <div className="text-[9px] text-cinza-350 mb-1 leading-tight">{c.label}</div>
              {/* tabular-nums + text-[11px] no mobile: "R$ 1.234,56" em três
                  colunas de ~110px estourava a caixa com a fonte padrão. */}
              <div className={`font-mono tabular-nums text-[11px] sm:text-sm font-medium truncate ${c.cor}`}>
                {fmtMoeda(c.valor)}
              </div>
            </div>
          ))}
        </div>

        {semCompra > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] text-amber-400">
              ⚠️ {semCompra} produto(s) sem preço de compra — lucro e margem ficam em branco até cadastrar.
            </span>
          </div>
        )}

        {/* Celular: cards empilhados. A tabela precisa de 620px e viraria
            scroll horizontal permanente numa tela de ~390px. */}
        <div className="sm:hidden flex flex-col gap-3">
          {grupos.map(({ cat, itens }) => (
            <div key={cat || "todos"} className="flex flex-col gap-1.5">
              {cat && (
                <div className="text-[10px] text-cinza-350 tracking-widest uppercase px-1">{cat}</div>
              )}
              {itens.map(p => (
                <CardProduto key={p.id} p={p} onEditar={onEditar} />
              ))}
            </div>
          ))}
        </div>

        <div className="hidden sm:block bg-cinza-900 border border-cinza-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: "620px" }}>
              <CabecalhoTabela />
              {grupos.map(({ cat, itens }) => (
                <div key={cat || "todos"}>
                  {cat && (
                    <div className="px-4 py-1.5 bg-cinza-950/50 text-[10px] text-cinza-350 tracking-widest uppercase">
                      {cat}
                    </div>
                  )}
                  {itens.map((p, i) => (
                    <LinhaProduto key={p.id} p={p} onEditar={onEditar} ultima={i === itens.length - 1} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-[10px] text-cinza-350 mt-2 px-1">
          Margem = lucro ÷ preço de venda. Toque numa linha para editar os preços.
        </div>
      </div>
    </div>
  );
}
