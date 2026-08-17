import { useState } from "react";
import Modal from "../../components/Modal";
import { fmtMoeda, TIPO_LANC_LABEL } from "./format";

const hoje = () => new Date().toLocaleDateString("sv-SE"); // "sv-SE" = YYYY-MM-DD local

/**
 * Modal de lançamento financeiro do PSH — dois modos:
 *
 * - **nova despesa** (`lancamento` null): formulário completo, grava um
 *   lançamento manual (`tipo: "despesa"`).
 * - **editar** (`lancamento` preenchido): em despesa dá pra mexer em tudo
 *   e excluir; em venda/compra só o valor e a data são editáveis, porque
 *   produto e quantidade pertencem à movimentação de estoque que gerou o
 *   lançamento — mudar aqui faria o financeiro divergir do estoque. Editar
 *   o valor marca `editado: true`, o que protege a linha de ser recalculada
 *   se o preço do produto mudar depois.
 *
 * @param {boolean} open
 * @param {object|null} lancamento - null = nova despesa
 * @param {string[]} categorias - nomes das categorias de despesa do PSH
 * @param {() => void} onClose
 * @param {(dados: object) => Promise<boolean>} onSalvar
 * @param {(lancamento: object) => Promise<boolean>} onExcluir
 */
export default function ModalLancamento({ open, lancamento, categorias, onClose, onSalvar, onExcluir }) {
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(hoje());
  const [categoria, setCategoria] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const editando = !!lancamento;
  const ehDespesa = !editando || lancamento.tipo === "despesa";

  // Reseta o formulário quando o modal abre — ajustado durante o render
  // (padrão recomendado pelo React) em vez de um useEffect.
  const [abertoAntes, setAbertoAntes] = useState(false);
  if (open && !abertoAntes) {
    setAbertoAntes(true);
    setValor(lancamento ? String(lancamento.valor ?? "") : "");
    setDescricao(lancamento?.descricao || "");
    setData(lancamento?.data || hoje());
    setCategoria(lancamento?.categoria || categorias[0] || "");
    setConfirmandoExclusao(false);
  } else if (!open && abertoAntes) {
    setAbertoAntes(false);
  }

  const valorNum = parseFloat(String(valor).replace(",", "."));
  const valido = !isNaN(valorNum) && valorNum >= 0 && (!ehDespesa || descricao.trim() || categoria);

  async function salvar() {
    if (!valido) return;
    setSalvando(true);
    const ok = await onSalvar({
      valor: valorNum,
      descricao: descricao.trim() || categoria || null,
      data,
      ...(ehDespesa ? { categoria: categoria || null } : {}),
    });
    setSalvando(false);
    if (ok) onClose();
  }

  async function excluir() {
    setSalvando(true);
    const ok = await onExcluir(lancamento);
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} align="bottom">
      <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-sm mx-auto flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800">
          <span className="text-sm font-semibold text-cinza-50">
            {!editando ? "Nova despesa"
              : `Editar ${TIPO_LANC_LABEL[lancamento.tipo].toLowerCase()}`}
          </span>
          <button onClick={onClose}
            className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Contexto do lançamento automático — o que não dá pra editar aqui */}
          {editando && !ehDespesa && (
            <div className="px-3 py-2 rounded-lg bg-cinza-850 border border-cinza-800">
              <div className="text-xs text-cinza-50">{lancamento.descricao}</div>
              <div className="text-[10px] text-cinza-350 mt-0.5">
                {lancamento.quantidade != null && `${Number(lancamento.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de quantidade · `}
                gerado pelo estoque
              </div>
              <div className="text-[10px] text-cinza-350 mt-1">
                Quantidade e produto vêm da movimentação de estoque — só o valor é editável aqui.
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Valor (R$)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus
              value={valor} onChange={e => setValor(e.target.value)}
              placeholder="0,00"
              className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
            {editando && !lancamento.editado && valorNum !== Number(lancamento.valor) && !isNaN(valorNum) && (
              <div className="text-[10px] text-roxo-400 mt-1">
                era {fmtMoeda(lancamento.valor)} — o valor corrigido não será recalculado depois
              </div>
            )}
          </div>

          {ehDespesa && (
            <>
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Descrição</label>
                <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
                  placeholder="Ex: gasolina da entrega"
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
              </div>

              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Categoria</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {categorias.map(c => (
                    <button key={c} type="button" onClick={() => setCategoria(c)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all
                        ${categoria === c
                          ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                          : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 outline-none focus:border-roxo-700 transition-colors" />
          </div>

          {/* Excluir só faz sentido em despesa: apagar um lançamento gerado
              pelo estoque deixaria a venda/compra sem contraparte financeira
              (pra desfazer, apaga-se a movimentação, que cascateia). */}
          {editando && ehDespesa && (
            <div className="pt-1 border-t border-cinza-800">
              {!confirmandoExclusao ? (
                <button type="button" onClick={() => setConfirmandoExclusao(true)}
                  className="mt-3 text-[11px] text-cinza-350 hover:text-red-400 transition-colors">
                  🗑 Excluir lançamento
                </button>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setConfirmandoExclusao(false)}
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={excluir} disabled={salvando}
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/80 hover:bg-red-500 disabled:opacity-50 text-white transition-colors">
                    {salvando ? "Excluindo..." : "Sim, excluir"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-cinza-800 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando || !valido}
            className="flex-1 py-2 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-40 rounded-lg text-xs font-semibold text-white transition-colors">
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
