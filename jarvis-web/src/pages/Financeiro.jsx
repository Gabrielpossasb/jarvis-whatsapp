import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const MESES_ORDEM = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const CORES_CAT = {
  "Assinaturas":        "#6c5fff",
  "Cartão/Fatura":      "#f87171",
  "Dívidas/Empréstimo": "#fb923c",
  "Transporte":         "#34d399",
  "Alimentação":        "#fbbf24",
  "Relacionamento":     "#f472b6",
  "Presentes":          "#a78bfa",
  "Cuidados Pessoais":  "#38bdf8",
  "Saúde":              "#4ade80",
  "Outros":             "#94a3b8",
};

const fmt = v => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

function MiniBar({ valor, total, cor }) {
  const pct = total > 0 ? Math.min((valor / total) * 100, 100) : 0;
  return (
    <div className="w-full bg-[#1e1e2e] rounded-full h-1.5 mt-1">
      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: cor }} />
    </div>
  );
}

// ── Relatório Anual ──────────────────────────────────────────────
function RelatorioAnual({ todosMeses }) {
  const resumo = MESES_ORDEM.map(mes => {
    const gastosMes = todosMeses.filter(g => g.mes === mes);
    const fixas = gastosMes.filter(g => g.tipo === "fixa").reduce((s, g) => s + Number(g.valor || 0), 0);
    const variaveis = gastosMes.filter(g => g.tipo === "variavel").reduce((s, g) => s + Number(g.valor || 0), 0);
    return { mes, fixas, variaveis, total: fixas + variaveis };
  });

  const totalAnual = resumo.reduce((s, m) => s + m.total, 0);
  const totalFixas = resumo.reduce((s, m) => s + m.fixas, 0);
  const totalVariaveis = resumo.reduce((s, m) => s + m.variaveis, 0);
  const maxTotal = Math.max(...resumo.map(m => m.total), 1);
  const mesesComDados = resumo.filter(m => m.total > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Cards anuais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total do Ano", valor: fmt(totalAnual), cor: "text-red-400", icon: "💸" },
          { label: "Total Fixas", valor: fmt(totalFixas), cor: "text-orange-400", icon: "📌" },
          { label: "Total Variáveis", valor: fmt(totalVariaveis), cor: "text-violet-400", icon: "🛒" },
        ].map((c, i) => (
          <div key={i} className="bg-[#13131e] border border-[#1e1e2e] rounded-xl p-4">
            <div className="text-xs text-[#4a4a6a] mb-2">{c.icon} {c.label}</div>
            <div className={`font-mono text-xl font-semibold ${c.cor}`}>{c.valor}</div>
          </div>
        ))}
      </div>

      {/* Gráfico de barras anual */}
      <div className="bg-[#13131e] border border-[#1e1e2e] rounded-xl p-5">
        <div className="text-xs text-[#4a4a6a] tracking-wider mb-5">DESPESAS POR MÊS</div>
        <div className="flex items-end gap-2 h-36">
          {resumo.map(({ mes, fixas, variaveis, total }) => {
            const altTotal = total > 0 ? (total / maxTotal) * 100 : 0;
            const altFixas = total > 0 ? (fixas / maxTotal) * 100 : 0;
            const altVar = total > 0 ? (variaveis / maxTotal) * 100 : 0;
            const temDados = total > 0;
            return (
              <div key={mes} className="flex-1 flex flex-col items-center gap-1 group relative">
                {/* Tooltip */}
                {temDados && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#2a2a3e] border border-[#3a3a50] rounded-lg px-3 py-2 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    <div className="font-semibold text-[#e8e8f0] mb-1">{mes}</div>
                    <div className="text-orange-400">Fixas: {fmt(fixas)}</div>
                    <div className="text-violet-400">Variáveis: {fmt(variaveis)}</div>
                    <div className="text-red-400 font-semibold">Total: {fmt(total)}</div>
                  </div>
                )}
                <div className="w-full flex flex-col justify-end" style={{ height: "100px" }}>
                  {temDados ? (
                    <div className="w-full rounded-t overflow-hidden" style={{ height: `${altTotal}%` }}>
                      <div className="w-full bg-orange-400/70" style={{ height: `${(fixas/total)*100}%` }} />
                      <div className="w-full bg-violet-400/70" style={{ height: `${(variaveis/total)*100}%` }} />
                    </div>
                  ) : (
                    <div className="w-full h-1 bg-[#2a2a3e] rounded" />
                  )}
                </div>
                <span className="text-[9px] text-[#4a4a6a]">{mes.slice(0,3)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs text-[#8a8aaa]">
            <div className="w-3 h-3 rounded-sm bg-orange-400/70" /> Fixas
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#8a8aaa]">
            <div className="w-3 h-3 rounded-sm bg-violet-400/70" /> Variáveis
          </div>
        </div>
      </div>

      {/* Tabela resumo anual */}
      <div className="bg-[#13131e] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="grid px-4 py-2.5 border-b border-[#1e1e2e] text-[10px] text-[#4a4a6a] tracking-wider"
          style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <span>MÊS</span><span>FIXAS</span><span>VARIÁVEIS</span><span>TOTAL</span>
        </div>
        {resumo.map((m, i) => (
          <div key={m.mes}
            className={`grid px-4 py-3 text-sm transition-colors ${m.total > 0 ? "hover:bg-[#1a1a28]" : "opacity-30"} ${i < resumo.length - 1 ? "border-b border-[#1a1a24]" : ""}`}
            style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <span className={m.total > 0 ? "text-[#d8d8f0] font-medium" : "text-[#4a4a6a]"}>{m.mes}</span>
            <span className="font-mono text-xs text-orange-400">{m.fixas > 0 ? fmt(m.fixas) : "—"}</span>
            <span className="font-mono text-xs text-violet-400">{m.variaveis > 0 ? fmt(m.variaveis) : "—"}</span>
            <span className="font-mono text-xs text-red-400 font-semibold">{m.total > 0 ? fmt(m.total) : "—"}</span>
          </div>
        ))}
        <div className="grid px-4 py-3 border-t border-[#2a2a3e] text-sm font-semibold"
          style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <span className="text-[#8a8aaa]">TOTAL</span>
          <span className="font-mono text-orange-400">{fmt(totalFixas)}</span>
          <span className="font-mono text-violet-400">{fmt(totalVariaveis)}</span>
          <span className="font-mono text-red-400">{fmt(totalAnual)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Relatório Mensal ─────────────────────────────────────────────
function RelatorioMensal({ gastos, mes }) {
  const [abaTabela, setAbaTabela] = useState("fixas");

  const fixas    = gastos.filter(g => g.tipo === "fixa");
  const variaveis = gastos.filter(g => g.tipo === "variavel");
  const totalFixas     = fixas.reduce((s, g) => s + Number(g.valor || 0), 0);
  const totalVariaveis = variaveis.reduce((s, g) => s + Number(g.valor || 0), 0);
  const totalGeral     = totalFixas + totalVariaveis;

  const porCategoria = gastos.reduce((acc, g) => {
    const cat = g.categoria || "Outros";
    acc[cat] = (acc[cat] || 0) + Number(g.valor || 0);
    return acc;
  }, {});
  const catOrdenadas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);

  const porMeio = gastos.reduce((acc, g) => {
    const meio = g.meio_pagamento || "Outro";
    acc[meio] = (acc[meio] || 0) + Number(g.valor || 0);
    return acc;
  }, {});

  const tabela = abaTabela === "fixas" ? fixas : variaveis;

  if (gastos.length === 0) {
    return <div className="text-center text-[#4a4a6a] py-10 text-sm">Nenhum dado para {mes} ✨</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total do Mês", valor: fmt(totalGeral), cor: "text-red-400", sub: `${gastos.length} lançamentos`, icon: "💸" },
          { label: "Despesas Fixas", valor: fmt(totalFixas), cor: "text-orange-400", sub: `${fixas.length} itens`, icon: "📌" },
          { label: "Despesas Variáveis", valor: fmt(totalVariaveis), cor: "text-violet-400", sub: `${variaveis.length} itens`, icon: "🛒" },
        ].map((c, i) => (
          <div key={i} className="bg-[#13131e] border border-[#1e1e2e] rounded-xl p-4">
            <div className="text-xs text-[#4a4a6a] mb-2">{c.icon} {c.label}</div>
            <div className={`font-mono text-xl font-semibold ${c.cor}`}>{c.valor}</div>
            <div className="text-xs text-[#4a4a6a] mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Por categoria */}
        <div className="bg-[#13131e] border border-[#1e1e2e] rounded-xl p-4">
          <div className="text-xs text-[#4a4a6a] tracking-wider mb-4">GASTO POR CATEGORIA</div>
          <div className="flex flex-col gap-3">
            {catOrdenadas.map(([cat, val]) => (
              <div key={cat}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-[#c8c8e0]">{cat}</span>
                  <span className="font-mono text-[#8a8aaa]">{fmt(val)}</span>
                </div>
                <MiniBar valor={val} total={totalGeral} cor={CORES_CAT[cat] || "#6c5fff"} />
              </div>
            ))}
          </div>
        </div>

        {/* Por meio */}
        <div className="bg-[#13131e] border border-[#1e1e2e] rounded-xl p-4">
          <div className="text-xs text-[#4a4a6a] tracking-wider mb-4">POR MEIO DE PAGAMENTO</div>
          <div className="flex flex-col gap-4">
            {Object.entries(porMeio).map(([meio, val]) => {
              const pct = totalGeral > 0 ? ((val / totalGeral) * 100).toFixed(1) : 0;
              const cor = meio === "Nubank" ? "#a78bfa" : "#fbbf24";
              return (
                <div key={meio}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">{meio === "Nubank" ? "💜" : "🟡"} {meio}</span>
                    <div className="text-right">
                      <div className="font-mono text-sm" style={{ color: cor }}>{fmt(val)}</div>
                      <div className="text-xs text-[#4a4a6a]">{pct}%</div>
                    </div>
                  </div>
                  <MiniBar valor={val} total={totalGeral} cor={cor} />
                </div>
              );
            })}
          </div>
          <div className="mt-6 pt-4 border-t border-[#1e1e2e] grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-xs text-[#4a4a6a] mb-1">Fixas</div>
              <div className="font-mono text-sm text-orange-400">{fmt(totalFixas)}</div>
              <div className="text-xs text-[#4a4a6a]">{totalGeral > 0 ? ((totalFixas/totalGeral)*100).toFixed(1) : 0}%</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-[#4a4a6a] mb-1">Variáveis</div>
              <div className="font-mono text-sm text-violet-400">{fmt(totalVariaveis)}</div>
              <div className="text-xs text-[#4a4a6a]">{totalGeral > 0 ? ((totalVariaveis/totalGeral)*100).toFixed(1) : 0}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-[#13131e] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="flex border-b border-[#1e1e2e]">
          {[
            { id: "fixas", label: `Fixas (${fixas.length})` },
            { id: "variaveis", label: `Variáveis (${variaveis.length})` },
          ].map(a => (
            <button key={a.id} onClick={() => setAbaTabela(a.id)}
              className={`px-5 py-3 text-xs font-medium border-b-2 transition-all
                ${abaTabela === a.id ? "border-[#6c5fff] text-[#a78bfa]" : "border-transparent text-[#6a6a8a] hover:text-[#9a9ab8]"}`}>
              {a.label}
            </button>
          ))}
          <div className="ml-auto px-4 flex items-center">
            <span className="font-mono text-sm text-[#8a8aaa]">
              {fmt(abaTabela === "fixas" ? totalFixas : totalVariaveis)}
            </span>
          </div>
        </div>
        <div className="grid px-4 py-2.5 border-b border-[#1e1e2e] text-[10px] text-[#4a4a6a] tracking-wider"
          style={{ gridTemplateColumns: "70px 1fr 110px 140px 120px" }}>
          <span>DATA</span><span>DESCRIÇÃO</span><span>VALOR</span><span>PAGAMENTO</span><span>CATEGORIA</span>
        </div>
        {tabela.map((g, i) => (
          <div key={g.id}
            className={`grid items-center px-4 py-3 text-sm hover:bg-[#1a1a28] transition-colors ${i < tabela.length - 1 ? "border-b border-[#1a1a24]" : ""}`}
            style={{ gridTemplateColumns: "70px 1fr 110px 140px 120px" }}>
            <span className="font-mono text-xs text-[#6a6a8a]">{g.data}</span>
            <span className="text-[#d8d8f0] font-medium truncate pr-2">{g.descricao}</span>
            <span className="font-mono text-red-400 font-semibold">{fmt(g.valor)}</span>
            <span className="text-xs text-[#8a8aaa]">{g.meio_pagamento === "Nubank" ? "💜 Nubank" : "🟡 Mercado Pago"}</span>
            <span className="text-xs px-2 py-0.5 rounded w-fit"
              style={{ background: `${CORES_CAT[g.categoria] || "#6c5fff"}20`, color: CORES_CAT[g.categoria] || "#6c5fff" }}>
              {g.categoria}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────
export default function Financeiro() {
  const [visao, setVisao] = useState("mes"); // "mes" | "ano"
  const [mesSel, setMesSel] = useState("");
  const [gastosMes, setGastosMes] = useState([]);
  const [todosMeses, setTodosMeses] = useState([]);
  const [mesesDisponiveis, setMesesDisponiveis] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregarTudo(); }, []);
  useEffect(() => { if (mesSel && visao === "mes") carregarMes(); }, [mesSel, visao]);

  async function carregarTudo() {
    setLoading(true);
    const { data } = await supabase.from("gastos").select("*").order("mes");
    const todos = data || [];
    setTodosMeses(todos);

    const unicos = [...new Set(todos.map(g => g.mes).filter(Boolean))];
    const ordenados = MESES_ORDEM.filter(m => unicos.includes(m));
    setMesesDisponiveis(ordenados);
    if (ordenados.length > 0) setMesSel(ordenados[ordenados.length - 1]);
    setLoading(false);
  }

  async function carregarMes() {
    const filtrado = todosMeses.filter(g => g.mes === mesSel);
    setGastosMes(filtrado);
  }

  useEffect(() => {
    if (mesSel) setGastosMes(todosMeses.filter(g => g.mes === mesSel));
  }, [mesSel, todosMeses]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1e1e2e]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-base font-semibold">Financeiro</div>
            <div className="text-xs text-[#4a4a6a] mt-0.5">
              {visao === "ano" ? "Relatório anual 2026" : `${gastosMes.length} lançamentos · ${mesSel}`}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Toggle Mês / Ano */}
            <div className="flex rounded-lg border border-[#2a2a3e] overflow-hidden">
              {[{ id: "mes", label: "Mensal" }, { id: "ano", label: "Anual" }].map(v => (
                <button key={v.id} onClick={() => setVisao(v.id)}
                  className={`px-4 py-1.5 text-xs font-medium transition-all
                    ${visao === v.id ? "bg-[#6c5fff] text-white" : "text-[#6a6a8a] hover:text-[#9a9ab8]"}`}>
                  {v.label}
                </button>
              ))}
            </div>

            {/* Seletor de mês (só no mensal) */}
            {visao === "mes" && (
              <div className="flex gap-2 flex-wrap">
                {mesesDisponiveis.map(m => (
                  <button key={m} onClick={() => setMesSel(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                      ${mesSel === m ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]" : "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"}`}>
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="text-center text-[#4a4a6a] py-10 text-sm">Carregando...</div>
        ) : visao === "ano" ? (
          <RelatorioAnual todosMeses={todosMeses} />
        ) : (
          <RelatorioMensal gastos={gastosMes} mes={mesSel} />
        )}
      </div>
    </div>
  );
}
