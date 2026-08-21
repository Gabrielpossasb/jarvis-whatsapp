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
 * @param {string} className - alternativa ao `size` para tamanho responsivo
 *   (ex: "w-9 h-9 sm:w-11 sm:h-11 text-[34px] sm:text-[44px]"). Quando
 *   passado, o estilo inline é omitido — inline venceria as classes do
 *   Tailwind e o breakpoint nunca pegaria.
 */
export default function IconeProduto({ p, size = 20, className = "" }) {
  const estilo = className ? undefined : { width: size, height: size };

  if (p?.icone_url) {
    return (
      <img src={p.icone_url} alt="" style={estilo}
        className={`rounded-lg object-cover shrink-0 ${className}`} />
    );
  }
  return (
    <span className={`leading-none shrink-0 ${className}`}
      style={className ? undefined : { fontSize: size }}>
      {p?.emoji || EMOJI_PADRAO}
    </span>
  );
}
