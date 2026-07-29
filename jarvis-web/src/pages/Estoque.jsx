import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useHeader } from "../contexts/HeaderContext";

const CATEGORIAS = ["Polpas", "Frutas", "Outros", "Açaí em pote"];
const fmtQtd = (v, u) =>
  `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${u}`;
const fmtMoeda = v =>
  v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null;
const fmtData = s =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const TIPO_LABEL = { entrada: "Entrada", venda: "Venda", consumo: "Consumo", contagem: "Contagem" };
const TIPO_SINAL = { entrada: "+", venda: "−", consumo: "−", contagem: "=" };
const TIPO_BADGE = {
  entrada: "bg-emerald-500/15 text-emerald-400",
  venda: "bg-red-500/15 text-red-400",
  consumo: "bg-amber-500/15 text-amber-400",
  contagem: "bg-sky-500/15 text-sky-400",
};

export default function Estoque() {
  const { setCfg } = useHeader();
  const [produtos, setProdutos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [aba, setAba] = useState("estoque");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { tipo:'mov'|'editar', produto }
  const [filtroMov, setFiltroMov] = useState("todos");
  const [toast, setToast] = useState(null);
  const [modoContagem, setModoContagem] = useState(false);
  const [contagens, setContagens] = useState({}); // { [produto_id]: string }
  const [salvandoContagem, setSalvandoContagem] = useState(false);

  // Estado do modal de movimentação
  const [tipoMov, setTipoMov] = useState("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Estado do modal de edição
  const [editNome, setEditNome] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editPreco, setEditPreco] = useState("");

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function carregarProdutos() {
    const { data } = await supabase
      .from("estoque_produtos")
      .select("*")
      .eq("ativo", true)
      .order("nome");
    if (data) setProdutos(data);
  }

  async function carregarMovs() {
    const { data } = await supabase
      .from("estoque_movimentacoes")
      .select("*, produto:produto_id(nome, unidade)")
      .order("criado_em", { ascending: false })
      .limit(300);
    if (data) setMovs(data);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([carregarProdutos(), carregarMovs()]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const alertas = produtos.filter(p => Number(p.estoque_atual) < Number(p.estoque_minimo)).length;
    const totalKg = produtos
      .filter(p => p.unidade === "kg")
      .reduce((s, p) => s + Number(p.estoque_atual), 0);
    setCfg({
      title: "Estoque",
      subtitle: alertas > 0
        ? `${totalKg.toFixed(1)} kg · ⚠️ ${alertas} abaixo do mínimo`
        : `${totalKg.toFixed(1)} kg · tudo ok`,
      right: (
        <button onClick={() => { setContagens({}); setModoContagem(true); }}
          className="text-xs px-3 py-1 rounded-full bg-[#1a1a28] border border-[#2a2a3e] text-[#6a6a8a] hover:border-[#6c5fff] hover:text-[#a78bfa] transition-colors whitespace-nowrap">
          📋 Contagem
        </button>
      ),
      secondRow: (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[["estoque", "📦 Estoque"], ["historico", "📋 Histórico"]].map(([a, l]) => (
            <button key={a} onClick={() => setAba(a)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all shrink-0
                ${aba === a
                  ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]"
                  : "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"}`}>
              {l}
            </button>
          ))}
        </div>
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, aba]);

  function abrirMov(produto, tipo = "entrada") {
    setTipoMov(tipo);
    setQuantidade("");
    setPessoa("");
    setObs("");
    setModal({ tipo: "mov", produto });
  }

  function abrirEditar(produto) {
    setEditNome(produto.nome);
    setEditMin(String(produto.estoque_minimo));
    setEditPreco(produto.preco != null ? String(produto.preco) : "");
    setModal({ tipo: "editar", produto });
  }

  async function registrarMovimentacao() {
    const qtd = parseFloat(quantidade.replace(",", "."));
    if (!qtd || qtd <= 0) return;
    setSalvando(true);
    const p = modal.produto;
    const delta = tipoMov === "entrada" ? qtd : -qtd;
    const novoEstoque = Math.max(0, Number(p.estoque_atual) + delta);

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("estoque_movimentacoes").insert({
        produto_id: p.id,
        tipo: tipoMov,
        quantidade: qtd,
        pessoa: tipoMov === "consumo" ? (pessoa.trim() || null) : null,
        observacao: obs.trim() || null,
      }),
      supabase.from("estoque_produtos").update({ estoque_atual: novoEstoque }).eq("id", p.id),
    ]);

    if (e1 || e2) {
      showToast("Erro ao registrar", false);
    } else {
      setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, estoque_atual: novoEstoque } : x));
      setMovs(prev => [{
        id: `tmp-${Date.now()}`,
        produto_id: p.id,
        tipo: tipoMov,
        quantidade: qtd,
        pessoa: tipoMov === "consumo" ? (pessoa.trim() || null) : null,
        observacao: obs.trim() || null,
        criado_em: new Date().toISOString(),
        produto: { nome: p.nome, unidade: p.unidade },
      }, ...prev]);
      showToast(tipoMov === "entrada"
        ? `+${fmtQtd(qtd, p.unidade)} adicionado`
        : `−${fmtQtd(qtd, p.unidade)} registrado`);
      setModal(null);
    }
    setSalvando(false);
  }

  async function salvarEdicao() {
    setSalvando(true);
    const p = modal.produto;
    const updates = {
      nome: editNome.trim() || p.nome,
      estoque_minimo: parseFloat(String(editMin).replace(",", ".")) || 0,
      preco: editPreco ? parseFloat(String(editPreco).replace(",", ".")) : null,
    };
    const { error } = await supabase.from("estoque_produtos").update(updates).eq("id", p.id);
    if (error) {
      showToast("Erro ao salvar", false);
    } else {
      setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, ...updates } : x));
      showToast("Produto atualizado");
      setModal(null);
    }
    setSalvando(false);
  }

  async function salvarContagem() {
    const alterados = produtos.filter(p => {
      const v = contagens[p.id];
      if (v === undefined || v === "") return false;
      return parseFloat(String(v).replace(",", ".")) !== Number(p.estoque_atual);
    });
    if (alterados.length === 0) { setModoContagem(false); return; }

    setSalvandoContagem(true);
    const agora = new Date().toISOString();

    const insertsMovs = alterados.map(p => {
      const novoVal = parseFloat(String(contagens[p.id]).replace(",", "."));
      return {
        produto_id: p.id,
        tipo: "contagem",
        quantidade: novoVal,
        observacao: `era ${fmtQtd(p.estoque_atual, p.unidade)} → agora ${fmtQtd(novoVal, p.unidade)}`,
        criado_em: agora,
      };
    });

    const { error: e1 } = await supabase.from("estoque_movimentacoes").insert(insertsMovs);

    if (!e1) {
      await Promise.all(alterados.map(p => {
        const novoVal = parseFloat(String(contagens[p.id]).replace(",", "."));
        return supabase.from("estoque_produtos").update({ estoque_atual: novoVal }).eq("id", p.id);
      }));

      setProdutos(prev => prev.map(p => {
        const v = contagens[p.id];
        if (v === undefined || v === "") return p;
        const novoVal = parseFloat(String(v).replace(",", "."));
        if (novoVal === Number(p.estoque_atual)) return p;
        return { ...p, estoque_atual: novoVal };
      }));

      setMovs(prev => [
        ...insertsMovs.map((m, i) => ({
          ...m,
          id: `tmp-cont-${Date.now()}-${i}`,
          produto: { nome: alterados[i].nome, unidade: alterados[i].unidade },
        })),
        ...prev,
      ]);

      showToast(`${alterados.length} produto${alterados.length > 1 ? "s" : ""} atualizado${alterados.length > 1 ? "s" : ""}`);
    } else {
      showToast("Erro ao salvar contagem", false);
    }

    setSalvandoContagem(false);
    setModoContagem(false);
    setContagens({});
  }

  const porCategoria = CATEGORIAS.map(cat => ({
    cat,
    itens: produtos.filter(p => p.categoria === cat),
  })).filter(g => g.itens.length > 0);

  const movsFiltradas = filtroMov === "todos" ? movs : movs.filter(m => m.tipo === filtroMov);

  return (
    <div className="flex flex-col h-full">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-xl text-sm font-medium shadow-xl pointer-events-none
          ${toast.ok ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#4a4a6a] text-sm">
          Carregando...
        </div>
      ) : aba === "estoque" ? (

        /* ── Aba Estoque ──────────────────────────── */
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {porCategoria.map(({ cat, itens }) => (
            <div key={cat} className="mb-6">
              <div className="text-[10px] text-[#4a4a6a] tracking-widest font-medium px-1 mb-2 uppercase">
                {cat}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {itens.map(p => {
                  const atual = Number(p.estoque_atual);
                  const minimo = Number(p.estoque_minimo);
                  const abaixo = atual < minimo;
                  const pct = minimo > 0 ? Math.min(100, (atual / minimo) * 100) : 100;
                  return (
                    <div key={p.id}
                      className={`bg-[#13131e] border rounded-xl p-3 flex flex-col gap-2
                        ${abaixo ? "border-red-500/40" : "border-[#1e1e2e]"}`}>

                      {/* Nome + botão editar */}
                      <div className="flex items-start justify-between gap-1 min-h-[32px]">
                        <span className="text-[11px] font-medium text-[#e8e8f0] leading-tight">
                          {abaixo && <span className="text-red-400 mr-0.5">⚠</span>}
                          {p.nome}
                        </span>
                        <button onClick={() => abrirEditar(p)}
                          className="text-[#3a3a5a] hover:text-[#a78bfa] transition-colors shrink-0 mt-0.5 leading-none">
                          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                            <path d="M11.5 1.5a1.5 1.5 0 0 1 2.12 2.12l-8.5 8.5-2.83.71.71-2.83 8.5-8.5z"/>
                          </svg>
                        </button>
                      </div>

                      {/* Estoque atual */}
                      <div>
                        <div className={`text-base font-bold leading-tight ${abaixo ? "text-red-400" : "text-[#a78bfa]"}`}>
                          {fmtQtd(atual, p.unidade)}
                        </div>
                        <div className="text-[10px] text-[#4a4a6a] mt-0.5">mín {fmtQtd(minimo, p.unidade)}</div>
                      </div>

                      {/* Barra de progresso */}
                      <div className="w-full h-1 rounded-full bg-[#2a2a3e] overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${abaixo ? "bg-red-500" : "bg-[#6c5fff]"}`}
                          style={{ width: `${pct}%` }} />
                      </div>

                      {/* Preço */}
                      {fmtMoeda(p.preco) && (
                        <div className="text-[10px] text-[#5a5a7a]">{fmtMoeda(p.preco)}/{p.unidade}</div>
                      )}

                      {/* Botões de ação */}
                      <div className="flex gap-1 mt-auto pt-1">
                        <button onClick={() => abrirMov(p, "entrada")}
                          title="Entrada de estoque"
                          className="flex-1 py-1.5 rounded-lg text-[10px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                          +
                        </button>
                        <button onClick={() => abrirMov(p, "venda")}
                          title="Registrar venda"
                          className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                          Venda
                        </button>
                        <button onClick={() => abrirMov(p, "consumo")}
                          title="Consumo interno"
                          className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
                          ☕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      ) : (

        /* ── Aba Histórico ────────────────────────── */
        <div className="flex flex-col h-full overflow-hidden">
          {/* Filtros */}
          <div className="px-4 md:px-6 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
            {["todos", "entrada", "venda", "consumo", "contagem"].map(t => (
              <button key={t} onClick={() => setFiltroMov(t)}
                className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
                  ${filtroMov === t
                    ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]"
                    : "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"}`}>
                {t === "todos" ? "Todos" : TIPO_LABEL[t]}
              </button>
            ))}
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
            {movsFiltradas.length === 0 ? (
              <div className="text-center text-[#4a4a6a] text-sm py-10">Nenhuma movimentação</div>
            ) : (
              <div className="bg-[#13131e] border border-[#1e1e2e] rounded-xl overflow-hidden">
                {movsFiltradas.map((m, i) => (
                  <div key={m.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a28] transition-colors
                      ${i < movsFiltradas.length - 1 ? "border-b border-[#1a1a24]" : ""}`}>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${TIPO_BADGE[m.tipo]}`}>
                      {TIPO_LABEL[m.tipo]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[#e8e8f0] truncate">
                        {m.produto?.nome || "—"}
                        {m.pessoa && (
                          <span className="text-[#6a6a8a] ml-1.5">· {m.pessoa}</span>
                        )}
                      </div>
                      {m.observacao && (
                        <div className="text-[10px] text-[#4a4a6a] truncate mt-0.5">{m.observacao}</div>
                      )}
                    </div>
                    <div className={`text-xs font-semibold shrink-0
                      ${m.tipo === "entrada" ? "text-emerald-400"
                        : m.tipo === "contagem" ? "text-sky-400"
                        : "text-red-400"}`}>
                      {TIPO_SINAL[m.tipo]}{fmtQtd(m.quantidade, m.produto?.unidade || "")}
                    </div>
                    <div className="text-[10px] text-[#4a4a6a] shrink-0 hidden sm:block">
                      {fmtData(m.criado_em)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Overlay de Contagem de Estoque ──────────── */}
      {modoContagem && (
        <div className="fixed inset-0 bg-[#0f0f13] z-40 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e] shrink-0">
            <div>
              <div className="text-sm font-semibold text-[#e8e8f0]">Contagem de Estoque</div>
              <div className="text-[10px] text-[#4a4a6a] mt-0.5">
                Digite a quantidade real de cada produto
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setModoContagem(false); setContagens({}); }}
                className="px-3 py-1.5 rounded-lg text-xs border border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50] transition-colors">
                Cancelar
              </button>
              <button onClick={salvarContagem} disabled={salvandoContagem}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-50 text-white transition-colors">
                {salvandoContagem ? "Salvando..." : "Salvar Contagem"}
              </button>
            </div>
          </div>

          {/* Resumo de alterações */}
          {Object.keys(contagens).some(id => {
            const p = produtos.find(x => x.id === id);
            if (!p || contagens[id] === "") return false;
            return parseFloat(String(contagens[id]).replace(",", ".")) !== Number(p.estoque_atual);
          }) && (
            <div className="px-4 py-2 bg-sky-500/10 border-b border-sky-500/20 shrink-0">
              <span className="text-[11px] text-sky-400">
                {Object.keys(contagens).filter(id => {
                  const p = produtos.find(x => x.id === id);
                  if (!p || contagens[id] === "") return false;
                  return parseFloat(String(contagens[id]).replace(",", ".")) !== Number(p.estoque_atual);
                }).length} produto(s) com valor diferente do atual
              </span>
            </div>
          )}

          {/* Lista de produtos */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3">
            {porCategoria.map(({ cat, itens }) => (
              <div key={cat} className="mb-5">
                <div className="text-[10px] text-[#4a4a6a] tracking-widest font-medium px-1 mb-2 uppercase">
                  {cat}
                </div>
                <div className="bg-[#13131e] border border-[#1e1e2e] rounded-xl overflow-hidden">
                  {itens.map((p, i) => {
                    const val = contagens[p.id] ?? "";
                    const novoVal = val !== "" ? parseFloat(String(val).replace(",", ".")) : null;
                    const mudou = novoVal !== null && novoVal !== Number(p.estoque_atual);
                    return (
                      <div key={p.id}
                        className={`flex items-center gap-3 px-4 py-2.5 transition-colors
                          ${mudou ? "bg-sky-500/5" : ""}
                          ${i < itens.length - 1 ? "border-b border-[#1a1a24]" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#e8e8f0] truncate">{p.nome}</div>
                          <div className="text-[10px] text-[#4a4a6a] mt-0.5">
                            atual: {fmtQtd(p.estoque_atual, p.unidade)}
                            {mudou && (
                              <span className={`ml-2 font-medium ${novoVal > Number(p.estoque_atual) ? "text-emerald-400" : "text-red-400"}`}>
                                → {fmtQtd(novoVal, p.unidade)}
                                {novoVal > Number(p.estoque_atual)
                                  ? ` (+${(novoVal - Number(p.estoque_atual)).toLocaleString("pt-BR", { minimumFractionDigits: 1 })})`
                                  : ` (${(novoVal - Number(p.estoque_atual)).toLocaleString("pt-BR", { minimumFractionDigits: 1 })})`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number" inputMode="decimal" min="0" step="0.1"
                            value={val}
                            onChange={e => setContagens(prev => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder={String(Number(p.estoque_atual).toLocaleString("pt-BR", { minimumFractionDigits: 1 }))}
                            className={`w-20 text-right bg-[#1a1a28] border rounded-lg px-2 py-1.5 text-xs text-[#e8e8f0] placeholder-[#3a3a5a] outline-none transition-colors
                              ${mudou ? "border-sky-500/60 focus:border-sky-400" : "border-[#2a2a3e] focus:border-[#6c5fff]"}`}
                          />
                          <span className="text-[10px] text-[#4a4a6a] w-4">{p.unidade}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal de movimentação ─────────────────── */}
      {modal?.tipo === "mov" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
              <div>
                <div className="text-sm font-semibold text-[#e8e8f0]">{modal.produto.nome}</div>
                <div className="text-[10px] text-[#4a4a6a] mt-0.5">
                  Estoque atual: {fmtQtd(modal.produto.estoque_atual, modal.produto.unidade)}
                </div>
              </div>
              <button onClick={() => setModal(null)}
                className="text-[#6a6a8a] hover:text-[#e8e8f0] transition-colors text-xl leading-none">
                ✕
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Tipo */}
              <div className="flex gap-2">
                {["entrada", "venda", "consumo"].map(t => (
                  <button key={t} onClick={() => setTipoMov(t)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all
                      ${tipoMov === t
                        ? t === "entrada" ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                          : t === "venda" ? "border-red-500 bg-red-500/15 text-red-400"
                          : "border-amber-500 bg-amber-500/15 text-amber-400"
                        : "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"}`}>
                    {TIPO_LABEL[t]}
                  </button>
                ))}
              </div>

              {/* Quantidade */}
              <div>
                <label className="text-[10px] text-[#6a6a8a] uppercase tracking-wider">
                  Quantidade ({modal.produto.unidade})
                </label>
                <input
                  type="number" inputMode="decimal" min="0" step="0.1"
                  value={quantidade} onChange={e => setQuantidade(e.target.value)}
                  placeholder="0,0" autoFocus
                  className="mt-1.5 w-full bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-3 py-2.5 text-sm text-[#e8e8f0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5fff] transition-colors"
                />
              </div>

              {/* Pessoa — só para consumo */}
              {tipoMov === "consumo" && (
                <div>
                  <label className="text-[10px] text-[#6a6a8a] uppercase tracking-wider">Pessoa</label>
                  <input
                    type="text" value={pessoa} onChange={e => setPessoa(e.target.value)}
                    placeholder="Nome (opcional)"
                    className="mt-1.5 w-full bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-3 py-2.5 text-sm text-[#e8e8f0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5fff] transition-colors"
                  />
                </div>
              )}

              {/* Observação */}
              <div>
                <label className="text-[10px] text-[#6a6a8a] uppercase tracking-wider">Observação</label>
                <input
                  type="text" value={obs} onChange={e => setObs(e.target.value)}
                  placeholder="Opcional"
                  className="mt-1.5 w-full bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-3 py-2.5 text-sm text-[#e8e8f0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5fff] transition-colors"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#1e1e2e] flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50] transition-colors">
                Cancelar
              </button>
              <button onClick={registrarMovimentacao} disabled={salvando || !quantidade || Number(quantidade) <= 0}
                className="flex-1 py-2 bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
                {salvando ? "Salvando..." : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de edição ──────────────────────── */}
      {modal?.tipo === "editar" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
              <span className="text-sm font-semibold text-[#e8e8f0]">Editar produto</span>
              <button onClick={() => setModal(null)}
                className="text-[#6a6a8a] hover:text-[#e8e8f0] transition-colors text-xl leading-none">
                ✕
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <div>
                <label className="text-[10px] text-[#6a6a8a] uppercase tracking-wider">Nome</label>
                <input type="text" value={editNome} onChange={e => setEditNome(e.target.value)}
                  className="mt-1.5 w-full bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-3 py-2.5 text-sm text-[#e8e8f0] outline-none focus:border-[#6c5fff] transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-[#6a6a8a] uppercase tracking-wider">
                  Estoque mínimo ({modal.produto.unidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.5"
                  value={editMin} onChange={e => setEditMin(e.target.value)}
                  className="mt-1.5 w-full bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-3 py-2.5 text-sm text-[#e8e8f0] outline-none focus:border-[#6c5fff] transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-[#6a6a8a] uppercase tracking-wider">
                  Preço de venda (R$/{modal.produto.unidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.01"
                  value={editPreco} onChange={e => setEditPreco(e.target.value)}
                  placeholder="Não definido"
                  className="mt-1.5 w-full bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-3 py-2.5 text-sm text-[#e8e8f0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5fff] transition-colors" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#1e1e2e] flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50] transition-colors">
                Cancelar
              </button>
              <button onClick={salvarEdicao} disabled={salvando}
                className="flex-1 py-2 bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
