import { useState } from "react";
import Modal from "../../components/Modal";
import IconeProduto from "./IconeProduto";
import { CATEGORIAS, fmtQtd, produtosParaLocal } from "./format";

// Reconhece linhas do tipo "Produto — 5 kg" coladas na aba de texto.
const LINHA_RE = /^(.+?)\s*[—–-]+\s*([\d,.]+)\s*(kg|un)?\s*$/i;

function normNome(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function parsearTexto(texto) {
  return texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).flatMap(linha => {
    const m = linha.match(LINHA_RE);
    if (!m) return [];
    const qtd = parseFloat(m[2].replace(",", "."));
    if (isNaN(qtd) || qtd < 0) return [];
    return [{ nome: m[1].trim(), quantidade: qtd }];
  });
}

function resolverProdutosTexto(itens, produtos) {
  return itens.map(item => {
    const n = normNome(item.nome);
    const produto = produtos.find(p => normNome(p.nome) === n)
      || produtos.find(p => normNome(p.nome).includes(n))
      || produtos.find(p => n.includes(normNome(p.nome)));
    return { ...item, produto: produto || null };
  });
}

/**
 * Modal de contagem de estoque ("📋 Contagem" no header) — duas formas de
 * lançar a recontagem completa: formulário (um input por produto,
 * agrupado por categoria) ou colar uma lista de texto solta
 * ("Produto — quantidade kg/un") que é casada por nome com os produtos
 * existentes. Em ambos os casos só os itens que realmente mudaram viram
 * movimentação `contagem`. Fecha sempre ao salvar, mesmo se algum item
 * não puder ser salvo (mesmo comportamento de antes do refactor).
 *
 * Recebe `produtos` sempre "cru" (não a view remapeada da página) porque o
 * modal tem seu próprio toggle freezer/câmara fria — os estoques são
 * independentes, então dá pra lançar a contagem de um sem precisar trocar
 * o local ativo na tela de trás primeiro.
 *
 * @param {boolean} open
 * @param {object[]} produtos
 * @param {string} localInicial - "freezer" | "camara_fria", pré-seleciona o toggle do modal
 * @param {() => void} onClose
 * @param {(alterados: {produto: object, novoVal: number}[], local: string) => Promise<void>} onSalvar
 */
