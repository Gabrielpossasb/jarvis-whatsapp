import Modal from "../../components/Modal";
import { gerarTextoFaltantes } from "./format";

/**
 * Modal "🧊 Pedido": mostra a lista de faltantes já formatada (ver
 * gerarTextoFaltantes em ./format.js) e um botão pra copiar direto pra
 * área de transferência.
 *
 * @param {boolean} open
 * @param {object[]} produtos
 * @param {() => void} onClose
 * @param {(msg: string, ok?: boolean) => void} showToast
 */
export default function ModalFaltantes({ open, produtos, onClose, showToast }) {
  const texto = gerarTextoFaltantes(produtos);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      showToast("Copiado! Cole no WhatsApp");
    } catch {
      showToast("Não deu pra copiar automaticamente", false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} align="bottom">
      <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-sm mx-auto flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800 shrink-0">
          <span className="text-sm font-semibold text-cinza-50">🧊 Pedido</span>
          <button onClick={onClose}
            className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap font-sans text-xs text-cinza-50 bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-3 leading-relaxed">
            {texto}
          </pre>
        </div>

        <div className="px-5 py-4 border-t border-cinza-800 shrink-0 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
            Fechar
          </button>
          <button onClick={copiar}
            className="flex-1 py-2 bg-roxo-700 hover:bg-roxo-600 rounded-lg text-xs font-semibold text-white transition-colors">
            📋 Copiar
          </button>
        </div>
      </div>
    </Modal>
  );
}
