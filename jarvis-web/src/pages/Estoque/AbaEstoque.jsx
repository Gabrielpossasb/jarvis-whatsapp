import ProdutoCard from "./ProdutoCard";

/**
 * Aba "📦 Estoque": grade de produtos agrupada por categoria.
 *
 * @param {{cat: string, itens: object[]}[]} porCategoria - produtos já agrupados por categoria (só categorias com itens)
 * @param {(produto: object) => void} onVender
 * @param {(produto: object) => void} onEditar
 */
export default function AbaEstoque({ porCategoria, onVender, onEditar }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
      {porCategoria.map(({ cat, itens }) => (
        <div key={cat} className="mb-6">
          <div className="text-[10px] text-cinza-350 tracking-widest font-medium px-1 mb-2 uppercase">
            {cat}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {itens.map(p => (
              <ProdutoCard key={p.id} produto={p} onVender={onVender} onEditar={onEditar} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