export default function ModalContagem({ open, produtos, localInicial, onClose, onSalvar }) {
  const [contagens, setContagens] = useState({});
  const [textoContagem, setTextoContagem] = useState("");
  const [aba, setAba] = useState("formulario");
  const [localModal, setLocalModal] = useState(localInicial || "freezer");
  const [salvando, setSalvando] = useState(false);

  // Reseta o formulário quando o modal abre — ajustado durante o render
  // (padrão recomendado pelo React pra isso) em vez de um useEffect.
  const [abertoAntes, setAbertoAntes] = useState(false);
  if (open && !abertoAntes) {
    setAbertoAntes(true);
    setContagens({});
    setTextoContagem("");
    setAba("formulario");
    setLocalModal(localInicial || "freezer");
  } else if (!open && abertoAntes) {
    setAbertoAntes(false);
  }

  const produtosView = produtosParaLocal(produtos, localModal);
  const porCategoria = CATEGORIAS.map(cat => ({
    cat,
    itens: produtosView.filter(p => p.categoria === cat),
  })).filter(g => g.itens.length > 0);

  async function salvarFormulario() {
    const alterados = produtosView
      .filter(p => {
        const v = contagens[p.id];
        if (v === undefined || v === "") return false;
        return parseFloat(String(v).replace(",", ".")) !== Number(p.estoque_atual);
      })
      .map(p => ({ produto: p, novoVal: parseFloat(String(contagens[p.id]).replace(",", ".")) }));

    if (alterados.length === 0) { onClose(); return; }

    setSalvando(true);
    await onSalvar(alterados, localModal);
    setSalvando(false);
    onClose();
  }

  async function salvarTexto() {
    const itens = parsearTexto(textoContagem);
    const resolvidos = resolverProdutosTexto(itens, produtosView).filter(i => i.produto);
    const alterados = resolvidos
      .filter(i => i.quantidade !== Number(i.produto.estoque_atual))
      .map(i => ({ produto: i.produto, novoVal: i.quantidade }));

    if (alterados.length === 0) { onClose(); return; }

    setSalvando(true);
    await onSalvar(alterados, localModal);
    setSalvando(false);
    onClose();
  }

  const itensTxt = parsearTexto(textoContagem);
  const resolvidosTxt = resolverProdutosTexto(itensTxt, produtosView);
  const alteradosTxt = resolvidosTxt.filter(i => i.produto && i.quantidade !== Number(i.produto.estoque_atual));
  const naoEncontradosTxt = resolvidosTxt.filter(i => !i.produto);
  const alteradosForm = Object.keys(contagens).filter(id => {
    const p = produtosView.find(x => x.id === id);
    if (!p || contagens[id] === "") return false;
    return parseFloat(String(contagens[id]).replace(",", ".")) !== Number(p.estoque_atual);
  });

  // Trocar o local dentro do modal muda a baseline (estoque_atual x
  // estoque_atual_camara) de todo mundo — limpa o que já foi digitado pra
  // não comparar valor novo contra o local errado.
  function trocarLocalModal(l) {
    if (l === localModal) return;
    setLocalModal(l);
    setContagens({});
  }

  return (
    <Modal open={open} onClose={onClose} align="bottom">
      <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-lg mx-auto flex flex-col max-h-[88vh] sm:max-h-[75vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800 shrink-0">
          <div>
            <div className="text-sm font-semibold text-cinza-50">Contagem de Estoque</div>
            <div className="flex gap-1.5 mt-1.5">
              {[["freezer", "🧊 Freezer"], ["camara_fria", "❄️ Câmara fria"]].map(([l, label]) => (
                <button key={l} onClick={() => trocarLocalModal(l)}
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium border transition-all
                    ${localModal === l
                      ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                      : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {["formulario", "texto"].map(a => (
                <button key={a} onClick={() => setAba(a)}
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium border transition-all
                    ${aba === a
                      ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                      : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                  {a === "formulario" ? "📋 Formulário" : "📝 Texto"}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose}
            className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
          {aba === "formulario" ? (
            <>
              {alteradosForm.length > 0 && (
                <div className="mb-3 -mt-1 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
                  <span className="text-[11px] text-sky-400">
                    {alteradosForm.length} produto(s) com valor diferente do atual
                  </span>
                </div>
              )}
              {porCategoria.map(({ cat, itens }) => (
                <div key={cat} className="mb-4">
                  <div className="text-[10px] text-cinza-350 tracking-widest font-medium px-1 mb-2 uppercase">{cat}</div>
                  <div className="bg-cinza-950/40 border border-cinza-800 rounded-xl overflow-hidden">
                    {itens.map((p, i) => {
                      const val = contagens[p.id] ?? "";
                      const novoVal = val !== "" ? parseFloat(String(val).replace(",", ".")) : null;
                      const mudou = novoVal !== null && novoVal !== Number(p.estoque_atual);
                      return (
                        <div key={p.id}
                          className={`flex items-center gap-3 px-3 py-2.5 transition-colors
                            ${mudou ? "bg-sky-500/5" : ""}
                            ${i < itens.length - 1 ? "border-b border-cinza-850" : ""}`}>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <IconeProduto p={p} size={26} />
                            <div className="min-w-0">
                              <div className="text-xs text-cinza-50 truncate">{p.nome}</div>
                              <div className="text-[10px] text-cinza-350 mt-0.5">
                                atual: {fmtQtd(p.estoque_atual, p.unidade)}
                                {mudou && (
                                  <span className={`ml-2 font-medium ${novoVal > Number(p.estoque_atual) ? "text-emerald-400" : "text-red-400"}`}>
                                    → {fmtQtd(novoVal, p.unidade)}
                                    {novoVal > Number(p.estoque_atual)
                                      ? ` (+${(novoVal - Number(p.estoque_atual)).toLocaleString("pt-BR", { minimumFractionDigits: 1 })})`
                                      : ` (${(novoVal - Number(p.estoque_atual)).toLocaleString("pt-BR", { minimumFractionDigits: 1 })})`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number" inputMode="decimal" min="0" step="0.1"
                              value={val}
                              onChange={e => setContagens(prev => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder={Number(p.estoque_atual).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
                              className={`w-20 text-right bg-cinza-850 border rounded-lg px-2 py-1.5 text-xs text-cinza-50 placeholder-cinza-300 outline-none transition-colors
                                ${mudou ? "border-sky-500/60 focus:border-sky-400" : "border-cinza-700 focus:border-roxo-700"}`}
                            />
                            <span className="text-[10px] text-cinza-350 w-4">{p.unidade}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[10px] text-cinza-200 uppercase tracking-wider mb-2">
                  Cole ou digite a lista no formato: <span className="text-roxo-400">Produto — quantidade kg/un</span>
                </div>
                <textarea
                  value={textoContagem}
                  onChange={e => setTextoContagem(e.target.value)}
                  placeholder={"Abacaxi — 5 kg\nMorango — 3 kg\nAçaí 500ml — 6 un"}
                  rows={6}
                  className="w-full bg-cinza-850 border border-cinza-700 rounded-xl px-4 py-3 text-sm text-cinza-50 placeholder-cinza-300 outline-none focus:border-roxo-700 resize-none font-mono leading-relaxed transition-colors"
                />
              </div>

              {itensTxt.length > 0 && (
                <div>
                  <div className="text-[10px] text-cinza-200 uppercase tracking-wider mb-2">
                    Preview — {alteradosTxt.length} produto(s) serão atualizados
                  </div>
                  <div className="bg-cinza-950/40 border border-cinza-800 rounded-xl overflow-hidden">
                    {resolvidosTxt.map((item, i) => (
                      <div key={i}
                        className={`flex items-center gap-3 px-3 py-2.5
                          ${i < resolvidosTxt.length - 1 ? "border-b border-cinza-850" : ""}`}>
                        {item.produto ? (
                          <>
                            <IconeProduto p={item.produto} size={26} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-cinza-50 truncate">{item.produto.nome}</div>
                              <div className="text-[10px] text-cinza-350">
                                {fmtQtd(item.produto.estoque_atual, item.produto.unidade)}
                                {item.quantidade !== Number(item.produto.estoque_atual) && (
                                  <span className={`ml-2 font-medium ${item.quantidade > Number(item.produto.estoque_atual) ? "text-emerald-400" : "text-red-400"}`}>
                                    → {fmtQtd(item.quantidade, item.produto.unidade)}
                                  </span>
                                )}
                                {item.quantidade === Number(item.produto.estoque_atual) && (
                                  <span className="ml-2 text-cinza-350">sem alteração</span>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] text-emerald-400/70 shrink-0">✓</span>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-cinza-200 truncate">{item.nome}</div>
                              <div className="text-[10px] text-red-400/70">produto não encontrado</div>
                            </div>
                            <span className="text-[10px] text-red-400/70 shrink-0">✗</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {naoEncontradosTxt.length > 0 && (
                    <div className="mt-2 text-[10px] text-cinza-350">
                      ⚠️ {naoEncontradosTxt.length} produto(s) não reconhecido(s) serão ignorados
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-cinza-800 shrink-0 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
            Cancelar
          </button>
          <button
            onClick={aba === "formulario" ? salvarFormulario : salvarTexto}
            disabled={salvando}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 text-white transition-colors">
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
