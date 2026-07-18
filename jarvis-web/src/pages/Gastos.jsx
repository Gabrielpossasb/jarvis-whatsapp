import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useHeader } from "../contexts/HeaderContext";

const MESES_ORDEM = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const JARVIS_URL = import.meta.env.VITE_JARVIS_URL || "https://web-production-f30e8.up.railway.app";
const fmt = v => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const CORES_CAT = {
  "Assinaturas": "#6c5fff", "Cartão/Fatura": "#f87171",
  "Dívidas/Empréstimo": "#fb923c", "Transporte": "#34d399",
  "Alimentação": "#fbbf24", "Relacionamento": "#f472b6",
  "Presentes": "#a78bfa", "Cuidados Pessoais": "#38bdf8",
  "Saúde": "#4ade80", "Outros": "#94a3b8",
  "Salário": "#10b981", "Freela": "#06b6d4",
  "iFood (Entrega)": "#84cc16", "Transferência recebida": "#22d3ee",
  "Outros ganhos": "#a3e635",
};

const CAT_ABREV = {
  "Dívidas/Empréstimo": "Dívidas",
  "Cuidados Pessoais": "Cuidados",
  "Cartão/Fatura": "Cartão",
  "Transferência recebida": "Transferência",
  "iFood (Entrega)": "iFood Ent.",
  "Outros ganhos": "Outros G.",
};

const CATS_GASTO = [
  "Alimentação","Assinaturas","Cartão/Fatura","Cuidados Pessoais",
  "Dívidas/Empréstimo","Outros","Presentes","Relacionamento","Saúde","Transporte"
];
const CATS_GANHO = ["Salário","Freela","iFood (Entrega)","Transferência recebida","Outros ganhos"];
const TODAS_CATS = [...CATS_GASTO, ...CATS_GANHO];

