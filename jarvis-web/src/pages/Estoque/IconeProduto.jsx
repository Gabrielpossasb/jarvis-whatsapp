import { EMOJI_PADRAO } from "./format";

/**
 * Mostra a imagem enviada pra um produto (icone_url), com o emoji como
 * fallback quando não há imagem, e o emoji padrão (🍹) quando nenhum dos
 * dois foi definido. Usado em todo card/lista/modal que precisa
 * identificar visualmente um sabor, pra não duplicar essa checagem em
 * cada lugar.
 *
 * @param {object} p - produto (ou objeto parcial com { emoji, icone_url })
 * @param {number} size - tamanho em px do ícone (imagem ou emoji)
 */
export default function IconeProduto({ p, size = 20 }) {
  if (p?.icone_url) {
    return (
      <img src={p.icone_url} alt="" className="rounded-lg object-cover shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="leading-none shrink-0" style={{ fontSize: size }}>
      {p?.emoji || EMOJI_PADRAO}
    </span>
  );
}
