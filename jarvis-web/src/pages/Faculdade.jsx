import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useHeader } from "../contexts/HeaderContext";
import Modal from "../components/Modal";

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL || "https://web-production-f30e8.up.railway.app";

// aulas carregadas do Supabase (tabela faculdade_aulas)

const DIAS_NOME = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const TIPO_CFG = {
  prova:     { label: "Prova",     badge: "bg-red-500/15 text-red-400",       icon: "📝" },
  atividade: { label: "Atividade", badge: "bg-amber-500/15 text-amber-400",   icon: "📋" },
  ead:       { label: "EAD",       badge: "bg-sky-500/15 text-sky-400",       icon: "💻" },
  aviso:     { label: "Aviso",     badge: "bg-violet-500/15 text-violet-400", icon: "📢" },
};

const PALETA_MATERIA = ["#7c3aed", "#0ea5e9", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#64748b", "#84cc16"];

const MATERIA_INICIAL = {
  id: null, disciplina: "", turma: "", professor: "",
  dia: 1, inicio: "08:00", fim: "10:00", local: "", cor: PALETA_MATERIA[0],
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
  const [aulas, setAulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [detalheMedia, setDetalheMedia] = useState(null); // { loading, data } — pra aba de detalhe da disciplina
  const [modalConteudo, setModalConteudo] = useState(null); // último modal não-nulo — mantém o conteúdo visível durante a animação de saída
  const [chatInput, setChatInput] = useState("");
  const [chatEnviando, setChatEnviando] = useState(false);
  const chatFileRef = useRef(null);
  const [materiaForm, setMateriaForm] = useState(MATERIA_INICIAL);
  const [salvandoMateria, setSalvandoMateria] = useState(false);
  const [confirmAcao, setConfirmAcao] = useState(null); // { tipo: "horario"|"materia"|"semestre", alvo, label }

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function carregar() {
    const [{ data: evData }, { data: aulasData }] = await Promise.all([
      supabase.from("faculdade_eventos").select("*").order("data").order("hora", { nullsFirst: true }),
      supabase.from("faculdade_aulas").select("*").eq("ativo", true).order("dia").order("inicio"),
    ]);
    if (evData) setEventos(evData);
    if (aulasData) setAulas(aulasData);
  }

  useEffect(() => {
    (async () => { setLoading(true); await carregar(); setLoading(false); })();
  }, []);

  // Abre um modal guardando o conteúdo à parte — modalConteudo permanece
  // preenchido durante a animação de saída (quando modal já virou null)
  function abrirModal(m) {
    setModalConteudo(m);
    setModal(m);
  }

  function carregarMedia(nome) {
    setDetalheMedia({ loading: true, data: null });
    fetch(`${JARVIS_URL}/api/faculdade/${encodeURIComponent(nome)}/media`)
      .then(r => r.json())
      .then(data => setDetalheMedia({ loading: false, data }))
      .catch(() => setDetalheMedia({ loading: false, data: null }));
  }

  function abrirDisciplina(nome) {
    carregarMedia(nome);
    abrirModal({ modo: "disciplina", nome });
  }

  // Livre presença/online são atributos da matéria pro semestre inteiro — aplica
  // em todas as aulas ativas com esse nome, não só na ocorrência clicada
  async function alternarFlagDisciplina(nome, campo) {
    const atual = aulas.find(a => a.disciplina === nome)?.[campo] ?? false;
    await supabase.from("faculdade_aulas").update({ [campo]: !atual }).eq("disciplina", nome).eq("ativo", true);
    await carregar();
  }

  // Manda texto pro JARVIS (mesmo endpoint do chat) e atualiza a matéria com o resultado
  async function enviarMensagemDisciplina(nome) {
    if (!chatInput.trim() || chatEnviando) return;
    const texto = chatInput.trim();
    setChatInput("");
    setChatEnviando(true);
    try {
      const res = await fetch(`${JARVIS_URL}/api/mensagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const data = await res.json();
      showToast(data.texto || "Enviado");
      await carregar();
      carregarMedia(nome);
    } catch {
      showToast("Erro ao enviar", false);
    }
    setChatEnviando(false);
  }

  async function enviarArquivoDisciplina(nome, file) {
    if (!file || chatEnviando) return;
    setChatEnviando(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${JARVIS_URL}/api/mensagem/arquivo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimetype: file.type, texto: chatInput.trim() }),
      });
      const data = await res.json();
      showToast(data.texto || "Enviado");
      setChatInput("");
      await carregar();
      carregarMedia(nome);
    } catch {
      showToast("Erro ao enviar arquivo", false);
    }
    setChatEnviando(false);
  }

  const dias = useMemo(() => semanaDeOffset(semanaOff), [semanaOff]);
  const disciplinas = useMemo(() => [...new Set(aulas.map(a => a.disciplina))].sort(), [aulas]);

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
      right: aba === "materias" ? (
        <button
          onClick={() => abrirNovaMateria(null)}
          className="text-xs px-2.5 py-1 rounded-lg bg-roxo-700/13 border border-roxo-700/27 text-roxo-400 hover:bg-roxo-700/20 transition-all">
          + Matéria
        </button>
      ) : (
        <button
          onClick={() => { setForm(FORM_INICIAL); abrirModal("add"); }}
          className="text-xs px-2.5 py-1 rounded-lg bg-roxo-700/13 border border-roxo-700/27 text-roxo-400 hover:bg-roxo-700/20 transition-all">
          + Evento
        </button>
      ),
      secondRow: (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[["semana", "📅 Semana"], ["eventos", "📋 Eventos"], ["materias", "📚 Matérias"]].map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all shrink-0
                ${aba === k ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                           : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
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
    return aulas.filter(a => a.dia === d.getDay()).sort((a, b) => a.inicio.localeCompare(b.inicio));
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

  // ── Aba Matérias (cadastro manual + encerrar semestre) ──────────
  const materiasAgrupadas = useMemo(() => {
    const grupos = new Map();
    for (const a of aulas) {
      if (!grupos.has(a.disciplina)) grupos.set(a.disciplina, []);
      grupos.get(a.disciplina).push(a);
    }
    return [...grupos.entries()]
      .map(([nome, slots]) => [nome, slots.sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio))])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [aulas]);

  function abrirNovaMateria(base) {
    setMateriaForm(base
      ? { ...MATERIA_INICIAL, disciplina: base.disciplina, turma: base.turma || "", professor: base.professor || "", local: base.local || "", cor: base.cor }
      : MATERIA_INICIAL);
    abrirModal({ modo: "materia" });
  }

  function abrirEditarMateria(aula) {
    setMateriaForm({ ...aula, turma: aula.turma || "", professor: aula.professor || "", local: aula.local || "" });
    abrirModal({ modo: "materia" });
  }

  async function salvarMateria() {
    if (!materiaForm.disciplina.trim() || !materiaForm.inicio || !materiaForm.fim) return;
    setSalvandoMateria(true);
    const row = {
      disciplina: materiaForm.disciplina.trim(),
      turma: materiaForm.turma.trim() || null,
      professor: materiaForm.professor.trim() || null,
      dia: Number(materiaForm.dia),
      inicio: materiaForm.inicio,
      fim: materiaForm.fim,
      local: materiaForm.local.trim() || null,
      cor: materiaForm.cor,
      ativo: true,
    };
    const { error } = materiaForm.id
      ? await supabase.from("faculdade_aulas").update(row).eq("id", materiaForm.id)
      : await supabase.from("faculdade_aulas").insert(row);
    setSalvandoMateria(false);
    if (error) { showToast("Erro ao salvar", false); return; }
    await carregar();
    setModal(null);
    showToast(materiaForm.id ? "Horário atualizado ✓" : "Matéria adicionada ✓");
  }

  async function confirmarAcaoPendente() {
    if (!confirmAcao) return;
    if (confirmAcao.tipo === "horario") {
      await supabase.from("faculdade_aulas").delete().eq("id", confirmAcao.alvo);
      showToast("Horário excluído");
    } else if (confirmAcao.tipo === "materia") {
      await supabase.from("faculdade_aulas").delete().eq("disciplina", confirmAcao.alvo);
      showToast("Matéria excluída");
    } else if (confirmAcao.tipo === "semestre") {
      await supabase.from("faculdade_aulas").update({ ativo: false }).eq("ativo", true);
      showToast("Semestre encerrado");
    }
    setConfirmAcao(null);
    await carregar();
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-cinza-200 text-sm">Carregando...</div>;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">

        {/* ═══ ABA SEMANA ══════════════════════════════════════════ */}
        {aba === "semana" && (
          <div className="flex flex-col">
            {/* Navegador de semana */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-cinza-850">
              <button onClick={() => setSemanaOff(v => v - 1)}
                className="w-8 h-8 flex items-center justify-center text-cinza-200 hover:text-cinza-50 rounded-lg hover:bg-cinza-800 transition-all text-lg">‹</button>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm text-cinza-50">{semanaLabel}</span>
                {semanaOff !== 0 && (
                  <button onClick={() => setSemanaOff(0)} className="text-[10px] text-roxo-700 hover:text-roxo-400">
                    Semana atual
                  </button>
                )}
              </div>
              <button onClick={() => setSemanaOff(v => v + 1)}
                className="w-8 h-8 flex items-center justify-center text-cinza-200 hover:text-cinza-50 rounded-lg hover:bg-cinza-800 transition-all text-lg">›</button>
            </div>

            {/* Dias */}
            <div className="divide-y divide-cinza-900">
              {dias.map(d => {
                const iso = toISO(d);
                const aulas = aulasNoDia(d);
                const evDia = eventosNaData(iso);
                const hoje = ehHoje(d);
                const dow = d.getDay();

                return (
                  <div key={iso} className={`px-3 pt-3 pb-4 ${hoje ? "bg-cinza-950" : ""}`}>
                    {/* Cabeçalho do dia */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        hoje ? "bg-roxo-700 text-white" : "text-cinza-350"
                      }`}>{DIAS_NOME[dow]}</span>
                      <span className={`text-xs ${hoje ? "text-roxo-400" : "text-cinza-350"}`}>
                        {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        {hoje ? " · hoje" : ""}
                      </span>
                    </div>

                    {aulas.length === 0 && evDia.length === 0 ? (
                      <div className="text-xs text-cinza-350 pl-1">Sem aulas</div>
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
                              className={`bg-cinza-900 rounded-xl p-3 border transition-all ${
                                ead ? "border-sky-500/25" : "border-cinza-800"
                              }`}
                              style={{ borderLeftColor: a.cor, borderLeftWidth: 3 }}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] text-cinza-300 tabular-nums">{a.inicio} – {a.fim}</div>
                                  <button onClick={() => abrirDisciplina(a.disciplina)}
                                    className="text-sm font-medium text-cinza-50 mt-0.5 leading-snug text-left hover:text-roxo-400 transition-colors">
                                    {a.disciplina}
                                  </button>
                                  <div className="text-[11px] text-cinza-300 mt-0.5">{a.local}</div>
                                  <div className="text-[11px] text-cinza-300">{a.professor}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {(ead || a.online) && (
                                    <span className="text-[10px] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-full">💻 {ead ? "EAD" : "Online"}</span>
                                  )}
                                  {a.livre_presenca && (
                                    <span className="text-[10px] bg-amber-500/10 text-amber-600/60 px-1.5 py-0.5 rounded-full">livre presença</span>
                                  )}
                                </div>
                              </div>
                              {evAula.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {evAula.map(e => (
                                    <button key={e.id} onClick={() => abrirModal({ modo: "view", ev: e })}
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
                            return !aulas.some(a => a.disciplina === e.disciplina && a.dia === dow);
                          })
                          .map(e => (
                            <button key={e.id} onClick={() => abrirModal({ modo: "view", ev: e })}
                              className={`text-left bg-cinza-900 rounded-xl px-3 py-2.5 border border-cinza-800 hover:border-cinza-700 transition-all ${e.concluido ? "opacity-50" : ""}`}>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TIPO_CFG[e.tipo]?.badge ?? ""}`}>
                                  {TIPO_CFG[e.tipo]?.icon} {TIPO_CFG[e.tipo]?.label}
                                </span>
                                <span className="text-sm text-cinza-50 truncate">{e.titulo}</span>
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
                    filtroTipo === k ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                                    : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                  {l}
                </button>
              ))}
              <button onClick={() => setMostrarFeitos(v => !v)}
                className={`px-3 py-1 rounded-lg text-xs border transition-all shrink-0 ${
                  mostrarFeitos ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                               : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                {mostrarFeitos ? "✓ Feitos" : "Feitos"}
              </button>
            </div>

            {eventosFiltrados.length === 0 && (
              <div className="text-center text-cinza-300 text-sm py-10">Nenhum evento</div>
            )}

            {eventosFiltrados.map(e => {
              const tc = TIPO_CFG[e.tipo] ?? TIPO_CFG.aviso;
              return (
                <button key={e.id} onClick={() => abrirModal({ modo: "view", ev: e })}
                  className={`text-left bg-cinza-900 rounded-xl p-3 border border-cinza-800 hover:border-cinza-700 transition-all ${e.concluido ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tc.badge}`}>{tc.icon} {tc.label}</span>
                        {e.disciplina && <span className="text-[10px] text-cinza-350 truncate max-w-[180px]">{e.disciplina}</span>}
                      </div>
                      <div className={`text-sm font-medium text-cinza-50 ${e.concluido ? "line-through" : ""}`}>{e.titulo}</div>
                      {e.descricao && <div className="text-xs text-cinza-200 mt-0.5 line-clamp-1">{e.descricao}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-medium text-cinza-200">{fmtDMM(e.data)}</div>
                      {e.hora && <div className="text-[11px] text-cinza-350 tabular-nums">{e.hora.slice(0, 5)}</div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ═══ ABA MATÉRIAS ════════════════════════════════════════ */}
        {aba === "materias" && (
          <div className="flex flex-col gap-3 px-3 pb-4 pt-3">
            {materiasAgrupadas.length === 0 && (
              <div className="text-center text-cinza-300 text-sm py-10">Nenhuma matéria cadastrada — toque em "+ Matéria" pra começar.</div>
            )}
            {materiasAgrupadas.map(([nome, slots]) => (
              <div key={nome} className="bg-cinza-900 rounded-xl border border-cinza-800 p-3" style={{ borderLeftColor: slots[0].cor, borderLeftWidth: 3 }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="text-sm font-medium text-cinza-50">{nome}</div>
                  <button onClick={() => setConfirmAcao({ tipo: "materia", alvo: nome, label: `Excluir *${nome}* e todos os seus horários?` })}
                    className="text-[11px] text-red-400 hover:text-red-300 shrink-0">Excluir matéria</button>
                </div>
                <div className="flex flex-col gap-1">
                  {slots.map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-xs text-cinza-300">
                      <span>{DIAS_NOME[a.dia]} · {a.inicio}–{a.fim}{a.local ? ` · ${a.local}` : ""}</span>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => abrirEditarMateria(a)} className="hover:text-cinza-50">✏️</button>
                        <button onClick={() => setConfirmAcao({ tipo: "horario", alvo: a.id, label: `Excluir o horário de ${DIAS_NOME[a.dia]} ${a.inicio}–${a.fim} de *${nome}*?` })}
                          className="hover:text-red-400">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => abrirNovaMateria(slots[0])} className="text-[11px] text-roxo-400 hover:text-roxo-300 mt-1.5">+ horário</button>
              </div>
            ))}

            <button onClick={() => abrirNovaMateria(null)}
              className="w-full py-2.5 rounded-xl text-sm font-medium border border-dashed border-cinza-700 text-cinza-200 hover:border-roxo-700 hover:text-roxo-400 transition-all">
              + Nova matéria
            </button>

            {/* Zona de risco */}
            <div className="mt-4 pt-4 border-t border-cinza-850">
              <div className="text-[11px] font-semibold tracking-widest text-cinza-350 uppercase mb-2">Semestre</div>
              <button
                onClick={() => setConfirmAcao({ tipo: "semestre", alvo: null, label: "Encerrar o semestre atual? Todas as matérias da grade ficam inativas — dá pra cadastrar o semestre novo em seguida." })}
                disabled={materiasAgrupadas.length === 0}
                className="w-full py-2.5 rounded-xl text-sm font-medium border border-red-500/20 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-all">
                Encerrar semestre
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODAL: VER EVENTO ══════════════════════════════════════ */}
      <Modal open={modal?.modo === "view"} onClose={() => setModal(null)} align="bottom">
        {modalConteudo?.modo === "view" && (() => {
          const e = modalConteudo.ev;
          const tc = TIPO_CFG[e.tipo] ?? TIPO_CFG.aviso;
          return (
            <div className="w-full max-w-sm mx-auto bg-cinza-900 border border-cinza-700 rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tc.badge}`}>{tc.icon} {tc.label}</span>
                  {e.disciplina && <div className="text-xs text-cinza-200 mt-1">{e.disciplina}</div>}
                  <div className="text-base font-semibold text-cinza-50 mt-1 leading-snug">{e.titulo}</div>
                </div>
                <button onClick={() => setModal(null)} className="text-cinza-350 hover:text-cinza-50 text-2xl leading-none shrink-0">×</button>
              </div>

              <div className="flex gap-4 text-xs text-cinza-200">
                <span>📅 {fmtDMM(e.data)}</span>
                {e.hora && <span>⏰ {e.hora.slice(0, 5)}</span>}
                {e.nota !== null && e.nota !== undefined && <span>🎯 Nota: <span className="text-roxo-400 font-semibold">{e.nota}</span></span>}
              </div>

              {e.descricao && (
                <div className="text-sm text-cinza-300 bg-cinza-950 rounded-xl p-3 leading-relaxed">{e.descricao}</div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => toggleConcluido(e).then(() => setModal(null))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    e.concluido
                      ? "border-cinza-700 text-cinza-200 hover:text-cinza-50"
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
          );
        })()}
      </Modal>

      {/* ═══ MODAL: DETALHE DA DISCIPLINA (notas e média) ═══════════ */}
      <Modal open={modal?.modo === "disciplina"} onClose={() => setModal(null)} align="bottom">
        {modalConteudo?.modo === "disciplina" && (() => {
          const nome = modalConteudo.nome;
          const eventosDaMateria = eventos
            .filter(e => e.disciplina === nome)
            .sort((a, b) => a.data.localeCompare(b.data));
          const aulaRef = aulas.find(a => a.disciplina === nome);
          const d = detalheMedia;
          return (
            <div className="w-full max-w-sm mx-auto bg-cinza-900 border border-cinza-700 rounded-2xl p-5 flex flex-col gap-4 max-h-[92dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-2">
                <div className="text-base font-semibold text-cinza-50">{nome}</div>
                <button onClick={() => setModal(null)} className="text-cinza-350 hover:text-cinza-50 text-2xl leading-none shrink-0">×</button>
              </div>

              {/* Livre presença / online — vale pro semestre inteiro, aplica em todas as aulas da matéria */}
              <div className="flex gap-2">
                <button onClick={() => alternarFlagDisciplina(nome, "livre_presenca")}
                  className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    aulaRef?.livre_presenca
                      ? "bg-amber-500/10 border-amber-600/40 text-amber-500"
                      : "bg-cinza-950 border-cinza-700 text-cinza-350 hover:text-cinza-200"
                  }`}>
                  {aulaRef?.livre_presenca ? "✓ " : ""}Livre presença
                </button>
                <button onClick={() => alternarFlagDisciplina(nome, "online")}
                  className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    aulaRef?.online
                      ? "bg-sky-500/15 border-sky-500/40 text-sky-400"
                      : "bg-cinza-950 border-cinza-700 text-cinza-350 hover:text-cinza-200"
                  }`}>
                  {aulaRef?.online ? "✓ " : ""}Online
                </button>
              </div>

              {/* Média */}
              <div className="bg-cinza-950 rounded-xl p-3">
                {!d || d.loading ? (
                  <div className="text-xs text-cinza-300">Calculando média…</div>
                ) : !d.data?.formula_media ? (
                  <div className="text-xs text-cinza-300">
                    Nenhuma fórmula de média cadastrada ainda. Manda abaixo algo como <span className="text-cinza-200">"a média de {nome} é a soma das provas dividido por 2"</span>.
                  </div>
                ) : d.data.media_atual === null ? (
                  <div className="text-xs text-cinza-300">
                    <div className="mb-1.5">📐 <span className="text-cinza-200">{d.data.formula_media}</span></div>
                    Nenhuma nota lançada ainda.
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl font-bold text-roxo-400">{d.data.media_atual}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        d.data.media_atual >= 6 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {d.data.media_atual >= 6 ? "Aprovado" : "Em aberto"}
                      </span>
                    </div>
                    {d.data.resumo && <div className="text-xs text-cinza-200 leading-relaxed">{d.data.resumo}</div>}
                    {d.data.notas_faltando && <div className="text-xs text-cinza-350 mt-1">{d.data.notas_faltando}</div>}
                    <div className="text-[10px] text-cinza-350 mt-2">📐 {d.data.formula_media}</div>
                  </div>
                )}
              </div>

              {/* Lista de provas/atividades */}
              <div className="flex flex-col gap-1.5">
                <div className="text-xs text-cinza-200 mb-0.5">Provas e atividades</div>
                {eventosDaMateria.length === 0 && (
                  <div className="text-xs text-cinza-350">Nenhuma cadastrada ainda.</div>
                )}
                {eventosDaMateria.map(e => {
                  const tc = TIPO_CFG[e.tipo] ?? TIPO_CFG.aviso;
                  return (
                    <button key={e.id} onClick={() => abrirModal({ modo: "view", ev: e })}
                      className="flex items-center justify-between gap-2 bg-cinza-950 hover:bg-cinza-850 rounded-xl px-3 py-2 transition-colors text-left">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tc.badge}`}>{tc.icon}</span>
                          <span className="text-sm text-cinza-50 truncate">{e.titulo}</span>
                        </div>
                        <div className="text-[10px] text-cinza-350">{fmtDMM(e.data)}</div>
                      </div>
                      <div className="text-sm font-semibold shrink-0">
                        {e.nota !== null && e.nota !== undefined
                          ? <span className="text-roxo-400">{e.nota}</span>
                          : <span className="text-cinza-350">—</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Adicionar por mensagem ou foto — mesmo pipeline do chat */}
              <div className="flex flex-col gap-1.5 pt-1 border-t border-cinza-800">
                <div className="text-xs text-cinza-200 mb-0.5">Adicionar prova, atividade ou nota</div>
                <input ref={chatFileRef} type="file" accept="image/*,application/pdf" hidden
                  onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) enviarArquivoDisciplina(nome, f); }} />
                <div className="flex items-end gap-2">
                  <textarea value={chatInput} rows={1}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagemDisciplina(nome); } }}
                    placeholder={`Ex: "prova dia 20/08" ou "tirei 8 na P1"`}
                    disabled={chatEnviando}
                    className="flex-1 min-w-0 bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 placeholder:text-cinza-300 outline-none focus:border-roxo-700 resize-none disabled:opacity-50" />
                  <button onClick={() => chatFileRef.current.click()} disabled={chatEnviando}
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border border-cinza-700 text-cinza-200 hover:border-roxo-700 hover:text-roxo-400 disabled:opacity-50 transition-colors text-lg">
                    📎
                  </button>
                  <button onClick={() => enviarMensagemDisciplina(nome)} disabled={chatEnviando || !chatInput.trim()}
                    className="px-4 py-2 shrink-0 rounded-xl text-sm font-semibold bg-roxo-700 hover:bg-roxo-600 text-white disabled:opacity-50 transition-colors">
                    {chatEnviando ? "…" : "Enviar"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ═══ MODAL: ADICIONAR EVENTO ════════════════════════════════ */}
      <Modal open={modal === "add"} onClose={() => setModal(null)} align="bottom">
        {modalConteudo === "add" && (
          <div className="w-full max-w-sm mx-auto bg-cinza-900 border border-cinza-700 rounded-2xl p-5 flex flex-col gap-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-cinza-50">Novo Evento</div>
              <button onClick={() => setModal(null)} className="text-cinza-350 hover:text-cinza-50 text-2xl leading-none">×</button>
            </div>

            {/* Tipo */}
            <div>
              <div className="text-xs text-cinza-200 mb-2">Tipo</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(TIPO_CFG).map(([k, v]) => (
                  <button key={k} onClick={() => setForm(f => ({ ...f, tipo: k }))}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                      form.tipo === k ? "border-roxo-700 bg-roxo-700/13 text-roxo-400" : "border-cinza-700 text-cinza-200"
                    }`}>{v.icon} {v.label}</button>
                ))}
              </div>
            </div>

            {/* Disciplina */}
            <div>
              <div className="text-xs text-cinza-200 mb-1.5">Disciplina</div>
              <select value={form.disciplina}
                onChange={e => setForm(f => ({ ...f, disciplina: e.target.value }))}
                className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 outline-none focus:border-roxo-700 appearance-none">
                <option value="">— nenhuma —</option>
                {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Título */}
            <div>
              <div className="text-xs text-cinza-200 mb-1.5">Título</div>
              <input type="text" value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Prova 1 — cap. 1 a 3"
                className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 placeholder:text-cinza-300 outline-none focus:border-roxo-700" />
            </div>

            {/* Data e Hora */}
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-xs text-cinza-200 mb-1.5">Data</div>
                <input type="date" value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                  className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 outline-none focus:border-roxo-700" />
              </div>
              <div>
                <div className="text-xs text-cinza-200 mb-1.5">Hora</div>
                <input type="time" value={form.hora}
                  onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
                  className="bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 outline-none focus:border-roxo-700" />
              </div>
            </div>

            {/* Descrição */}
            <div>
              <div className="text-xs text-cinza-200 mb-1.5">Descrição (opcional)</div>
              <textarea value={form.descricao} rows={2}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Conteúdo, observações..."
                className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 placeholder:text-cinza-300 outline-none focus:border-roxo-700 resize-none" />
            </div>

            <button onClick={salvarEvento} disabled={salvando || !form.titulo.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-roxo-700 text-white hover:bg-roxo-900 disabled:opacity-50 transition-all">
              {salvando ? "Salvando..." : "Adicionar Evento"}
            </button>
          </div>
        )}
      </Modal>

      {/* ═══ MODAL: NOVA MATÉRIA / EDITAR HORÁRIO ═══════════════════ */}
      <Modal open={modal?.modo === "materia"} onClose={() => setModal(null)} align="bottom">
        {modalConteudo?.modo === "materia" && (
          <div className="w-full max-w-sm mx-auto bg-cinza-900 border border-cinza-700 rounded-2xl p-5 flex flex-col gap-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-cinza-50">{materiaForm.id ? "Editar horário" : "Nova matéria"}</div>
              <button onClick={() => setModal(null)} className="text-cinza-350 hover:text-cinza-50 text-2xl leading-none">×</button>
            </div>

            <div>
              <div className="text-xs text-cinza-200 mb-1.5">Disciplina</div>
              <input type="text" value={materiaForm.disciplina}
                onChange={e => setMateriaForm(f => ({ ...f, disciplina: e.target.value }))}
                placeholder="Ex: Banco de Dados"
                className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 placeholder:text-cinza-300 outline-none focus:border-roxo-700" />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-xs text-cinza-200 mb-1.5">Turma (opcional)</div>
                <input type="text" value={materiaForm.turma}
                  onChange={e => setMateriaForm(f => ({ ...f, turma: e.target.value }))}
                  className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 outline-none focus:border-roxo-700" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-cinza-200 mb-1.5">Professor (opcional)</div>
                <input type="text" value={materiaForm.professor}
                  onChange={e => setMateriaForm(f => ({ ...f, professor: e.target.value }))}
                  className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 outline-none focus:border-roxo-700" />
              </div>
            </div>

            <div>
              <div className="text-xs text-cinza-200 mb-1.5">Dia da semana</div>
              <select value={materiaForm.dia}
                onChange={e => setMateriaForm(f => ({ ...f, dia: Number(e.target.value) }))}
                className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 outline-none focus:border-roxo-700 appearance-none">
                {DIAS_NOME.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-xs text-cinza-200 mb-1.5">Início</div>
                <input type="time" value={materiaForm.inicio}
                  onChange={e => setMateriaForm(f => ({ ...f, inicio: e.target.value }))}
                  className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 outline-none focus:border-roxo-700" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-cinza-200 mb-1.5">Fim</div>
                <input type="time" value={materiaForm.fim}
                  onChange={e => setMateriaForm(f => ({ ...f, fim: e.target.value }))}
                  className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 outline-none focus:border-roxo-700" />
              </div>
            </div>

            <div>
              <div className="text-xs text-cinza-200 mb-1.5">Local (opcional)</div>
              <input type="text" value={materiaForm.local}
                onChange={e => setMateriaForm(f => ({ ...f, local: e.target.value }))}
                placeholder="Ex: Bloco 14 · Auditório 2"
                className="w-full bg-cinza-950 border border-cinza-700 rounded-xl px-3 py-2 text-sm text-cinza-50 placeholder:text-cinza-300 outline-none focus:border-roxo-700" />
            </div>

            <div>
              <div className="text-xs text-cinza-200 mb-2">Cor</div>
              <div className="flex gap-2 flex-wrap">
                {PALETA_MATERIA.map(c => (
                  <button key={c} onClick={() => setMateriaForm(f => ({ ...f, cor: c }))}
                    className={`w-7 h-7 rounded-full transition-all ${materiaForm.cor === c ? "ring-2 ring-offset-2 ring-offset-cinza-900 ring-roxo-400" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <button onClick={salvarMateria} disabled={salvandoMateria || !materiaForm.disciplina.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-roxo-700 text-white hover:bg-roxo-900 disabled:opacity-50 transition-all">
              {salvandoMateria ? "Salvando..." : materiaForm.id ? "Salvar horário" : "Adicionar matéria"}
            </button>
          </div>
        )}
      </Modal>

      {/* ═══ MODAL: CONFIRMAÇÃO (excluir horário/matéria, encerrar semestre) ═ */}
      <Modal open={!!confirmAcao} onClose={() => setConfirmAcao(null)}>
        {confirmAcao && (
          <div className="w-full max-w-xs mx-auto bg-cinza-900 border border-cinza-700 rounded-2xl p-5 flex flex-col gap-4">
            <div className="text-sm text-cinza-50 leading-relaxed">{confirmAcao.label.replace(/\*/g, "")}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAcao(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-cinza-700 text-cinza-200 hover:text-cinza-50 transition-all">
                Cancelar
              </button>
              <button onClick={confirmarAcaoPendente}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-all">
                Confirmar
              </button>
            </div>
          </div>
        )}
      </Modal>

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
