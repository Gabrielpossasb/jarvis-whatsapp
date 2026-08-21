// Parser das listas coladas nos modais ("Produto — 5 kg", uma por linha).
// Compartilhado por ModalContagem e ModalGerenciar: os dois aceitam o mesmo
// formato, que é como as listas chegam pelo WhatsApp.

// Aceita "—", "–" e "-" como separador porque o teclado do celular troca o
// hífen por travessão sozinho, e a lista quase sempre vem colada de lá.
const LINHA_RE = /^(.+?)\s*[—–-]+\s*([\d,.]+)\s*(kg|un)?\s*$/i;

export function normNome(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** "Abacaxi — 5 kg\nMorango — 3" → [{ nome, quantidade }]. Linhas que não
 *  casam com o formato são ignoradas em silêncio (cabeçalho, saudação). */
export function parsearTexto(texto) {
  return texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).flatMap(linha => {
    const m = linha.match(LINHA_RE);
    if (!m) return [];
    const qtd = parseFloat(m[2].replace(",", "."));
    if (isNaN(qtd) || qtd < 0) return [];
    return [{ nome: m[1].trim(), quantidade: qtd }];
  });
}

/** Casa cada item pelo nome contra os produtos cadastrados: exato primeiro,
 *  depois "contém" nos dois sentidos. `produto` fica null quando não acha. */
export function resolverProdutosTexto(itens, produtos) {
  return itens.map(item => {
    const n = normNome(item.nome);
    const produto = produtos.find(p => normNome(p.nome) === n)
      || produtos.find(p => normNome(p.nome).includes(n))
      || produtos.find(p => n.includes(normNome(p.nome)));
    return { ...item, produto: produto || null };
  });
}
