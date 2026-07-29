import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useHeader } from "../contexts/HeaderContext";

// ─── Horário semanal (estático) ───────────────────────────────────────────────
// dia: 1=Segunda … 6=Sábado  (coincide com Date.getDay() para Seg-Sáb)
const AULAS = [
  { id: 1,  disciplina: "Fundamentos Matemáticos p/ Computação", turma: "T01", professor: "Prof.ª Bianca Namie Sakiyama",  dia: 1, inicio: "18:30", fim: "20:30", local: "Bloco 15 · Sala 11",       cor: "#0891b2" },
  { id: 2,  disciplina: "Engenharia de Software",                 turma: "T01", professor: "Prof.ª Patricia Matsubara",    dia: 2, inicio: "09:35", fim: "11:35", local: "Bloco 15 · Sala 13",       cor: "#2563eb" },
  { id: 3,  disciplina: "Introdução a Sistemas Operacionais",     turma: "T01", professor: "Prof.ª Valeria Reis",          dia: 2, inicio: "15:35", fim: "17:35", local: "Bloco 15 · Sala 06",       cor: "#0d9488" },
  { id: 4,  disciplina: "Análise e Projeto de Software",          turma: "T01", professor: "Prof.ª Maria Machado",         dia: 2, inicio: "18:30", fim: "20:30", local: "Bloco 15 · Sala 12",       cor: "#059669" },
  { id: 5,  disciplina: "Computação e Sociedade",                 turma: "T01", professor: "Prof. Amaury Junior",          dia: 3, inicio: "09:05", fim: "11:05", local: "Bloco 15 · Sala 09",       cor: "#64748b" },
  { id: 6,  disciplina: "Banco de Dados",                         turma: "T01", professor: "Prof.ª Vanessa Araujo Borges", dia: 3, inicio: "09:35", fim: "11:35", local: "Bloco 14 · Auditório 2",   cor: "#7c3aed", livrePresenca: true },
  { id: 7,  disciplina: "Fundamentos Matemáticos p/ Computação", turma: "T01", professor: "Prof.ª Bianca Namie Sakiyama",  dia: 3, inicio: "18:30", fim: "20:30", local: "Bloco 15 · Sala 11",       cor: "#0891b2" },
  { id: 8,  disciplina: "Engenharia de Software",                 turma: "T01", professor: "Prof.ª Patricia Matsubara",    dia: 4, inicio: "09:35", fim: "11:35", local: "Bloco 15 · Sala 13",       cor: "#2563eb" },
  { id: 9,  disciplina: "Ciências do Ambiente",                   turma: "T01", professor: "Prof.ª Janusa Araujo",         dia: 4, inicio: "13:15", fim: "15:15", local: "Bloco 15 · Sala 20",       cor: "#84cc16" },
  { id: 10, disciplina: "Análise e Projeto de Software",          turma: "P02", professor: "Prof.ª Maria Machado",         dia: 4, inicio: "18:30", fim: "20:30", local: "Bloco 14 · Laboratório 8",  cor: "#059669" },
  { id: 11, disciplina: "Banco de Dados",                         turma: "T01", professor: "Prof.ª Vanessa Araujo Borges", dia: 5, inicio: "07:15", fim: "09:15", local: "Bloco 15 · Sala 03",       cor: "#7c3aed" },
  { id: 12, disciplina: "Introdução a Sistemas Operacionais",     turma: "T01", professor: "Prof.ª Valeria Reis",          dia: 5, inicio: "15:35", fim: "17:35", local: "Bloco 15 · Sala 06",       cor: "#0d9488" },
];

const DISCIPLINAS = [...new Set(AULAS.map(a => a.disciplina))].sort();

const DIAS_NOME = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const TIPO_CFG = {
  prova:     { label: "Prova",     badge: "bg-red-500/15 text-red-400",       icon: "📝" },
  atividade: { label: "Atividade", badge: "bg-amber-500/15 text-amber-400",   icon: "📋" },
  ead:       { label: "EAD",       badge: "bg-sky-500/15 text-sky-400",       icon: "💻" },
  aviso:     { label: "Aviso",     badge: "bg-violet-500/15 text-violet-400", icon: "📢" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function semanaDeOffset(off) {
  const hoje = new Date();
  const dow = hoje.getDay();
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1) + off * 7);
  seg.setHours(0, 0, 0, 0);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(seg); d.setDate(seg.getDate() + i); return d;
  });
}

