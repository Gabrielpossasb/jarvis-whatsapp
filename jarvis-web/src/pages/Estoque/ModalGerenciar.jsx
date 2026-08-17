import { useState } from "react";
import Modal from "../../components/Modal";
import IconeProduto from "./IconeProduto";
import { CATEGORIAS, fmtQtd, fmtMoeda, produtosParaLocal } from "./format";

const LABEL_TIPO = {
  venda: "🔴 Venda",
  entrada: "🟢 Entrada de estoque",
  transferencia: "🔄 Transferência (da câmara)",
};

// Freezer não recebe entrada direta — ele só cresce por transferência da
// câmara fria (ver ModalMovimentacao); pedidos de fornecedor chegam em
// grande quantidade direto na câmara fria, daí "entrada" só existir lá.
const TIPOS_POR_LOCAL = {
  freezer: ["venda", "transferencia"],
  camara_fria: ["venda", "entrada"],
};

/**
 * Modal de venda/entrada em lote ("🔄 Gerenciar" no header). Tem seu
 * próprio toggle freezer/câmara fria — independente do toggle da página —
 * porque pedidos grandes de fornecedor chegam na câmara fria e o usuário
 * não deveria precisar trocar de aba antes só pra lançar a entrada. Cada
 * local oferece um conjunto de tipos diferente (Venda + Entrada na câmara,
 * Venda + Transferência no freezer); a lista de itens começa vazia e cresce
 * pelo botão "+ Adicionar sabor", que abre um picker com quantidade já
 * ajustável ali mesmo. Todo o estado (itens escolhidos, tipo, cliente,
 * local) é local — reseta a cada abertura.
 *
 * @param {boolean} open
 * @param {object[]} produtos - lista "crua", não a view remapeada pra câmara
 * @param {string} localInicial - "freezer" | "camara_fria", pré-seleciona o toggle do modal
 * @param {() => void} onClose
 * @param {(tipo: "venda"|"entrada"|"transferencia", itens: Record<string, number>, cliente: string, local: string) => Promise<boolean>} onSubmit
 */
