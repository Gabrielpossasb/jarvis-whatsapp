import { useState } from "react";
import { supabase } from "../../lib/supabase";
import Modal from "../../components/Modal";
import IconeProduto from "./IconeProduto";
import { CATEGORIAS, EMOJI_PADRAO, BUCKET_ICONES } from "./format";

/**
 * Modal de cadastro de um produto novo: emoji/imagem, nome, categoria,
 * unidade (kg/un), estoque mínimo e preço. Sempre entra com
 * estoque_atual = 0 — a entrada real é lançada depois pelo botão "+" do
 * card ou pelo Gerenciar.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {(dados: object) => Promise<boolean>} onCriar
 * @param {(msg: string, ok?: boolean) => void} showToast
 */
export default function ModalNovoProduto({ open, onClose, onCriar, showToast }) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [unidade, setUnidade] = useState("kg");
  const [emoji, setEmoji] = useState("");
  const [iconeUrl, setIconeUrl] = useState("");
  const [enviandoIcone, setEnviandoIcone] = useState(false);
  const [min, setMin] = useState("");
  const [minCamara, setMinCamara] = useState("");
  const [preco, setPreco] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Reseta o formulário quando o modal abre — ajustado durante o render
  // (padrão recomendado pelo React pra isso) em vez de um useEffect.
  const [abertoAntes, setAbertoAntes] = useState(false);
  if (open && !abertoAntes) {
    setAbertoAntes(true);
    setNome("");
    setCategoria(CATEGORIAS[0]);
    setUnidade("kg");
    setEmoji("");
    setIconeUrl("");
    setMin("");
    setMinCamara("");
    setPreco("");
  } else if (!open && abertoAntes) {
    setAbertoAntes(false);
  }

  // Produto ainda não existe (sem id) nesse ponto, então o upload usa uma
  // chave aleatória em vez do id do produto (diferente do ModalEditarProduto,
  // que já tem um produto salvo pra nomear o arquivo).
  async function enviarIcone(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Imagem muito grande (máx. 2MB)", false);
      return;
    }
    setEnviandoIcone(true);
    const ext = file.name.split(".").pop();
    const caminho = `novo-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_ICONES).upload(caminho, file, { upsert: true });
    if (error) {
      showToast("Erro ao enviar imagem", false);
    } else {
      const { data } = supabase.storage.from(BUCKET_ICONES).getPublicUrl(caminho);
      setIconeUrl(data.publicUrl);
    }
    setEnviandoIcone(false);
  }

  async function criar() {
    const nomeTrim = nome.trim();
    if (!nomeTrim) return;
    setSalvando(true);
    const ok = await onCriar({
      nome: nomeTrim,
      categoria,
      unidade,
      emoji: emoji.trim() || null,
      icone_url: iconeUrl || null,
      estoque_atual: 0,
      estoque_atual_camara: 0,
      estoque_minimo: parseFloat(String(min).replace(",", ".")) || 0,
      estoque_minimo_camara: parseFloat(String(minCamara).replace(",", ".")) || 0,
      preco: preco ? parseFloat(String(preco).replace(",", ".")) : null,
      ativo: true,
    });
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} align="bottom">
      <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-sm mx-auto flex flex-col max-h-[88vh] sm:max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800 shrink-0">
          <span className="text-sm font-semibold text-cinza-50">Novo produto</span>
          <button onClick={onClose}
            className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
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
                  placeholder="Ex: Morango" autoFocus
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Emoji (se não tiver imagem)</label>
                <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)}
                  placeholder={EMOJI_PADRAO} maxLength={4}
                  className="mt-1.5 w-20 text-center bg-cinza-850 border border-cinza-700 rounded-lg px-2 py-2 text-base outline-none focus:border-roxo-700 transition-colors" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Categoria</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CATEGORIAS.map(c => (
                <button key={c} type="button" onClick={() => setCategoria(c)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all
                    ${categoria === c
                      ? "border-roxo-700 bg-roxo-700/15 text-roxo-400"
                      : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Unidade</label>
            <div className="mt-1.5 flex gap-2">
              {["kg", "un"].map(u => (
                <button key={u} type="button" onClick={() => setUnidade(u)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all
                    ${unidade === u
                      ? "border-roxo-700 bg-roxo-700/15 text-roxo-400"
                      : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                  {u === "kg" ? "Quilos (kg)" : "Unidade (un)"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                Mínimo — Freezer ({unidade})
              </label>
              <input type="number" inputMode="decimal" min="0" step="0.5"
                value={min} onChange={e => setMin(e.target.value)}
                placeholder="0"
                className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                Mínimo — Câmara fria ({unidade})
              </label>
              <input type="number" inputMode="decimal" min="0" step="0.5"
                value={minCamara} onChange={e => setMinCamara(e.target.value)}
                placeholder="0"
                className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
              Preço de venda (R$/{unidade})
            </label>
            <input type="number" inputMode="decimal" min="0" step="0.01"
              value={preco} onChange={e => setPreco(e.target.value)}
              placeholder="Não definido"
              className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-cinza-800 shrink-0 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
            Cancelar
          </button>
          <button onClick={criar} disabled={salvando || !nome.trim()}
            className="flex-1 py-2 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
            {salvando ? "Criando..." : "Criar produto"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