function toISO(d) { return d.toISOString().slice(0, 10); }
function ehHoje(d) { return d.toDateString() === new Date().toDateString(); }
function fmtDMM(s) {
  if (!s) return "";
  const [, m, di] = s.split("-");
  return `${di}/${m}`;
}

const FORM_INICIAL = {
  tipo: "prova", disciplina: "", titulo: "",
  data: new Date().toISOString().slice(0, 10), hora: "", descricao: "",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Faculdade() {
  const { setCfg } = useHeader();
  const [aba, setAba] = useState("semana");
  const [semanaOff, setSemanaOff] = useState(0);
  const [eventos, setEventos] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [mostrarFeitos, setMostrarFeitos] = useState(false);
  const [modal, setModal] = useState(null); // null | "add" | { modo:"view", ev }
  const [form, setForm] = useState(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function carregar() {
    const { data } = await supabase
      .from("faculdade_eventos")
      .select("*")
      .order("data")
      .order("hora", { nullsFirst: true });
    if (data) setEventos(data);
  }

  useEffect(() => {
    (async () => { setLoading(true); await carregar(); setLoading(false); })();
  }, []);

  const dias = useMemo(() => semanaDeOffset(semanaOff), [semanaOff]);

  // ── Header ────────────────────────────────────────────────────────
  useEffect(() => {
    const hISO = toISO(new Date());
    const proximos = eventos.filter(e => !e.concluido && e.data >= hISO);
    const nProvas = proximos.filter(e => e.tipo === "prova").length;
    const sub = proximos.length === 0
      ? "Nenhum evento próximo"
      : `${proximos.length} próximo${proximos.length !== 1 ? "s" : ""}${nProvas > 0 ? ` · 📝 ${nProvas} prova${nProvas !== 1 ? "s" : ""}` : ""}`;

    setCfg({
      title: "Faculdade",
      subtitle: sub,
      right: (
        <button
          onClick={() => { setForm(FORM_INICIAL); setModal("add"); }}
          className="text-xs px-2.5 py-1 rounded-lg bg-[#6c5fff22] border border-[#6c5fff44] text-[#a78bfa] hover:bg-[#6c5fff33] transition-all">
          + Evento
        </button>
      ),
      secondRow: (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[["semana", "📅 Semana"], ["eventos", "📋 Eventos"]].map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all shrink-0
                ${aba === k ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]"
                           : "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"}`}>
              {l}
            </button>
          ))}
        </div>
      ),
    });
  }, [aba, eventos]);

  // ── Aba Semana ─────────────────────────────────────────────────
  const semanaLabel = useMemo(() => {
    const fmt = d => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return `${fmt(dias[0])} – ${fmt(dias[5])}`;
  }, [dias]);

  function aulasNoDia(d) {
    return AULAS.filter(a => a.dia === d.getDay()).sort((a, b) => a.inicio.localeCompare(b.inicio));
  }

  function eventosNaData(iso) {
    return eventos.filter(e => e.data === iso);
  }

  function temEAD(iso, disciplina) {
    return eventos.some(e => e.data === iso && e.tipo === "ead" && (!e.disciplina || e.disciplina === disciplina));
  }

  // ── Aba Eventos ────────────────────────────────────────────────
  const eventosFiltrados = useMemo(() =>
    eventos.filter(e => {
      if (!mostrarFeitos && e.concluido) return false;
      if (filtroTipo !== "todos" && e.tipo !== filtroTipo) return false;
      return true;
    }),
  [eventos, filtroTipo, mostrarFeitos]);

  async function toggleConcluido(ev) {
    const novo = !ev.concluido;
    setEventos(list => list.map(x => x.id === ev.id ? { ...x, concluido: novo } : x));
    await supabase.from("faculdade_eventos").update({ concluido: novo }).eq("id", ev.id);
  }

  async function deletarEvento(id) {
    setEventos(list => list.filter(x => x.id !== id));
    await supabase.from("faculdade_eventos").delete().eq("id", id);
    setModal(null);
    showToast("Evento excluído");
  }

  async function salvarEvento() {
    if (!form.titulo.trim() || !form.data) return;
    setSalvando(true);
    const row = {
      tipo: form.tipo,
      disciplina: form.disciplina || null,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      data: form.data,
      hora: form.hora || null,
      concluido: false,
    };
    const { data, error } = await supabase.from("faculdade_eventos").insert(row).select().single();
    setSalvando(false);
    if (error) { showToast("Erro ao salvar", false); return; }
    setEventos(list =>
      [...list, data].sort((a, b) => a.data.localeCompare(b.data) || (a.hora || "").localeCompare(b.hora || ""))
    );
    setModal(null);
    showToast("Evento adicionado ✓");
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[#6a6a8a] text-sm">Carregando...</div>;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">

        {/* ═══ ABA SEMANA ══════════════════════════════════════════ */}
        {aba === "semana" && (
          <div className="flex flex-col">
            {/* Navegador de semana */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a24]">
              <button onClick={() => setSemanaOff(v => v - 1)}
                className="w-8 h-8 flex items-center justify-center text-[#6a6a8a] hover:text-[#e8e8f0] rounded-lg hover:bg-[#1e1e2e] transition-all text-lg">‹</button>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm text-[#e8e8f0]">{semanaLabel}</span>
                {semanaOff !== 0 && (
                  <button onClick={() => setSemanaOff(0)} className="text-[10px] text-[#6c5fff] hover:text-[#a78bfa]">
                    Semana atual
                  </button>
                )}
              </div>
              <button onClick={() => setSemanaOff(v => v + 1)}
                className="w-8 h-8 flex items-center justify-center text-[#6a6a8a] hover:text-[#e8e8f0] rounded-lg hover:bg-[#1e1e2e] transition-all text-lg">›</button>
            </div>

            {/* Dias */}
            <div className="divide-y divide-[#131320]">
              {dias.map(d => {
                const iso = toISO(d);
                const aulas = aulasNoDia(d);
                const evDia = eventosNaData(iso);
                const hoje = ehHoje(d);
                const dow = d.getDay();

                return (
                  <div key={iso} className={`px-3 pt-3 pb-4 ${hoje ? "bg-[#0f0f18]" : ""}`}>
                    {/* Cabeçalho do dia */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        hoje ? "bg-[#6c5fff] text-white" : "text-[#4a4a6a]"
                      }`}>{DIAS_NOME[dow]}</span>
                      <span className={`text-xs ${hoje ? "text-[#a78bfa]" : "text-[#2a2a3e]"}`}>
                        {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        {hoje ? " · hoje" : ""}
                      </span>
                    </div>

                    {aulas.length === 0 && evDia.length === 0 ? (
                      <div className="text-xs text-[#2a2a38] pl-1">Sem aulas</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {/* Cards de aula */}
                        {aulas.map(a => {
                          const ead = temEAD(iso, a.disciplina);
                          // Eventos desta aula (excluindo EAD — já exibido no badge)
                          const evAula = evDia.filter(e =>
                            e.disciplina === a.disciplina && e.tipo !== "ead"
                          );
                          return (
                            <div key={a.id}
                              className={`bg-[#13131e] rounded-xl p-3 border transition-all ${
                                ead ? "border-sky-500/25" : "border-[#1e1e2e]"
                              }`}
                              style={{ borderLeftColor: a.cor, borderLeftWidth: 3 }}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] text-[#5a5a7a] tabular-nums">{a.inicio} – {a.fim}</div>
                                  <div className="text-sm font-medium text-[#e8e8f0] mt-0.5 leading-snug">{a.disciplina}</div>
                                  <div className="text-[11px] text-[#3a3a56] mt-0.5">{a.local}</div>
                                  <div className="text-[11px] text-[#2e2e48]">{a.professor}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {ead && (
                                    <span className="text-[10px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-full">💻 EAD</span>
                                  )}
                                  {a.livrePresenca && (
                                    <span className="text-[10px] bg-amber-500/10 text-amber-600/60 px-1.5 py-0.5 rounded-full">livre presença</span>
                                  )}
                                </div>
                              </div>
                              {evAula.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {evAula.map(e => (
                                    <button key={e.id} onClick={() => setModal({ modo: "view", ev: e })}
                                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${TIPO_CFG[e.tipo]?.badge ?? ""}`}>
                                      {TIPO_CFG[e.tipo]?.icon} {e.titulo}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Eventos sem disciplina correspondente neste dia */}
                        {evDia
                          .filter(e => {
                            if (e.tipo === "ead") return false;
                            if (!e.disciplina) return true;
                            return !AULAS.some(a => a.disciplina === e.disciplina && a.dia === dow);
                          })
                          .map(e => (
                            <button key={e.id} onClick={() => setModal({ modo: "view", ev: e })}
                              className={`text-left bg-[#13131e] rounded-xl px-3 py-2.5 border border-[#1e1e2e] hover:border-[#2a2a3e] transition-all ${e.concluido ? "opacity-50" : ""}`}>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TIPO_CFG[e.tipo]?.badge ?? ""}`}>
                                  {TIPO_CFG[e.tipo]?.icon} {TIPO_CFG[e.tipo]?.label}
                                </span>
                                <span className="text-sm text-[#e8e8f0] truncate">{e.titulo}</span>
                              </div>
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ ABA EVENTOS ═════════════════════════════════════════ */}
        {aba === "eventos" && (
          <div className="flex flex-col gap-3 px-3 pb-4 pt-3">
            {/* Filtros */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {[["todos", "Todos"], ...Object.entries(TIPO_CFG).map(([k, v]) => [k, `${v.icon} ${v.label}`])].map(([k, l]) => (
                <button key={k} onClick={() => setFiltroTipo(k)}
                  className={`px-3 py-1 rounded-lg text-xs border transition-all shrink-0 ${
                    filtroTipo === k ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]"
                                    : "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"}`}>
                  {l}
                </button>
              ))}
              <button onClick={() => setMostrarFeitos(v => !v)}
                className={`px-3 py-1 rounded-lg text-xs border transition-all shrink-0 ${
                  mostrarFeitos ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]"
                               : "border-[#2a2a3e] text-[#6a6a8a] hover:border-[#3a3a50]"}`}>
                {mostrarFeitos ? "✓ Feitos" : "Feitos"}
              </button>
            </div>

            {eventosFiltrados.length === 0 && (
              <div className="text-center text-[#3a3a50] text-sm py-10">Nenhum evento</div>
            )}

            {eventosFiltrados.map(e => {
              const tc = TIPO_CFG[e.tipo] ?? TIPO_CFG.aviso;
              return (
                <button key={e.id} onClick={() => setModal({ modo: "view", ev: e })}
                  className={`text-left bg-[#13131e] rounded-xl p-3 border border-[#1e1e2e] hover:border-[#2a2a3e] transition-all ${e.concluido ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tc.badge}`}>{tc.icon} {tc.label}</span>
                        {e.disciplina && <span className="text-[10px] text-[#4a4a6a] truncate max-w-[180px]">{e.disciplina}</span>}
                      </div>
                      <div className={`text-sm font-medium text-[#e8e8f0] ${e.concluido ? "line-through" : ""}`}>{e.titulo}</div>
                      {e.descricao && <div className="text-xs text-[#6a6a8a] mt-0.5 line-clamp-1">{e.descricao}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-medium text-[#6a6a8a]">{fmtDMM(e.data)}</div>
                      {e.hora && <div className="text-[11px] text-[#4a4a6a] tabular-nums">{e.hora.slice(0, 5)}</div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ MODAL: VER EVENTO ══════════════════════════════════════ */}
      {modal?.modo === "view" && (() => {
        const e = modal.ev;
        const tc = TIPO_CFG[e.tipo] ?? TIPO_CFG.aviso;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
            <div className="relative z-10 w-full max-w-sm bg-[#13131e] border border-[#2a2a3e] rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tc.badge}`}>{tc.icon} {tc.label}</span>
                  {e.disciplina && <div className="text-xs text-[#6a6a8a] mt-1">{e.disciplina}</div>}
                  <div className="text-base font-semibold text-[#e8e8f0] mt-1 leading-snug">{e.titulo}</div>
                </div>
                <button onClick={() => setModal(null)} className="text-[#4a4a6a] hover:text-[#e8e8f0] text-2xl leading-none shrink-0">×</button>
              </div>

              <div className="flex gap-4 text-xs text-[#6a6a8a]">
                <span>📅 {fmtDMM(e.data)}</span>
                {e.hora && <span>⏰ {e.hora.slice(0, 5)}</span>}
              </div>

              {e.descricao && (
                <div className="text-sm text-[#9a9ab8] bg-[#0f0f13] rounded-xl p-3 leading-relaxed">{e.descricao}</div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => toggleConcluido(e).then(() => setModal(null))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    e.concluido
                      ? "border-[#2a2a3e] text-[#6a6a8a] hover:text-[#e8e8f0]"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  }`}>
                  {e.concluido ? "↩ Reabrir" : "✓ Concluir"}
                </button>
                <button onClick={() => deletarEvento(e.id)}
                  className="px-4 py-2.5 rounded-xl text-sm border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all">
                  Excluir
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ MODAL: ADICIONAR EVENTO ════════════════════════════════ */}
      {modal === "add" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          <div className="relative z-10 w-full max-w-sm bg-[#13131e] border border-[#2a2a3e] rounded-2xl p-5 flex flex-col gap-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-[#e8e8f0]">Novo Evento</div>
              <button onClick={() => setModal(null)} className="text-[#4a4a6a] hover:text-[#e8e8f0] text-2xl leading-none">×</button>
            </div>

            {/* Tipo */}
            <div>
              <div className="text-xs text-[#6a6a8a] mb-2">Tipo</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(TIPO_CFG).map(([k, v]) => (
                  <button key={k} onClick={() => setForm(f => ({ ...f, tipo: k }))}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                      form.tipo === k ? "border-[#6c5fff] bg-[#6c5fff22] text-[#a78bfa]" : "border-[#2a2a3e] text-[#6a6a8a]"
                    }`}>{v.icon} {v.label}</button>
                ))}
              </div>
            </div>

            {/* Disciplina */}
            <div>
              <div className="text-xs text-[#6a6a8a] mb-1.5">Disciplina</div>
              <select value={form.disciplina}
                onChange={e => setForm(f => ({ ...f, disciplina: e.target.value }))}
                className="w-full bg-[#0f0f13] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#6c5fff] appearance-none">
                <option value="">— nenhuma —</option>
                {DISCIPLINAS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Título */}
            <div>
              <div className="text-xs text-[#6a6a8a] mb-1.5">Título</div>
              <input type="text" value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Prova 1 — cap. 1 a 3"
                className="w-full bg-[#0f0f13] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#3a3a50] outline-none focus:border-[#6c5fff]" />
            </div>

            {/* Data e Hora */}
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-xs text-[#6a6a8a] mb-1.5">Data</div>
                <input type="date" value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                  className="w-full bg-[#0f0f13] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#6c5fff]" />
              </div>
              <div>
                <div className="text-xs text-[#6a6a8a] mb-1.5">Hora</div>
                <input type="time" value={form.hora}
                  onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
                  className="bg-[#0f0f13] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e8f0] outline-none focus:border-[#6c5fff]" />
              </div>
            </div>

            {/* Descrição */}
            <div>
              <div className="text-xs text-[#6a6a8a] mb-1.5">Descrição (opcional)</div>
              <textarea value={form.descricao} rows={2}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Conteúdo, observações..."
                className="w-full bg-[#0f0f13] border border-[#2a2a3e] rounded-xl px-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#3a3a50] outline-none focus:border-[#6c5fff] resize-none" />
            </div>

            <button onClick={salvarEvento} disabled={salvando || !form.titulo.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-[#6c5fff] text-white hover:bg-[#5b4de8] disabled:opacity-50 transition-all">
              {salvando ? "Salvando..." : "Adicionar Evento"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ TOAST ══════════════════════════════════════════════════ */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg z-50 whitespace-nowrap
          ${toast.ok ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                     : "bg-red-500/20 border border-red-500/30 text-red-400"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
