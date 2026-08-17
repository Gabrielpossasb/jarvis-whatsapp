import IconeProduto from "./IconeProduto";
import { fmtQtd, fmtMoeda } from "./format";

/**
 * Card de um produto na grade da aba Estoque: imagem/emoji + nome
 * centralizados, estoque atual vs. mínimo (com barra de progresso e
 * borda vermelha quando abaixo do mínimo), preço e um botão redondo de
 * venda rápida. Editar (✏️) fica sempre visível no canto superior
 * direito.
 *
 * @param {object} produto
 * @param {(produto: object) => void} onVender - abre o modal de movimentação já no modo venda
 * @param {(produto: object) => void} onEditar - abre o modal de edição desse produto
 */
export default function ProdutoCard({ produto: p, onVender, onEditar }) {
  const atual = Number(p.estoque_atual);
  const minimo = Number(p.estoque_minimo);
  const abaixo = atual < minimo;
  const pct = minimo > 0 ? Math.min(100, (atual / minimo) * 100) : 100;

  return (
    <div className={`relative bg-cinza-900 border rounded-xl p-3 flex flex-col gap-2
      ${abaixo ? "border-red-500/40" : "border-cinza-800"}`}>

      <button onClick={() => onEditar(p)}
        className="absolute top-2 right-2 text-cinza-300 hover:text-roxo-400 transition-colors z-10">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
          <path d="M11.5 1.5a1.5 1.5 0 0 1 2.12 2.12l-8.5 8.5-2.83.71.71-2.83 8.5-8.5z"/>
        </svg>
      </button>

      {/* Imagem/emoji + nome centralizados */}
      <div className="flex items-center gap-4 pt-1">
        <IconeProduto p={p} size={44} />
        <span className="text-[14px] font-medium text-cinza-50 leading-tight text-center">
          {abaixo && <span className="text-red-400 mr-0.5">⚠</span>}
          {p.nome}
        </span>
      </div>

      {/* Estoque atual */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className={`text-base font-bold leading-tight ${abaixo ? "text-red-400" : "text-roxo-400"}`}>
            {fmtQtd(atual, p.unidade)}
          </div>
          <div className="text-[10px] text-cinza-350 mt-0.5">mín {fmtQtd(minimo, p.unidade)}</div>
        </div>

        <button onClick={() => onVender(p)}
          title="Registrar venda"
          className={`w-8 h-8 shrink-0 flex items-center pb-1 justify-center rounded-full transition-all duration-500 ${abaixo ? "bg-red-500 hover:bg-red-600" : "bg-roxo-700 hover:bg-roxo-600"}  text-white font-bold text-2xl leading-none transition-colors`}>
          +
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="w-full h-1 rounded-full bg-cinza-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${abaixo ? "bg-red-500" : "bg-roxo-700"}`}
          style={{ width: `${pct}%` }} />
      </div>

      {/* Preço */}
      {fmtMoeda(p.preco) && (
        <div className="text-[10px] text-cinza-300">{fmtMoeda(p.preco)}/{p.unidade}</div>
      )}
    </div>
  );
}