export default function ModalGerenciar({ open, produtos, localInicial, onClose, onSubmit }) {
  const [localModal, setLocalModal] = useState(localInicial || "freezer");
  const tipos = TIPOS_POR_LOCAL[localModal];
  const [tipo, setTipo] = useState(tipos[0]);
  const [itens, setItens] = useState({}); // { [produto_id]: number }
  const [cliente, setCliente] = useState("");
  const [pickerAberto, setPickerAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Reseta o lote quando o modal abre — ajustado durante o render (padrão
  // recomendado pelo React pra isso) em vez de um useEffect.
  const [abertoAntes, setAbertoAntes] = useState(false);
  if (open && !abertoAntes) {
    setAbertoAntes(true);
    setLocalModal(localInicial || "freezer");
    setTipo(TIPOS_POR_LOCAL[localInicial || "freezer"][0]);
    setItens({});
    setCliente("");
    setPickerAberto(false);
  } else if (!open && abertoAntes) {
    setAbertoAntes(false);
  }

  // Trocar o local muda quais tipos existem (entrada só na câmara,
  // transferência só no freezer) — reseta o lote pra não deixar itens
  // escolhidos com um tipo que não existe mais no outro local.
  function trocarLocalModal(l) {
    if (l === localModal) return;
    setLocalModal(l);
    setTipo(TIPOS_POR_LOCAL[l][0]);
    setItens({});
  }

  const produtosView = produtosParaLocal(produtos, localModal);
  const porCategoria = CATEGORIAS.map(cat => ({
    cat,
    itens: produtosView.filter(p => p.categoria === cat),
  })).filter(g => g.itens.length > 0);

  // Usado tanto na lista de itens adicionados quanto no picker (onde o
  // primeiro "+" já adiciona o sabor); chegar a 0 remove o item do lote.
  function adjItem(prodId, delta) {
    setItens(prev => {
      const novo = (prev[prodId] || 0) + delta;
      if (novo <= 0) {
        const next = { ...prev };
        delete next[prodId];
        return next;
      }
      return { ...prev, [prodId]: novo };
    });
  }

  function removerItem(prodId) {
    setItens(prev => {
      const next = { ...prev };
      delete next[prodId];
      return next;
    });
  }

  async function registrar() {
    if (excedeCamara) return;
    setSalvando(true);
    const ok = await onSubmit(tipo, itens, cliente, localModal);
    setSalvando(false);
    if (ok) onClose();
  }

  const itensAtivos = produtosView.filter(p => (itens[p.id] || 0) > 0);
  const excedeCamara = tipo === "transferencia"
    && itensAtivos.some(p => itens[p.id] > Number(p.estoque_atual_camara));
  const totalR = tipo === "venda"
    ? itensAtivos.reduce((s, p) => s + (itens[p.id] * (p.preco || 0)), 0)
    : 0;

  return (
    <Modal open={open} onClose={onClose} align="bottom">
      <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-md mx-auto flex flex-col max-h-[88vh] sm:max-h-[75vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800 shrink-0">
          <span className="text-sm font-semibold text-cinza-50">🔄 Gerenciar Estoque</span>
          <button onClick={onClose}
            className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
            ✕
          </button>
        </div>

        {/* Toggle entre freezer e câmara fria — muda quais tipos existem abaixo */}
        <div className="px-5 pt-3 shrink-0 flex gap-2">
          {[["freezer", "🧊 Freezer"], ["camara_fria", "❄️ Câmara fria"]].map(([l, label]) => (
            <button key={l} onClick={() => trocarLocalModal(l)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-all
                ${localModal === l
                  ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                  : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Toggle entre os tipos disponíveis */}
        <div className="px-5 py-3 border-b border-cinza-800 shrink-0 flex gap-2">
          {tipos.map(t => (
            <button key={t} onClick={() => setTipo(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all
                ${tipo === t
                  ? t === "venda" ? "border-red-500 bg-red-500/15 text-red-400"
                    : t === "transferencia" ? "border-roxo-700 bg-roxo-700/15 text-roxo-400"
                    : "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                  : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
              {LABEL_TIPO[t]}
            </button>
          ))}
        </div>

        {/* Nome do cliente — só faz sentido em venda */}
        {tipo === "venda" && (
          <div className="px-5 py-3 border-b border-cinza-800 shrink-0">
            <input
              type="text"
              value={cliente}
              onChange={e => setCliente(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              className="w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-red-500/60 transition-colors"
            />
          </div>
        )}

        {/* Corpo: lista de sabores adicionados, ou o picker */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
          {!pickerAberto ? (
            <>
              {itensAtivos.length === 0 ? (
                <div className="text-center text-cinza-350 text-sm py-10">
                  Nenhum sabor adicionado ainda
                </div>
              ) : (
                <div className="bg-cinza-950/40 border border-cinza-800 rounded-xl overflow-hidden mb-3">
                  {itensAtivos.map((p, i) => {
                    const qty = itens[p.id];
                    return (
                      <div key={p.id}
                        className={`flex items-center gap-3 px-3 py-2.5 ${i < itensAtivos.length - 1 ? "border-b border-cinza-850" : ""}`}>
                        <IconeProduto p={p} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-cinza-50 truncate">{p.nome}</div>
                          <div className="text-[10px] text-cinza-350 mt-0.5">
                            {fmtQtd(p.estoque_atual, p.unidade)}
                            {p.preco && (
                              <span className={`ml-2 ${tipo === "venda" ? "text-red-400/80" : "text-emerald-400/80"}`}>
                                = {fmtMoeda(qty * p.preco)}
                              </span>
                            )}
                          </div>
                          {tipo === "transferencia" && qty > Number(p.estoque_atual_camara) && (
                            <div className="text-[10px] text-red-400 mt-0.5">
                              só há {fmtQtd(p.estoque_atual_camara, p.unidade)} na câmara
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => adjItem(p.id, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-sm font-bold">
                            −
                          </button>
                          <div className="w-8 text-center text-sm font-semibold text-cinza-50">
                            {qty}
                          </div>
                          <button
                            onClick={() => adjItem(p.id, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-sm font-bold">
                            +
                          </button>
                          <button
                            onClick={() => removerItem(p.id)}
                            title="Remover"
                            className="ml-1 w-6 h-6 flex items-center justify-center rounded-lg text-cinza-350 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs">
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={() => setPickerAberto(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-cinza-700 text-cinza-200 hover:border-roxo-700 hover:text-roxo-400 transition-colors text-xs font-semibold">
                + Adicionar sabor
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-cinza-900 py-1 z-10">
                <span className="text-xs text-cinza-200">Ajuste as quantidades</span>
                <button onClick={() => setPickerAberto(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-roxo-700 hover:bg-roxo-600 text-white transition-colors">
                  Concluir
                </button>
              </div>
              {porCategoria.map(({ cat, itens: itensCat }) => (
                <div key={cat} className="mb-4">
                  <div className="text-[10px] text-cinza-350 tracking-widest font-medium px-1 mb-2 uppercase">{cat}</div>
                  <div className="bg-cinza-950/40 border border-cinza-800 rounded-xl overflow-hidden">
                    {itensCat.map((p, i) => {
                      const qty = itens[p.id] || 0;
                      return (
                        <div key={p.id}
                          className={`flex items-center gap-3 px-3 py-2.5 transition-colors
                            ${qty > 0 ? "bg-roxo-700/10" : ""}
                            ${i < itensCat.length - 1 ? "border-b border-cinza-850" : ""}`}>
                          <IconeProduto p={p} size={28} />
                          <span className={`flex-1 text-xs truncate ${qty > 0 ? "text-roxo-400 font-medium" : "text-cinza-50"}`}>
                            {p.nome}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => adjItem(p.id, -1)}
                              disabled={qty === 0}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 disabled:opacity-30 transition-colors text-sm font-bold">
                              −
                            </button>
                            <div className="w-6 text-center text-xs font-semibold text-cinza-50">
                              {qty || "—"}
                            </div>
                            <button
                              onClick={() => adjItem(p.id, 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-sm font-bold">
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer: resumo + ações */}
        <div className="px-5 py-4 border-t border-cinza-800 shrink-0 flex flex-col gap-3">
          {itensAtivos.length > 0 && !pickerAberto && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-cinza-200">
                {itensAtivos.length} sabor{itensAtivos.length > 1 ? "es" : ""}
                {tipo === "venda" && cliente && <span className="text-cinza-350"> · {cliente}</span>}
              </div>
              {totalR > 0 && (
                <div className={`text-sm font-bold ${tipo === "venda" ? "text-red-400" : "text-emerald-400"}`}>
                  {fmtMoeda(totalR)}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
              Cancelar
            </button>
            <button
              onClick={registrar}
              disabled={salvando || itensAtivos.length === 0 || excedeCamara}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 text-white transition-colors
                ${tipo === "venda" ? "bg-red-500/80 hover:bg-red-500"
                  : tipo === "transferencia" ? "bg-roxo-700 hover:bg-roxo-600"
                  : "bg-emerald-500/80 hover:bg-emerald-500"}`}>
              {salvando ? "Salvando..." : `Registrar${itensAtivos.length > 0 ? ` (${itensAtivos.length})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
