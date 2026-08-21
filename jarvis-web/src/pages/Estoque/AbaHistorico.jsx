import { useState } from "react";
import IconeProduto from "./IconeProduto";
import { fmtQtd, fmtData, TIPO_LABEL, TIPO_LABEL_CURTO, TIPO_SINAL, TIPO_BADGE } from "./format";

const TIPOS = ["entrada", "venda", "consumo", "transferencia", "contagem"];
const LOCAIS = [
  { v: "todos", label: "Todos" },
  { v: "freezer", label: "🧊 Freezer" },
  { v: "camara_fria", label: "❄️ Câmara fria" },
];
const LOCAL_ICONE = { freezer: "🧊", camara_fria: "❄️" };

// Agrupa em um único item de "lote" as linhas de uma mesma contagem —
// insertsMovs (index.jsx) grava todas com o mesmo `criado_em` e `local`,
// então elas sempre aparecem consecutivas na lista (já vem ordenada por
// criado_em desc do Supabase). Compacta pra não ocupar uma linha inteira
// por produto contado de uma vez só.
function agruparContagens(movs) {
  const grupos = [];
  for (const m of movs) {
    if (m.tipo === "contagem") {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.lote && ultimo.criado_em === m.criado_em && ultimo.local === m.local) {
        ultimo.itens.push(m);
        continue;
      }
      grupos.push({ lote: true, id: `lote-${m.criado_em}-${m.local}`, criado_em: m.criado_em, local: m.local, itens: [m] });
      continue;
    }
    grupos.push(m);
  }
  return grupos;
}

/**
 * Aba "📋 Histórico": filtro por local (freezer/câmara fria) + filtro por
 * tipo de movimentação (multi-seleção, ex: entrada e venda juntos) sobre a
 * lista cronológica (mais recente primeiro) de tudo que já foi registrado.
 * Independente do toggle de local da aba "Estoque" — o histórico sempre
 * mostra tudo por padrão, filtrando só quando o usuário pede.
 *
 * @param {object[]} movs - todas as movimentações (sem filtro)
 */
export default function AbaHistorico({ movs }) {
  const [filtroLocal, setFiltroLocal] = useState("todos");
  const [tiposAtivos, setTiposAtivos] = useState(new Set()); // vazio = todos os tipos

  function toggleTipo(t) {
    setTiposAtivos(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  // Transferência aparece no histórico dos dois locais (mexe nos dois
  // estoques); os demais tipos só aparecem no histórico do local em que
  // aconteceram.
  const movsFiltradas = movs.filter(m => {
    const passaLocal = filtroLocal === "todos" || m.local === filtroLocal || m.tipo === "transferencia";
    const passaTipo = tiposAtivos.size === 0 || tiposAtivos.has(m.tipo);
    return passaLocal && passaTipo;
  });

  const grupos = agruparContagens(movsFiltradas);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 md:px-6 pt-3 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {LOCAIS.map(l => (
          <button key={l.v} onClick={() => setFiltroLocal(l.v)}
            className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
              ${filtroLocal === l.v
                ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="px-4 md:px-6 pt-2 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        <button onClick={() => setTiposAtivos(new Set())}
          className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
            ${tiposAtivos.size === 0
              ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
              : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
          Todos
        </button>
        {TIPOS.map(t => (
          <button key={t} onClick={() => toggleTipo(t)}
            className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
              ${tiposAtivos.has(t)
                ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
            {TIPO_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
        {grupos.length === 0 ? (
          <div className="text-center text-cinza-350 text-sm py-10">Nenhuma movimentação</div>
        ) : (
          <div className="bg-cinza-900 border border-cinza-800 rounded-xl overflow-hidden">
            {grupos.map((g, i) => {
              const borda = i < grupos.length - 1 ? "border-b border-cinza-850" : "";

              if (g.lote) {
                return (
                  <div key={g.id} className={`px-4 py-3 hover:bg-cinza-850 transition-colors ${borda}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${TIPO_BADGE.contagem}`}>
                        {TIPO_LABEL.contagem}
                      </span>
                      <span className="text-xs text-cinza-350 shrink-0">{LOCAL_ICONE[g.local]}</span>
                      <span className="text-[10px] text-cinza-350">{g.itens.length} produto(s)</span>
                      <span className="text-[10px] text-cinza-350 ml-auto shrink-0">{fmtData(g.criado_em)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.itens.map(m => (
                        <span key={m.id}
                          className="text-[10px] bg-cinza-850 border border-cinza-700 rounded-md px-1.5 py-0.5 text-cinza-200 whitespace-nowrap">
                          {m.produto?.nome || "—"}: {fmtQtd(m.quantidade, m.produto?.unidade || "")}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }

              const m = g;
              return (
                <div key={m.id}
                  className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-cinza-850 transition-colors ${borda}`}>
                  <span className={`text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-medium shrink-0 ${TIPO_BADGE[m.tipo]}`}>
                    <span className="sm:hidden">{TIPO_LABEL_CURTO[m.tipo]}</span>
                    <span className="hidden sm:inline">{TIPO_LABEL[m.tipo]}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-cinza-50 min-w-0">
                      <IconeProduto p={m.produto} size={22} />
                      <span className="truncate">{m.produto?.nome || "—"}</span>
                      {m.pessoa && (
                        <span className="text-cinza-200 truncate">· {m.pessoa}</span>
                      )}
                    </div>
                    {/* A data só aparece na coluna da direita a partir de
                        `sm`; no celular ela vem aqui, senão não haveria
                        como saber quando a movimentação aconteceu. */}
                    <div className="text-[10px] text-cinza-350 truncate mt-0.5">
                      <span className="sm:hidden">{fmtData(m.criado_em)}</span>
                      {m.observacao && <span className="sm:hidden"> · </span>}
                      {m.observacao}
                    </div>
                  </div>
                  <span className="text-xs text-cinza-350 shrink-0" title={m.local}>
                    {m.tipo === "transferencia" ? "🔄" : LOCAL_ICONE[m.local] || ""}
                  </span>
                  <div className={`text-xs font-semibold shrink-0 tabular-nums
                    ${m.tipo === "entrada" ? "text-emerald-400"
                      : m.tipo === "transferencia" ? "text-roxo-400"
                      : m.tipo === "contagem" ? "text-sky-400"
                      : "text-red-400"}`}>
                    {TIPO_SINAL[m.tipo]}{fmtQtd(m.quantidade, m.produto?.unidade || "")}
                  </div>
                  <div className="text-[10px] text-cinza-350 shrink-0 hidden sm:block">
                    {fmtData(m.criado_em)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
