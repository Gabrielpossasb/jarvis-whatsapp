import { useState } from "react";
import Modal from "../../components/Modal";
import IconeProduto from "./IconeProduto";
import { fmtQtd, TIPO_LABEL } from "./format";

const COR_TIPO = {
  entrada: "border-emerald-500 bg-emerald-500/15 text-emerald-400",
  venda: "border-red-500 bg-red-500/15 text-red-400",
  consumo: "border-amber-500 bg-amber-500/15 text-amber-400",
  transferencia: "border-roxo-700 bg-roxo-700/15 text-roxo-400",
};

/**
 * Modal de movimentação individual de um produto: entrada (ou
 * transferência, no freezer), venda ou consumo, com stepper de quantidade
 * (sempre de 1 em 1) e um campo de pessoa que só aparece pro consumo.
 * Estado do formulário é local — a cada abertura (produto novo) ele
 * reseta pro tipo inicial recebido.
 *
 * @param {boolean} open
 * @param {object|null} produto - produto alvo (null enquanto fechado/animando saída);
 *   quando o tipo "transferencia" está disponível, espera também `estoque_atual_camara`
 * @param {"entrada"|"venda"|"consumo"|"transferencia"} tipoInicial - tipo pré-selecionado ao abrir
 * @param {("entrada"|"venda"|"consumo"|"transferencia")[]} tipos - quais botões de tipo mostrar
 * @param {() => void} onClose
 * @param {(produto: object, dados: {tipo: string, quantidade: number, pessoa: string, obs: string}) => Promise<boolean>} onSubmit
 *   Registra a movimentação (Supabase + estado global). Retorna se deu certo — só fecha o modal em caso de sucesso.
 */
export default function ModalMovimentacao({ open, produto, tipoInicial = "entrada", tipos = ["entrada", "venda", "consumo"], onClose, onSubmit }) {
  const [tipoMov, setTipoMov] = useState(tipoInicial);
  const [quantidade, setQuantidade] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Reseta o formulário quando o modal abre — ajustado durante o render
  // (padrão recomendado pelo React pra isso) em vez de um useEffect.
  const [abertoAntes, setAbertoAntes] = useState(false);
  if (open && !abertoAntes) {
    setAbertoAntes(true);
    setTipoMov(tipoInicial);
    setQuantidade("");
    setPessoa("");
    setObs("");
  } else if (!open && abertoAntes) {
    setAbertoAntes(false);
  }

  // Stepper de quantidade (+/-) — sempre de 1 em 1
  function adjQuantidade(delta) {
    const atual = parseFloat(String(quantidade).replace(",", ".")) || 0;
    const novo = Math.max(0, atual + delta);
    setQuantidade(novo === 0 ? "" : String(novo));
  }

  const excedeCamara = tipoMov === "transferencia"
    && Number(quantidade) > Number(produto?.estoque_atual_camara || 0);

  async function registrar() {
    const qtd = parseFloat(String(quantidade).replace(",", "."));
    if (!qtd || qtd <= 0) return;
    if (excedeCamara) return;
    setSalvando(true);
    const ok = await onSubmit(produto, { tipo: tipoMov, quantidade: qtd, pessoa, obs });
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} align="bottom">
      {produto && (
        <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-sm mx-auto flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-cinza-50">
                <IconeProduto p={produto} size={26} />
                {produto.nome}
              </div>
              <div className="text-[10px] text-cinza-350 mt-0.5">
                Estoque atual: {fmtQtd(produto.estoque_atual, produto.unidade)}
              </div>
            </div>
            <button onClick={onClose}
              className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
              ✕
            </button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Tipo */}
            <div className="flex gap-2">
              {tipos.map(t => (
                <button key={t} onClick={() => setTipoMov(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all
                    ${tipoMov === t ? COR_TIPO[t] : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>

            {/* Quantidade com stepper +/- */}
            <div>
              <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                Quantidade ({produto.unidade})
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  onClick={() => adjQuantidade(-1)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-lg font-bold shrink-0">
                  −
                </button>
                <input
                  type="number" inputMode="decimal" min="0" step="1"
                  value={quantidade} onChange={e => setQuantidade(e.target.value)}
                  placeholder="0" autoFocus
                  className={`flex-1 text-center bg-cinza-850 border rounded-xl px-3 py-2.5 text-sm font-semibold text-cinza-50 placeholder-cinza-350 outline-none transition-colors
                    ${excedeCamara ? "border-red-500/60 focus:border-red-500" : "border-cinza-700 focus:border-roxo-700"}`}
                />
                <button
                  onClick={() => adjQuantidade(1)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-lg font-bold shrink-0">
                  +
                </button>
              </div>
              {tipoMov === "transferencia" && (
                <div className={`mt-1.5 text-[10px] ${excedeCamara ? "text-red-400" : "text-cinza-350"}`}>
                  Disponível na câmara: {fmtQtd(produto.estoque_atual_camara, produto.unidade)}
                </div>
              )}
            </div>

            {/* Pessoa — só para consumo */}
            {tipoMov === "consumo" && (
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Pessoa</label>
                <input
                  type="text" value={pessoa} onChange={e => setPessoa(e.target.value)}
                  placeholder="Nome (opcional)"
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors"
                />
              </div>
            )}

            {/* Observação */}
            <div>
              <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Observação</label>
              <input
                type="text" value={obs} onChange={e => setObs(e.target.value)}
                placeholder="Opcional"
                className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors"
              />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-cinza-800 flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
              Cancelar
            </button>
            <button onClick={registrar} disabled={salvando || !quantidade || Number(quantidade) <= 0 || excedeCamara}
              className="flex-1 py-2 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
              {salvando ? "Salvando..." : "Registrar"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
