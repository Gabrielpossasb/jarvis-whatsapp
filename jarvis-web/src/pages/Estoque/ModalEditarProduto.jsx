import { useState } from "react";
import { supabase } from "../../lib/supabase";
import Modal from "../../components/Modal";
import IconeProduto from "./IconeProduto";
import { EMOJI_PADRAO, BUCKET_ICONES, fmtMoeda, fmtPct } from "./format";

/**
 * Modal de edição de um produto: nome, emoji/imagem, estoque mínimo,
 * preço de venda, e remoção (soft delete via `ativo=false`, com
 * confirmação inline). Estado do formulário é local, resetado a partir
 * do `produto` recebido toda vez que o modal abre.
 *
 * @param {boolean} open
 * @param {object|null} produto
 * @param {() => void} onClose
 * @param {(produto: object, updates: object) => Promise<boolean>} onSalvar
 * @param {(produto: object) => Promise<boolean>} onRemover
 * @param {(msg: string, ok?: boolean) => void} showToast
 */
export default function ModalEditarProduto({ open, produto, onClose, onSalvar, onRemover, showToast }) {
  const [nome, setNome] = useState("");
  const [emoji, setEmoji] = useState("");
  const [iconeUrl, setIconeUrl] = useState("");
  const [enviandoIcone, setEnviandoIcone] = useState(false);
  const [min, setMin] = useState("");
  const [minCamara, setMinCamara] = useState("");
  const [preco, setPreco] = useState("");
  const [precoCompra, setPrecoCompra] = useState("");
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Reseta o formulário a partir do produto quando o modal abre — ajustado
  // durante o render (padrão recomendado pelo React) em vez de um useEffect.
  const [abertoAntes, setAbertoAntes] = useState(false);
  if (open && produto && !abertoAntes) {
    setAbertoAntes(true);
    setNome(produto.nome);
    setEmoji(produto.emoji || "");
    setIconeUrl(produto.icone_url || "");
    setMin(String(produto.estoque_minimo));
    setMinCamara(String(produto.estoque_minimo_camara));
    setPreco(produto.preco != null ? String(produto.preco) : "");
    setPrecoCompra(produto.preco_compra != null ? String(produto.preco_compra) : "");
    setConfirmandoRemocao(false);
  } else if (!open && abertoAntes) {
    setAbertoAntes(false);
  }

  async function enviarIcone(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Imagem muito grande (máx. 2MB)", false);
      return;
    }
    setEnviandoIcone(true);
    const ext = file.name.split(".").pop();
    const caminho = `${produto.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_ICONES).upload(caminho, file, { upsert: true });
    if (error) {
      showToast("Erro ao enviar imagem", false);
    } else {
      const { data } = supabase.storage.from(BUCKET_ICONES).getPublicUrl(caminho);
      setIconeUrl(data.publicUrl);
    }
    setEnviandoIcone(false);
  }

  async function salvar() {
    setSalvando(true);
    const ok = await onSalvar(produto, {
      nome: nome.trim() || produto.nome,
      emoji: emoji.trim() || null,
      icone_url: iconeUrl || null,
      estoque_minimo: parseFloat(String(min).replace(",", ".")) || 0,
      estoque_minimo_camara: parseFloat(String(minCamara).replace(",", ".")) || 0,
      preco: preco ? parseFloat(String(preco).replace(",", ".")) : null,
      preco_compra: precoCompra ? parseFloat(String(precoCompra).replace(",", ".")) : null,
    });
    setSalvando(false);
    if (ok) onClose();
  }

  async function remover() {
    setSalvando(true);
    const ok = await onRemover(produto);
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} align="bottom">
      {produto && (
        <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-sm mx-auto flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800">
            <span className="text-sm font-semibold text-cinza-50">Editar produto</span>
            <button onClick={onClose}
              className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
              ✕
            </button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex gap-3 items-start">
              <div className="shrink-0 flex flex-col items-center gap-1.5">
                <div className="w-20 h-20 rounded-xl bg-cinza-850 border border-cinza-700 flex items-center justify-center overflow-hidden">
                  <IconeProduto p={{ emoji, icone_url: iconeUrl }} size={44} />
                </div>
                <label className={`text-[9px] font-medium cursor-pointer transition-colors
                  ${enviandoIcone ? "text-cinza-350" : "text-roxo-400 hover:text-roxo-300"}`}>
                  {enviandoIcone ? "Enviando..." : "📷 Imagem"}
                  <input type="file" accept="image/*" className="hidden" disabled={enviandoIcone}
                    onChange={e => enviarIcone(e.target.files?.[0])} />
                </label>
                {iconeUrl && !enviandoIcone && (
                  <button type="button" onClick={() => setIconeUrl("")}
                    className="text-[9px] text-cinza-350 hover:text-red-400 transition-colors">
                    remover
                  </button>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-3">
                <div>
                  <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Nome</label>
                  <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                    className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 outline-none focus:border-roxo-700 transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Emoji (se não tiver imagem)</label>
                  <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)}
                    placeholder={EMOJI_PADRAO} maxLength={4}
                    className="mt-1.5 w-20 text-center bg-cinza-850 border border-cinza-700 rounded-lg px-2 py-2 text-base outline-none focus:border-roxo-700 transition-colors" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Mínimo — Freezer ({produto.unidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.5"
                  value={min} onChange={e => setMin(e.target.value)}
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 outline-none focus:border-roxo-700 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Mínimo — Câmara fria ({produto.unidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.5"
                  value={minCamara} onChange={e => setMinCamara(e.target.value)}
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 outline-none focus:border-roxo-700 transition-colors" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Compra (R$/{produto.unidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.01"
                  value={precoCompra} onChange={e => setPrecoCompra(e.target.value)}
                  placeholder="Não definido"
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-amber-500/60 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Venda (R$/{produto.unidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.01"
                  value={preco} onChange={e => setPreco(e.target.value)}
                  placeholder="Não definido"
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
              </div>
            </div>

            {/* Prévia do lucro enquanto digita — evita ter que salvar e ir
                pra aba Tabela só pra conferir se o preço ficou de pé. */}
            {(() => {
              const c = parseFloat(String(precoCompra).replace(",", "."));
              const v = parseFloat(String(preco).replace(",", "."));
              if (isNaN(c) || isNaN(v)) return null;
              const lucro = v - c;
              const margem = v > 0 ? (lucro / v) * 100 : null;
              return (
                <div className="-mt-1 px-3 py-2 rounded-lg bg-cinza-850 border border-cinza-800 flex items-center justify-between">
                  <span className="text-[10px] text-cinza-350">Lucro por {produto.unidade}</span>
                  <span className={`font-mono text-xs font-semibold ${lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtMoeda(lucro)}
                    {margem != null && <span className="text-cinza-350 font-normal"> · {fmtPct(margem)}</span>}
                  </span>
                </div>
              );
            })()}

            <div className="pt-1 border-t border-cinza-800">
              {!confirmandoRemocao ? (
                <button type="button" onClick={() => setConfirmandoRemocao(true)}
                  className="mt-3 text-[11px] text-cinza-350 hover:text-red-400 transition-colors">
                  🗑 Remover produto
                </button>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <span className="text-[11px] text-red-400">
                    Remover "{nome}"? Sai da lista de estoque — o histórico de movimentações continua.
                  </span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmandoRemocao(false)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
                      Cancelar
                    </button>
                    <button type="button" onClick={remover} disabled={salvando}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/80 hover:bg-red-500 disabled:opacity-50 text-white transition-colors">
                      {salvando ? "Removendo..." : "Sim, remover"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-cinza-800 flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando}
              className="flex-1 py-2 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
