import { useState, useEffect, useRef } from "react";
import { useHeader } from "../contexts/HeaderContext";

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL || "https://web-production-f30e8.up.railway.app";
const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TIMEZONES = [
  { value: "America/Sao_Paulo",      label: "São Paulo (UTC-3)" },
  { value: "America/Campo_Grande",   label: "Campo Grande (UTC-4/-3)" },
  { value: "America/Manaus",         label: "Manaus (UTC-4)" },
  { value: "America/Cuiaba",         label: "Cuiabá (UTC-4/-3)" },
  { value: "America/Belem",          label: "Belém (UTC-3)" },
  { value: "America/Fortaleza",      label: "Fortaleza (UTC-3)" },
  { value: "America/Recife",         label: "Recife (UTC-3)" },
  { value: "America/Porto_Velho",    label: "Porto Velho (UTC-4)" },
];

const PLATAFORMAS = [
  { Logo: RailwayLogo,  label: "Railway",  url: "https://railway.com/dashboard" },
  { Logo: SupabaseLogo, label: "Supabase", url: "https://supabase.com/dashboard/project/pbfcidkwidnfpegonhfk" },
  { Logo: VercelLogo,   label: "Vercel",   url: "https://vercel.com/dashboard" },
];

function RailwayLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="white">
      <rect x="3" y="5" width="18" height="12" rx="3" />
      <rect x="7" y="18" width="3" height="2" rx="1" />
      <rect x="14" y="18" width="3" height="2" rx="1" />
      <path d="M3 11.5h18" stroke="#13131e" strokeWidth="1.5" />
      <circle cx="8" cy="8.5" r="1.5" fill="#13131e" />
      <circle cx="12" cy="8.5" r="1.5" fill="#13131e" />
      <circle cx="16" cy="8.5" r="1.5" fill="#13131e" />
    </svg>
  );
}

function SupabaseLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7">
      <path fill="#3ECF8E" d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.101 12.911.701 14.173 1.78 14.173h10.113a.5.5 0 0 1 .496.504l-.387 8.288c-.015.986 1.26 1.41 1.874.637l9.262-11.652c.663-.86.063-2.122-1.016-2.122H13.009a.5.5 0 0 1-.496-.504l.387-8.288Z" />
    </svg>
  );
}

function VercelLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="white">
      <path d="M12 2L2 20h20L12 2z" />
    </svg>
  );
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function Secao({ titulo, children }) {
  return (
    <section>
      <p className="text-[11px] font-semibold tracking-widest text-cinza-350 uppercase mb-3">{titulo}</p>
      {children}
    </section>
  );
}

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Configuracoes() {
  const { setCfg } = useHeader();

  // ── Notificações ──
  const [pushStatus, setPushStatus] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const oneSignalRef = useRef(null);

  // ── Uso OpenAI ──
  const [uso, setUso] = useState(null);
  const [loadingUso, setLoadingUso] = useState(true);

  // ── Config (lembretes) ──
  const [config, setConfig] = useState({ hora_lembrete: "06", timezone: "America/Campo_Grande" });
  const [configOriginal, setConfigOriginal] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // ── Exportar ──
  const mesAtual = MESES[new Date().getMonth()];
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual);
  const [exportando, setExportando] = useState(false);

  // ── Modal ──
  const [modal, setModal] = useState(null);
  const [confirmarReset, setConfirmarReset] = useState(false);

  // ── Categorias ──
  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState("tarefa");
  const [novaCat, setNovaCat] = useState({ nome: "", emoji: "", tipo: "tarefa" });
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [revisao, setRevisao] = useState(null); // { tipo: "tarefas"|"gastos", sugestoes, selecionadas: Set }
  const [revisando, setRevisando] = useState(null); // "tarefas" | "gastos" | null
  const [aplicandoRevisao, setAplicandoRevisao] = useState(false);

  useEffect(() => {
    setCfg({ title: "Configurações", subtitle: "Gerenciar app e integrações", right: null, secondRow: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ONESIGNAL_APP_ID) return;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerPath: "/OneSignalSDKWorker.js",
          notifyButton: { enable: false },
          welcomeNotification: { disable: true },
        });
        oneSignalRef.current = OneSignal;
        setPushStatus(OneSignal.Notifications.permission);
        OneSignal.Notifications.addEventListener("permissionChange", granted => setPushStatus(granted));
      } catch (err) {
        console.error("OneSignal init falhou:", err);
      }
    });
  }, []);

  useEffect(() => {
    fetch(`${JARVIS_URL}/api/uso`)
      .then(r => r.json())
      .then(data => { setUso(data); setLoadingUso(false); })
      .catch(() => setLoadingUso(false));
    fetch(`${JARVIS_URL}/api/config`)
      .then(r => r.json())
      .then(data => { setConfig(data); setConfigOriginal(data); })
      .catch(() => {});
    carregarCategorias();
  }, []);

  async function carregarCategorias() {
    setLoadingCategorias(true);
    try {
      const res = await fetch(`${JARVIS_URL}/api/categorias`);
      setCategorias(await res.json());
    } catch {
      setCategorias([]);
    }
    setLoadingCategorias(false);
  }

  async function criarCategoria() {
    if (!novaCat.nome.trim()) return;
    setCriandoCategoria(true);
    try {
      const res = await fetch(`${JARVIS_URL}/api/categorias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novaCat.nome.trim(), emoji: novaCat.emoji.trim() || "📌", tipo: novaCat.tipo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModal({ titulo: "Não foi possível criar", corpo: data.error || "Tente novamente." });
      } else {
        setNovaCat({ nome: "", emoji: "", tipo: novaCat.tipo });
        await carregarCategorias();
      }
    } catch {
      setModal({ titulo: "Erro", corpo: "Não foi possível criar a categoria. Tente novamente." });
    }
    setCriandoCategoria(false);
  }

  async function iniciarRevisao(tipo) {
    setRevisando(tipo);
    setRevisao(null);
    try {
      const url = tipo === "tarefas"
        ? `${JARVIS_URL}/api/tarefas/revisar-categorias`
        : `${JARVIS_URL}/api/gastos/revisar-categorias?mes=${encodeURIComponent(mesAtual)}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      const sugestoes = data.sugestoes || [];
      if (sugestoes.length === 0) {
        setModal({ titulo: "Tudo certo!", corpo: `Nenhuma sugestão de categoria — está tudo bem categorizado.` });
      } else {
        setRevisao({ tipo, sugestoes, selecionadas: new Set(sugestoes.map((_, i) => i)) });
      }
    } catch {
      setModal({ titulo: "Erro", corpo: "Não foi possível revisar as categorias. Tente novamente." });
    }
    setRevisando(null);
  }

  function toggleSugestao(i) {
    setRevisao(r => {
      const selecionadas = new Set(r.selecionadas);
      if (selecionadas.has(i)) selecionadas.delete(i); else selecionadas.add(i);
      return { ...r, selecionadas };
    });
  }

  async function aplicarRevisao() {
    setAplicandoRevisao(true);
    try {
      const chaveId = revisao.tipo === "tarefas" ? "linha" : "id";
      const aplicar = revisao.sugestoes
        .filter((_, i) => revisao.selecionadas.has(i))
        .map(s => ({ [chaveId]: s[chaveId], categoriaSugerida: s.categoriaSugerida }));
      const url = revisao.tipo === "tarefas"
        ? `${JARVIS_URL}/api/tarefas/aplicar-categorias`
        : `${JARVIS_URL}/api/gastos/aplicar-categorias`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aplicar }),
      });
      setModal({ titulo: "Aplicado!", corpo: `${aplicar.length} categoria(s) atualizada(s).` });
      setRevisao(null);
    } catch {
      setModal({ titulo: "Erro", corpo: "Não foi possível aplicar as mudanças. Tente novamente." });
    }
    setAplicandoRevisao(false);
  }

  async function ativarNotificacoes() {
    if (!oneSignalRef.current) {
      setModal({ titulo: "Aguarde", corpo: "Notificações ainda carregando, tente novamente em instantes." });
      return;
    }
    const isPWA = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (!isPWA) {
      setModal({ titulo: "Adicione à tela de início", corpo: "Para ativar notificações no iPhone, adicione o JARVIS à tela de início:\n\nSafari → Compartilhar → \"Adicionar à Tela de Início\"\n\nDepois abra o app de lá." });
      return;
    }
    if (Notification.permission === "denied") {
      setModal({ titulo: "Notificações bloqueadas", corpo: "Para ativar: Ajustes → JARVIS → Notificações → Ativar" });
      return;
    }
    try {
      await oneSignalRef.current.Notifications.requestPermission();
      setPushStatus(oneSignalRef.current.Notifications.permission);
    } catch (err) {
      console.error("requestPermission falhou:", err);
    }
  }

  async function salvarConfig() {
    setSalvando(true);
    try {
      const res = await fetch(`${JARVIS_URL}/api/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      setConfigOriginal({ ...config });
      setModal({ titulo: "Salvo!", corpo: "Configurações atualizadas. Os lembretes já estão no novo horário." });
    } catch {
      setModal({ titulo: "Erro", corpo: "Não foi possível salvar. Tente novamente." });
    }
    setSalvando(false);
  }

  async function exportarCSV() {
    setExportando(true);
    try {
      const res = await fetch(`${JARVIS_URL}/api/gastos/exportar?mes=${encodeURIComponent(mesSelecionado)}`);
      const gastos = await res.json();
      if (!gastos.length) {
        setModal({ titulo: "Sem dados", corpo: `Nenhum gasto encontrado em ${mesSelecionado}.` });
        setExportando(false);
        return;
      }
      const cols = ["data","descricao","valor","categoria","meio_pagamento","tipo","natureza","mes"];
      const header = ["Data","Descrição","Valor","Categoria","Meio de Pagamento","Tipo","Natureza","Mês"];
      const linhas = gastos.map(g => cols.map(c => csvEscape(g[c])).join(","));
      const csv = [header.join(","), ...linhas].join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `gastos-${mesSelecionado}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setModal({ titulo: "Erro", corpo: "Não foi possível exportar. Tente novamente." });
    }
    setExportando(false);
  }

  function confirmarLimparChat() {
    setConfirmarReset(false);
    window.dispatchEvent(new CustomEvent("jarvis:reset-chat"));
    setModal({ titulo: "Conversa limpa", corpo: "O histórico do chat foi apagado." });
  }

  const configAlterada = configOriginal &&
    (config.hora_lembrete !== configOriginal.hora_lembrete || config.timezone !== configOriginal.timezone);

  return (
    <div className="flex flex-col h-full">

      {/* Modal genérico */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-sm bg-cinza-850 border border-cinza-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <p className="text-base font-semibold text-white mb-2">{modal.titulo}</p>
              <p className="text-sm text-cinza-200 leading-relaxed whitespace-pre-line">{modal.corpo}</p>
            </div>
            <div className="border-t border-cinza-700 px-5 py-3 flex justify-end">
              <button onClick={() => setModal(null)}
                className="px-5 py-1.5 bg-roxo-700 hover:bg-roxo-600 rounded-xl text-sm font-semibold text-white transition-colors">
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de reset */}
      {confirmarReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-sm bg-cinza-850 border border-cinza-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <p className="text-base font-semibold text-white mb-2">Limpar conversa?</p>
              <p className="text-sm text-cinza-200 leading-relaxed">Isso apaga todo o histórico do chat. A ação não pode ser desfeita.</p>
            </div>
            <div className="border-t border-cinza-700 px-5 py-3 flex justify-end gap-2">
              <button onClick={() => setConfirmarReset(false)}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold text-cinza-200 hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarLimparChat}
                className="px-5 py-1.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-semibold text-white transition-colors">
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 flex flex-col gap-6">

        {/* ── Notificações ── */}
        <Secao titulo="Notificações">
          <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-cinza-50">Push notifications</p>
              <p className="text-xs text-cinza-200 mt-0.5 truncate">
                {pushStatus ? "Lembretes chegando no seu celular" : "Ative para receber lembretes e avisos"}
              </p>
            </div>
            {pushStatus ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">Ativo</span>
              </div>
            ) : (
              <button onClick={ativarNotificacoes}
                className="shrink-0 px-3 py-1.5 bg-roxo-700 hover:bg-roxo-600 rounded-xl text-xs font-semibold text-white transition-colors">
                Ativar
              </button>
            )}
          </div>
        </Secao>

        {/* ── Lembretes ── */}
        <Secao titulo="Lembretes">
          <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-cinza-50">Horário do resumo e lembrete</p>
                <p className="text-xs text-cinza-200 mt-0.5">Resumo diário e lembrete de gastos</p>
              </div>
              <select
                value={config.hora_lembrete}
                onChange={e => setConfig(c => ({ ...c, hora_lembrete: e.target.value }))}
                className="bg-cinza-900 border border-cinza-700 rounded-xl px-3 py-1.5 text-sm text-cinza-50 focus:outline-none focus:border-roxo-700 shrink-0">
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(h => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-cinza-50">Fuso horário</p>
                <p className="text-xs text-cinza-200 mt-0.5">Usado em todos os cron jobs</p>
              </div>
              <select
                value={config.timezone}
                onChange={e => setConfig(c => ({ ...c, timezone: e.target.value }))}
                className="bg-cinza-900 border border-cinza-700 rounded-xl px-3 py-1.5 text-sm text-cinza-50 focus:outline-none focus:border-roxo-700 shrink-0 max-w-[190px]">
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            {configAlterada && (
              <button onClick={salvarConfig} disabled={salvando}
                className="self-end px-5 py-1.5 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-colors">
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            )}
          </div>
        </Secao>

        {/* ── Dados ── */}
        <Secao titulo="Dados">
          <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-cinza-50">Exportar gastos</p>
              <select
                value={mesSelecionado}
                onChange={e => setMesSelecionado(e.target.value)}
                className="mt-1.5 bg-cinza-900 border border-cinza-700 rounded-xl px-3 py-1 text-xs text-cinza-200 focus:outline-none focus:border-roxo-700">
                {MESES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={exportarCSV} disabled={exportando}
              className="shrink-0 px-3 py-1.5 bg-cinza-800 border border-cinza-700 hover:border-roxo-700 disabled:opacity-50 rounded-xl text-xs font-semibold text-cinza-200 transition-colors">
              {exportando ? "…" : "↓ CSV"}
            </button>
          </div>
        </Secao>

        {/* ── Categorias ── */}
        <Secao titulo="Categorias">
          <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 flex flex-col gap-4">
            <div className="flex gap-2">
              {[["tarefa", "Tarefas"], ["gasto", "Gastos"], ["ganho", "Ganhos"]].map(([v, label]) => (
                <button key={v} onClick={() => setTipoFiltro(v)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    tipoFiltro === v ? "bg-roxo-700/13 border border-roxo-700 text-roxo-400" : "border border-cinza-700 text-cinza-200"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {loadingCategorias ? (
              <div className="h-6 bg-cinza-700 rounded animate-pulse" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categorias.filter(c => c.tipo === tipoFiltro).map(c => (
                  <span key={c.id} className="text-xs px-2.5 py-1 rounded-full bg-cinza-900 border border-cinza-700 text-cinza-200">
                    {c.emoji} {c.nome}
                  </span>
                ))}
                {categorias.filter(c => c.tipo === tipoFiltro).length === 0 && (
                  <span className="text-xs text-cinza-350">Nenhuma categoria desse tipo ainda.</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 border-t border-cinza-700">
              <input value={novaCat.emoji} onChange={e => setNovaCat(n => ({ ...n, emoji: e.target.value }))}
                placeholder="📌" maxLength={4}
                className="w-12 bg-cinza-900 border border-cinza-700 rounded-xl px-2 py-1.5 text-sm text-center text-cinza-50 focus:outline-none focus:border-roxo-700 mt-3" />
              <input value={novaCat.nome} onChange={e => setNovaCat(n => ({ ...n, nome: e.target.value }))}
                placeholder="Nome da categoria" onKeyDown={e => e.key === "Enter" && criarCategoria()}
                className="flex-1 min-w-0 bg-cinza-900 border border-cinza-700 rounded-xl px-3 py-1.5 text-sm text-cinza-50 focus:outline-none focus:border-roxo-700 mt-3" />
              <select value={novaCat.tipo} onChange={e => setNovaCat(n => ({ ...n, tipo: e.target.value }))}
                className="bg-cinza-900 border border-cinza-700 rounded-xl px-2 py-1.5 text-xs text-cinza-50 focus:outline-none focus:border-roxo-700 mt-3">
                <option value="tarefa">Tarefa</option>
                <option value="gasto">Gasto</option>
                <option value="ganho">Ganho</option>
              </select>
              <button onClick={criarCategoria} disabled={criandoCategoria || !novaCat.nome.trim()}
                className="shrink-0 px-3 py-1.5 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-xl text-xs font-semibold text-white transition-colors mt-3">
                {criandoCategoria ? "…" : "Adicionar"}
              </button>
            </div>

            <div className="flex gap-2 pt-1 border-t border-cinza-700">
              <button onClick={() => iniciarRevisao("tarefas")} disabled={revisando === "tarefas"}
                className="flex-1 px-3 py-1.5 bg-cinza-800 border border-cinza-700 hover:border-roxo-700 disabled:opacity-50 rounded-xl text-xs font-semibold text-cinza-200 transition-colors mt-3">
                {revisando === "tarefas" ? "Analisando…" : "🔍 Revisar categorias de tarefas"}
              </button>
              <button onClick={() => iniciarRevisao("gastos")} disabled={revisando === "gastos"}
                className="flex-1 px-3 py-1.5 bg-cinza-800 border border-cinza-700 hover:border-roxo-700 disabled:opacity-50 rounded-xl text-xs font-semibold text-cinza-200 transition-colors mt-3">
                {revisando === "gastos" ? "Analisando…" : `🔍 Revisar transações de ${mesAtual}`}
              </button>
            </div>

            {revisao && (
              <div className="pt-1 border-t border-cinza-700 flex flex-col gap-2 mt-1">
                <p className="text-xs text-cinza-200">{revisao.sugestoes.length} sugestão(ões) — desmarque o que não quer aplicar:</p>
                <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                  {revisao.sugestoes.map((s, i) => (
                    <label key={i} className="flex items-center gap-2 text-xs bg-cinza-900 border border-cinza-700 rounded-xl px-3 py-2 cursor-pointer">
                      <input type="checkbox" checked={revisao.selecionadas.has(i)} onChange={() => toggleSugestao(i)}
                        className="accent-roxo-700 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="text-cinza-50 truncate block">{s.descricao}</span>
                        <span className="text-cinza-350">{s.categoriaAtual} → <span className="text-roxo-400">{s.categoriaSugerida}</span></span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setRevisao(null)} className="px-4 py-1.5 rounded-xl text-xs font-semibold text-cinza-200 hover:text-white transition-colors">
                    Cancelar
                  </button>
                  <button onClick={aplicarRevisao} disabled={aplicandoRevisao || revisao.selecionadas.size === 0}
                    className="px-5 py-1.5 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-xl text-xs font-semibold text-white transition-colors">
                    {aplicandoRevisao ? "Aplicando…" : `Aplicar selecionadas (${revisao.selecionadas.size})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Secao>

        {/* ── Geral ── */}
        <Secao titulo="Geral">
          <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-cinza-50">Limpar conversa</p>
              <p className="text-xs text-cinza-200 mt-0.5">Apaga todo o histórico do chat</p>
            </div>
            <button onClick={() => setConfirmarReset(true)}
              className="shrink-0 px-3 py-1.5 bg-cinza-800 border border-cinza-700 hover:border-red-600 hover:text-red-400 rounded-xl text-xs font-semibold text-cinza-200 transition-colors">
              Limpar
            </button>
          </div>
        </Secao>

        {/* ── Uso este mês ── */}
        <Secao titulo="Uso este mês">
          {loadingUso ? (
            <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 mb-3 animate-pulse">
              <div className="h-3.5 w-16 bg-cinza-700 rounded mb-3" />
              <div className="flex gap-6">
                <div className="h-7 w-16 bg-cinza-700 rounded" />
                <div className="h-7 w-16 bg-cinza-700 rounded" />
              </div>
            </div>
          ) : uso?.openai ? (
            <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🤖</span>
                <span className="text-sm font-semibold text-cinza-50">OpenAI</span>
              </div>
              <div className="flex gap-8">
                <div>
                  <p className="text-2xl font-bold text-roxo-400">${uso.openai.custo.toFixed(2)}</p>
                  <p className="text-xs text-cinza-200 mt-0.5">gastos</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-cinza-50">{formatTokens(uso.openai.tokens)}</p>
                  <p className="text-xs text-cinza-200 mt-0.5">tokens</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🤖</span>
                <span className="text-sm font-semibold text-cinza-50">OpenAI</span>
              </div>
              <p className="text-xs text-cinza-200 leading-relaxed">
                Adicione <span className="text-roxo-400 font-mono">OPENAI_ADMIN_KEY</span> no Railway para ver o uso.{"\n"}
                Crie em: <span className="text-roxo-700">platform.openai.com → Settings → Admin Keys</span>
              </p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {PLATAFORMAS.map(({ Logo, label, url }) => (
              <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                className="bg-cinza-850 border border-cinza-700 rounded-2xl p-3 flex flex-col items-center gap-1.5
                  hover:border-roxo-700/27 hover:bg-cinza-800 transition-all active:scale-95">
                <Logo />
                <span className="text-xs text-cinza-200 font-medium">{label}</span>
                <span className="text-[10px] text-cinza-350">Dashboard ↗</span>
              </a>
            ))}
          </div>
        </Secao>

        {/* ── Sobre ── */}
        <Secao titulo="Sobre">
          <div className="bg-cinza-850 border border-cinza-700 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-cinza-200">App</span>
              <span className="text-sm font-semibold text-cinza-50">JARVIS v1.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-cinza-200">Backend</span>
              <span className="text-xs text-cinza-200 font-mono truncate max-w-[180px]">{JARVIS_URL.replace("https://", "")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-cinza-200">Stack</span>
              <span className="text-sm text-cinza-200">React · Node.js · Supabase</span>
            </div>
          </div>
        </Secao>

      </div>
    </div>
  );
}