// ── Célula de categoria editável ──────────────────────────────────
function CatCell({ gasto, onUpdate }) {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const selectRef = useRef();

  useEffect(() => { if (editando && selectRef.current) selectRef.current.focus(); }, [editando]);

  async function salvar(novacat) {
    if (novacat === gasto.categoria) { setEditando(false); return; }
    setSalvando(true);
    await supabase.from("gastos").update({ categoria: novacat }).eq("id", gasto.id);
    onUpdate(gasto.id, "categoria", novacat);
    setSalvando(false);
    setEditando(false);
  }

  if (editando) {
    const opcoes = gasto.natureza === "ganho" ? CATS_GANHO : CATS_GASTO;
    return (
      <select ref={selectRef} defaultValue={gasto.categoria}
        onChange={e => salvar(e.target.value)}
        onBlur={() => setEditando(false)}
        className="text-[10px] px-1.5 py-0.5 rounded border border-[#6c5fff] bg-[#1a1a28] text-[#e8e8f0] outline-none w-full cursor-pointer"
        style={{ maxWidth: 90 }}>
        {opcoes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }

  return (
    <span onClick={() => setEditando(true)} title={`${gasto.categoria} — clique para editar`}
      className="text-[10px] px-1.5 py-0.5 rounded w-fit max-w-full truncate cursor-pointer hover:opacity-70 transition-opacity"
      style={{ background: `${CORES_CAT[gasto.categoria] || "#6c5fff"}20`, color: CORES_CAT[gasto.categoria] || "#6c5fff" }}>
      {salvando ? "..." : (CAT_ABREV[gasto.categoria] || gasto.categoria)}
    </span>
  );
}

// ── Célula de tipo editável ───────────────────────────────────────
function TipoCell({ gasto, onUpdate }) {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const selectRef = useRef();

  useEffect(() => { if (editando && selectRef.current) selectRef.current.focus(); }, [editando]);

  async function salvar(novo) {
    if (novo === gasto.tipo) { setEditando(false); return; }
    setSalvando(true);
    await supabase.from("gastos").update({ tipo: novo }).eq("id", gasto.id);
    onUpdate(gasto.id, "tipo", novo);
    setSalvando(false);
    setEditando(false);
  }

  if (editando) {
    return (
      <select ref={selectRef} defaultValue={gasto.tipo}
        onChange={e => salvar(e.target.value)}
        onBlur={() => setEditando(false)}
        className="text-[10px] px-1.5 py-0.5 rounded border border-[#6c5fff] bg-[#1a1a28] text-[#e8e8f0] outline-none cursor-pointer">
        <option value="fixa">Fixa</option>
        <option value="variavel">Variável</option>
      </select>
    );
  }

  return (
    <span onClick={() => setEditando(true)} title="Clique para editar"
      className={`text-[10px] px-1.5 py-0.5 rounded w-fit cursor-pointer hover:opacity-70 transition-opacity
        ${gasto.tipo === "fixa" ? "bg-orange-400/10 text-orange-400" : "bg-violet-400/10 text-violet-400"}`}>
      {salvando ? "..." : gasto.tipo === "fixa" ? "Fixa" : "Var."}
    </span>
  );
}

export default function Gastos() {
  const { setCfg } = useHeader();
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [catFiltro, setCatFiltro] = useState("Todas");
  const [meioFiltro, setMeioFiltro] = useState("Todos");
  const [mesSel, setMesSel] = useState("");
  const [mesesComDados, setMesesComDados] = useState(new Set());
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  const [naturezaFiltro, setNaturezaFiltro] = useState("Todos");

  const [modalExtrato, setModalExtrato] = useState(false);
  const [extratoLoading, setExtratoLoading] = useState(false);
  const [extratoResultado, setExtratoResultado] = useState(null);
  const [selecionadas, setSelecionadas] = useState({});
  const [selecionadasDup, setSelecionadasDup] = useState({});
  const [confirmando, setConfirmando] = useState(false);
  const [extratoTexto, setExtratoTexto] = useState("");
  const [extratoArquivo, setExtratoArquivo] = useState(null);
  const fileRef = useRef();

  useEffect(() => { carregarMeses(); }, []);
  useEffect(() => { if (mesSel) carregar(); }, [mesSel]);

  async function carregarMeses(definirSel = true) {
    const { data } = await supabase.from("gastos").select("mes");
    const comDados = new Set((data || []).map(g => g.mes).filter(Boolean));
    setMesesComDados(comDados);
    if (definirSel) {
      const mesAtual = MESES_ORDEM[new Date().getMonth()];
      const ordenados = MESES_ORDEM.filter(m => comDados.has(m));
      setMesSel(ordenados[ordenados.length - 1] || mesAtual);
    }
  }

  async function carregar() {
    setLoading(true);
    const { data } = await supabase.from("gastos").select("*").eq("mes", mesSel).order("data");
    setGastos(data || []);
    setLoading(false);
  }

  async function excluir(id) {
    await supabase.from("gastos").delete().eq("id", id);
    setGastos(g => g.filter(x => x.id !== id));
  }

  function atualizarCampo(id, campo, valor) {
    setGastos(g => g.map(x => x.id === id ? { ...x, [campo]: valor } : x));
  }

  async function analisarExtrato() {
    if (!extratoArquivo) return;
    setExtratoLoading(true);
    setExtratoResultado(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(extratoArquivo);
      });
      const response = await fetch(`${JARVIS_URL}/api/extrato/analisar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimetype: extratoArquivo.type, contexto: extratoTexto }),
      });
      const data = await response.json();
      if (data.erro) throw new Error(data.erro);
      setExtratoResultado(data);
      const sel = {};
      data.novas.forEach((_, i) => { sel[i] = true; });
      setSelecionadas(sel);
    } catch (err) {
      showToast("Erro ao analisar extrato: " + err.message, "error");
    }
    setExtratoLoading(false);
  }

  function fecharModalExtrato() {
    setModalExtrato(false);
    setExtratoResultado(null);
    setExtratoTexto("");
    setExtratoArquivo(null);
    setSelecionadasDup({});
  }

  async function confirmarExtrato() {
    if (!extratoResultado) return;
    setConfirmando(true);
    const dupsSelecionadas = extratoResultado.duplicatas.filter((_, i) => selecionadasDup[i]);
    const paraAdicionar = [
      ...extratoResultado.novas.filter((_, i) => selecionadas[i]),
      ...dupsSelecionadas,
    ];
    if (paraAdicionar.length === 0) { showToast("Selecione pelo menos uma transação.", "error"); setConfirmando(false); return; }
    try {
      const response = await fetch(`${JARVIS_URL}/api/extrato/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transacoes: paraAdicionar }),
      });
      const data = await response.json();
      if (data.erro) throw new Error(data.erro);

      const mesImportado = paraAdicionar[0]?.mes;
      setModalExtrato(false);
      setExtratoResultado(null);

      // Atualiza quais meses têm dados agora
      await carregarMeses(false);

      // Navega para o mês recém-importado
      if (mesImportado && mesImportado !== mesSel) {
        setMesSel(mesImportado); // useEffect dispara carregar()
      } else {
        await carregar();
      }

      showToast(`${data.adicionados} gastos adicionados com sucesso!`);
    } catch (err) {
      showToast("Erro ao confirmar: " + err.message, "error");
    }
    setConfirmando(false);
  }

  const categorias = ["Todas", ...new Set(gastos.map(g => g.categoria).filter(Boolean))].sort();
  const meios = ["Todos", ...new Set(gastos.map(g => g.meio_pagamento).filter(Boolean))];

  const somenteGastos = gastos.filter(g => (g.natureza || "gasto") === "gasto");
  const somenteGanhos = gastos.filter(g => g.natureza === "ganho");

  const filtrados = gastos.filter(g => {
    if (naturezaFiltro === "Gastos" && (g.natureza || "gasto") !== "gasto") return false;
    if (naturezaFiltro === "Ganhos" && g.natureza !== "ganho") return false;
    if (tipoFiltro === "Fixa" && g.tipo !== "fixa") return false;
    if (tipoFiltro === "Variável" && g.tipo !== "variavel") return false;
    if (catFiltro !== "Todas" && g.categoria !== catFiltro) return false;
    if (meioFiltro !== "Todos" && g.meio_pagamento !== meioFiltro) return false;
    return true;
  });

  const total = filtrados.reduce((s, g) => s + Number(g.valor || 0), 0);
  const totalGanhos = somenteGanhos.reduce((s, g) => s + Number(g.valor || 0), 0);
  const gastosNubank = somenteGastos.filter(g => g.meio_pagamento === "Nubank").reduce((s, g) => s + Number(g.valor || 0), 0);
  const gastosMercadoPago = somenteGastos.filter(g => g.meio_pagamento === "Mercado Pago").reduce((s, g) => s + Number(g.valor || 0), 0);

  useEffect(() => {
    setCfg({
      title: "Lançamentos",
      subtitle: `${filtrados.length} lançamentos · ${mesSel}`,
      right: (
        <button onClick={() => setModalExtrato(true)}
          className="flex items-center gap-2 px-4 py-1.5 bg-[#6c5fff] hover:bg-[#7c6fff] rounded-lg text-xs font-semibold text-white transition-colors shrink-0">
          📤 Importar extrato
        </button>
      ),
      secondRow: (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {MESES_ORDEM.map(m => (
            <button key={m} onClick={() => setMesSel(m)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all shrink-0
                ${mesSel === m
                  ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]"
                  : mesesComDados.has(m)
                    ? "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"
                    : "border-[#1a1a24] text-[#2a2a3a] hover:border-[#2a2a3e] hover:text-[#4a4a6a]"
                }`}>
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
      ),
    });
  }, [filtrados.length, mesSel, mesesComDados]); // eslint-disable-line react-hooks/exhaustive-deps

  const FiltroBtn = ({ ativo, onClick, children }) => (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap
        ${ativo ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]" : "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"}`}>
      {children}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Cards */}
        {(() => {
          const saldoNubank = totalGanhos - gastosNubank;
          const cards = [
            { label: "Ganhos", sub: "Nubank", valor: fmt(totalGanhos), cor: "text-emerald-400", border: "border-emerald-500/20", icon: "💚" },
            { label: "Gastos", sub: "Nubank", valor: fmt(gastosNubank), cor: "text-violet-400", border: "border-violet-500/20", icon: "💜" },
            { label: "Fatura", sub: "Mercado Pago", valor: fmt(gastosMercadoPago), cor: "text-yellow-400", border: "border-yellow-500/20", icon: "🟡" },
            { label: "Saldo", sub: "Nubank", valor: fmt(saldoNubank), cor: saldoNubank >= 0 ? "text-emerald-400" : "text-red-400", border: saldoNubank >= 0 ? "border-emerald-500/20" : "border-red-500/20", icon: saldoNubank >= 0 ? "✅" : "⚠️" },
          ];
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {cards.map((c, i) => (
                <div key={i} className={`bg-[#13131e] border ${c.border} rounded-xl p-3 md:p-4`}>
                  <div className="text-[10px] text-[#4a4a6a] mb-0.5">{c.icon} {c.label}</div>
                  <div className="text-[9px] text-[#3a3a5a] mb-2">{c.sub}</div>
                  <div className={`font-mono text-base md:text-xl font-medium ${c.cor}`}>{c.valor}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Filtros */}
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[naturezaFiltro, ...["Todos","Gastos","Ganhos"].filter(f => f !== naturezaFiltro)].map(f => (
              <FiltroBtn key={f} ativo={naturezaFiltro === f} onClick={() => setNaturezaFiltro(f)}>{f}</FiltroBtn>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[tipoFiltro, ...["Todos","Fixa","Variável"].filter(f => f !== tipoFiltro)].map(f => (
              <FiltroBtn key={f} ativo={tipoFiltro === f} onClick={() => setTipoFiltro(f)}>{f}</FiltroBtn>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[catFiltro, ...categorias.filter(c => c !== catFiltro)].map(c => (
              <FiltroBtn key={c} ativo={catFiltro === c} onClick={() => setCatFiltro(c)}>
                {c !== "Todas" ? (CAT_ABREV[c] || c) : c}
              </FiltroBtn>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[meioFiltro, ...meios.filter(m => m !== meioFiltro)].map(m => (
              <FiltroBtn key={m} ativo={meioFiltro === m} onClick={() => setMeioFiltro(m)}>
                {m === "Nubank" ? "💜 Nubank" : m === "Mercado Pago" ? "🟡 Mercado Pago" : m}
              </FiltroBtn>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-[#4a4a6a] mb-3">💡 Clique na categoria ou tipo para editar</div>

        {loading ? (
          <div className="text-center text-[#4a4a6a] py-10 text-sm">Carregando...</div>
        ) : (
          <div className="bg-[#13131e] border border-[#1e1e2e] rounded-xl overflow-hidden">
            <div className="hidden md:grid px-4 py-2.5 border-b border-[#1e1e2e] text-[10px] text-[#4a4a6a] tracking-wider"
              style={{ gridTemplateColumns: "60px 1fr 95px 110px 90px 60px 24px" }}>
              <span>DATA</span><span>DESCRIÇÃO</span><span>VALOR</span><span>PAGAMENTO</span><span>CATEGORIA</span><span>TIPO</span><span />
            </div>

            {filtrados.length === 0 ? (
              <div className="text-center text-[#4a4a6a] py-10 text-sm">Nenhum gasto encontrado ✨</div>
            ) : filtrados.map((g, i) => (
              <div key={g.id}>
                {/* Desktop */}
                <div className={`hidden md:grid items-center px-4 py-3 hover:bg-[#1a1a28] transition-colors gap-2 ${i < filtrados.length - 1 ? "border-b border-[#1a1a24]" : ""}`}
                  style={{ gridTemplateColumns: "60px 1fr 95px 110px 90px 60px 24px" }}>
                  <span className="font-mono text-xs text-[#6a6a8a]">{g.data}</span>
                  <span className="text-[#d8d8f0] font-medium truncate pr-1 text-sm">{g.descricao}</span>
                  <span className={`font-mono text-xs font-semibold ${g.natureza === "ganho" ? "text-emerald-400" : "text-red-400"}`}>{g.natureza === "ganho" ? "+" : ""}{fmt(g.valor)}</span>
                  <span className="text-xs text-[#8a8aaa] truncate">
                    {g.meio_pagamento === "Nubank" ? "💜 Nubank" : "🟡 Mercado Pago"}
                  </span>
                  <CatCell gasto={g} onUpdate={atualizarCampo} />
                  <TipoCell gasto={g} onUpdate={atualizarCampo} />
                  <button onClick={() => excluir(g.id)} className="text-[#3a3a50] hover:text-red-400 transition-colors text-xs">✕</button>
                </div>

                {/* Mobile */}
                <div className={`md:hidden px-4 py-3 flex gap-3 items-start hover:bg-[#1a1a28] transition-colors ${i < filtrados.length - 1 ? "border-b border-[#1a1a24]" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[#d8d8f0] truncate">{g.descricao}</span>
                      <span className={`font-mono text-sm font-semibold shrink-0 ${g.natureza === "ganho" ? "text-emerald-400" : "text-red-400"}`}>{g.natureza === "ganho" ? "+" : ""}{fmt(g.valor)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="font-mono text-[10px] text-[#6a6a8a]">{g.data}</span>
                      <span className="text-[10px] text-[#8a8aaa]">{g.meio_pagamento === "Nubank" ? "💜" : "🟡"} {g.meio_pagamento}</span>
                      <CatCell gasto={g} onUpdate={atualizarCampo} />
                      <TipoCell gasto={g} onUpdate={atualizarCampo} />
                    </div>
                  </div>
                  <button onClick={() => excluir(g.id)} className="text-[#3a3a50] hover:text-red-400 transition-colors text-xs mt-1">✕</button>
                </div>
              </div>
            ))}

            {filtrados.length > 0 && (
              <div className="px-4 py-3 border-t border-[#2a2a3e] flex justify-between items-center">
                <span className="text-xs text-[#4a4a6a]">{filtrados.length} itens</span>
                <span className={`font-mono text-sm font-semibold ${naturezaFiltro === "Ganhos" ? "text-emerald-400" : "text-red-400"}`}>{fmt(total)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all animate-fade-in
          ${toast.type === "error" ? "bg-red-500" : "bg-emerald-500"}`}>
          <span>{toast.type === "error" ? "✕" : "✓"}</span>
          {toast.message}
        </div>
      )}

      {/* Modal extrato */}
      {modalExtrato && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
              <div>
                <div className="font-semibold">Importar Extrato</div>
                <div className="text-xs text-[#4a4a6a] mt-0.5">Anexe o PDF ou foto e descreva o contexto</div>
              </div>
              <button onClick={fecharModalExtrato}
                className="text-[#6a6a8a] hover:text-[#e8e8f0] transition-colors text-lg">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {!extratoResultado ? (
                <div className="flex flex-col gap-4">
                  {/* Chip do arquivo selecionado */}
                  {extratoArquivo && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#6c5fff15] border border-[#6c5fff40] rounded-xl w-fit max-w-full">
                      <span className="text-sm">{extratoArquivo.type.includes("pdf") ? "📄" : "🖼️"}</span>
                      <span className="text-xs text-[#a78bfa] truncate max-w-[260px]">{extratoArquivo.name}</span>
                      <button onClick={() => { setExtratoArquivo(null); fileRef.current.value = ""; }}
                        className="text-[#6a6a8a] hover:text-red-400 transition-colors text-xs ml-1">✕</button>
                    </div>
                  )}

                  {/* Input de texto + botão de anexo */}
                  <div className="flex items-end gap-2 bg-[#0e0e18] border border-[#2a2a3e] rounded-xl px-4 py-3 focus-within:border-[#6c5fff] transition-colors">
                    <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden"
                      onChange={e => e.target.files[0] && setExtratoArquivo(e.target.files[0])} />
                    <textarea
                      value={extratoTexto}
                      onChange={e => setExtratoTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && extratoArquivo) { e.preventDefault(); analisarExtrato(); } }}
                      placeholder="Ex: fatura de junho, Nubank..."
                      rows={2}
                      className="flex-1 bg-transparent text-sm text-[#e8e8f0] placeholder-[#4a4a6a] outline-none resize-none"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => fileRef.current?.click()}
                        title="Anexar arquivo"
                        className="text-[#4a4a6a] hover:text-[#a78bfa] transition-colors text-lg">
                        📎
                      </button>
                      <button
                        onClick={analisarExtrato}
                        disabled={!extratoArquivo || extratoLoading}
                        className="px-4 py-1.5 bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-xs font-semibold text-white transition-colors">
                        {extratoLoading ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block" />
                            Analisando...
                          </span>
                        ) : "Analisar →"}
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-[#3a3a5a]">PDF ou imagem · Nubank ou Mercado Pago · Enter para analisar</div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {extratoResultado.novas.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs text-[#4a4a6a] tracking-wider">✅ {extratoResultado.novas.length} NOVAS TRANSAÇÕES</div>
                        <button onClick={() => {
                          const allSel = Object.values(selecionadas).every(v => v);
                          const novo = {};
                          extratoResultado.novas.forEach((_, i) => { novo[i] = !allSel; });
                          setSelecionadas(novo);
                        }} className="text-xs text-[#6c5fff] hover:text-[#a78bfa]">
                          {Object.values(selecionadas).every(v => v) ? "Desmarcar todas" : "Selecionar todas"}
                        </button>
                      </div>
                      <div className="flex flex-col gap-2">
                        {extratoResultado.novas.map((t, i) => {
                          const isGanho = t.natureza === "ganho";
                          return (
                            <div key={i} onClick={() => setSelecionadas(s => ({ ...s, [i]: !s[i] }))}
                              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                                ${selecionadas[i]
                                  ? isGanho ? "border-emerald-500 bg-emerald-500/10" : "border-[#6c5fff] bg-[#6c5fff10]"
                                  : "border-[#1e1e2e] hover:border-[#3a3a50]"}`}>
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0
                                ${selecionadas[i]
                                  ? isGanho ? "border-emerald-500 bg-emerald-500" : "border-[#6c5fff] bg-[#6c5fff]"
                                  : "border-[#3a3a50]"}`}>
                                {selecionadas[i] && <span className="text-[10px] text-white font-bold">✓</span>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {isGanho && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">GANHO</span>}
                                  <span className="text-sm font-medium text-[#d8d8f0] truncate">{t.descricao}</span>
                                </div>
                                <div className="text-xs text-[#6a6a8a] mt-0.5">{t.data} · {t.meio_pagamento === "Nubank" ? "💜" : "🟡"} {t.meio_pagamento}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className={`font-mono text-sm font-semibold ${isGanho ? "text-emerald-400" : "text-red-400"}`}>{isGanho ? "+" : ""}{fmt(t.valor)}</div>
                                <div className="text-[10px] px-1.5 py-0.5 rounded mt-1"
                                  style={{ background: `${CORES_CAT[t.categoria] || "#6c5fff"}20`, color: CORES_CAT[t.categoria] || "#6c5fff" }}>
                                  {t.categoria}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {extratoResultado.duplicatas.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs text-[#4a4a6a] tracking-wider">⚠️ {extratoResultado.duplicatas.length} POSSÍVEIS DUPLICATAS</div>
                        <span className="text-[10px] text-[#4a4a6a]">clique para incluir mesmo assim</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {extratoResultado.duplicatas.map((t, i) => (
                          <div key={i} onClick={() => setSelecionadasDup(s => ({ ...s, [i]: !s[i] }))}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                              ${selecionadasDup[i] ? "border-amber-500 bg-amber-500/10 opacity-100" : "border-[#1e1e2e] opacity-50 hover:opacity-75"}`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0
                              ${selecionadasDup[i] ? "border-amber-500 bg-amber-500" : "border-red-400"}`}>
                              {selecionadasDup[i] && <span className="text-[10px] text-white font-bold">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-[#d8d8f0] truncate">{t.descricao}</div>
                              <div className="text-xs text-[#6a6a8a] mt-0.5">{t.data} · {t.meio_pagamento === "Nubank" ? "💜" : "🟡"} {t.meio_pagamento}</div>
                            </div>
                            <span className="font-mono text-sm text-red-400">{fmt(t.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {extratoResultado && (
              <div className="px-6 py-4 border-t border-[#1e1e2e] flex items-center justify-between">
                <div className="text-xs text-[#6a6a8a]">
                  {Object.values(selecionadas).filter(v => v).length + Object.values(selecionadasDup).filter(v => v).length} selecionadas ·{" "}
                  {fmt([
                    ...extratoResultado.novas.filter((_, i) => selecionadas[i]),
                    ...extratoResultado.duplicatas.filter((_, i) => selecionadasDup[i]),
                  ].reduce((s, t) => s + t.valor, 0))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setExtratoResultado(null); setSelecionadas({}); setSelecionadasDup({}); setExtratoArquivo(null); setExtratoTexto(""); if (fileRef.current) fileRef.current.value = ""; }}
                    className="px-4 py-2 text-xs text-[#6a6a8a] hover:text-[#e8e8f0] transition-colors">Voltar</button>
                  <button onClick={confirmarExtrato} disabled={confirmando}
                    className="px-5 py-2 bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
                    {confirmando ? "Adicionando..." : `Adicionar ${Object.values(selecionadas).filter(v => v).length} gastos`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
