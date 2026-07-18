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
      <path d="M3 11.5h18" stroke="#12121a" strokeWidth="1.5" />
      <circle cx="8" cy="8.5" r="1.5" fill="#12121a" />
      <circle cx="12" cy="8.5" r="1.5" fill="#12121a" />
      <circle cx="16" cy="8.5" r="1.5" fill="#12121a" />
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
      <p className="text-[11px] font-semibold tracking-widest text-[#4a4a6a] uppercase mb-3">{titulo}</p>
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
  }, []);

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
          <div className="w-full max-w-sm bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <p className="text-base font-semibold text-white mb-2">{modal.titulo}</p>
              <p className="text-sm text-[#c8c8e0] leading-relaxed whitespace-pre-line">{modal.corpo}</p>
            </div>
            <div className="border-t border-[#2a2a3e] px-5 py-3 flex justify-end">
              <button onClick={() => setModal(null)}
                className="px-5 py-1.5 bg-[#6c5fff] hover:bg-[#7c6fff] rounded-xl text-sm font-semibold text-white transition-colors">
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
          <div className="w-full max-w-sm bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <p className="text-base font-semibold text-white mb-2">Limpar conversa?</p>
              <p className="text-sm text-[#c8c8e0] leading-relaxed">Isso apaga todo o histórico do chat. A ação não pode ser desfeita.</p>
            </div>
            <div className="border-t border-[#2a2a3e] px-5 py-3 flex justify-end gap-2">
              <button onClick={() => setConfirmarReset(false)}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold text-[#6a6a8a] hover:text-white transition-colors">
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
          <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#e8e8f0]">Push notifications</p>
              <p className="text-xs text-[#6a6a8a] mt-0.5 truncate">
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
                className="shrink-0 px-3 py-1.5 bg-[#6c5fff] hover:bg-[#7c6fff] rounded-xl text-xs font-semibold text-white transition-colors">
                Ativar
              </button>
            )}
          </div>
        </Secao>

        {/* ── Lembretes ── */}
        <Secao titulo="Lembretes">
          <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#e8e8f0]">Horário do resumo e lembrete</p>
                <p className="text-xs text-[#6a6a8a] mt-0.5">Resumo diário e lembrete de gastos</p>
              </div>
              <select
                value={config.hora_lembrete}
                onChange={e => setConfig(c => ({ ...c, hora_lembrete: e.target.value }))}
                className="bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-1.5 text-sm text-[#e8e8f0] focus:outline-none focus:border-[#6c5fff] shrink-0">
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(h => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#e8e8f0]">Fuso horário</p>
                <p className="text-xs text-[#6a6a8a] mt-0.5">Usado em todos os cron jobs</p>
              </div>
              <select
                value={config.timezone}
                onChange={e => setConfig(c => ({ ...c, timezone: e.target.value }))}
                className="bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-1.5 text-sm text-[#e8e8f0] focus:outline-none focus:border-[#6c5fff] shrink-0 max-w-[190px]">
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            {configAlterada && (
              <button onClick={salvarConfig} disabled={salvando}
                className="self-end px-5 py-1.5 bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-colors">
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            )}
          </div>
        </Secao>

        {/* ── Dados ── */}
        <Secao titulo="Dados">
          <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#e8e8f0]">Exportar gastos</p>
              <select
                value={mesSelecionado}
                onChange={e => setMesSelecionado(e.target.value)}
                className="mt-1.5 bg-[#12121a] border border-[#2a2a3e] rounded-xl px-3 py-1 text-xs text-[#c8c8e0] focus:outline-none focus:border-[#6c5fff]">
                {MESES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={exportarCSV} disabled={exportando}
              className="shrink-0 px-3 py-1.5 bg-[#1e1e30] border border-[#2a2a3e] hover:border-[#6c5fff] disabled:opacity-50 rounded-xl text-xs font-semibold text-[#c8c8e0] transition-colors">
              {exportando ? "…" : "↓ CSV"}
            </button>
          </div>
        </Secao>

        {/* ── Geral ── */}
        <Secao titulo="Geral">
          <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#e8e8f0]">Limpar conversa</p>
              <p className="text-xs text-[#6a6a8a] mt-0.5">Apaga todo o histórico do chat</p>
            </div>
            <button onClick={() => setConfirmarReset(true)}
              className="shrink-0 px-3 py-1.5 bg-[#1e1e30] border border-[#2a2a3e] hover:border-red-600 hover:text-red-400 rounded-xl text-xs font-semibold text-[#c8c8e0] transition-colors">
              Limpar
            </button>
          </div>
        </Secao>

        {/* ── Uso este mês ── */}
        <Secao titulo="Uso este mês">
          {loadingUso ? (
            <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-4 mb-3 animate-pulse">
              <div className="h-3.5 w-16 bg-[#2a2a3e] rounded mb-3" />
              <div className="flex gap-6">
                <div className="h-7 w-16 bg-[#2a2a3e] rounded" />
                <div className="h-7 w-16 bg-[#2a2a3e] rounded" />
              </div>
            </div>
          ) : uso?.openai ? (
            <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🤖</span>
                <span className="text-sm font-semibold text-[#e8e8f0]">OpenAI</span>
              </div>
              <div className="flex gap-8">
                <div>
                  <p className="text-2xl font-bold text-[#a78bfa]">${uso.openai.custo.toFixed(2)}</p>
                  <p className="text-xs text-[#6a6a8a] mt-0.5">gastos</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#e8e8f0]">{formatTokens(uso.openai.tokens)}</p>
                  <p className="text-xs text-[#6a6a8a] mt-0.5">tokens</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-4 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🤖</span>
                <span className="text-sm font-semibold text-[#e8e8f0]">OpenAI</span>
              </div>
              <p className="text-xs text-[#6a6a8a] leading-relaxed">
                Adicione <span className="text-[#a78bfa] font-mono">OPENAI_ADMIN_KEY</span> no Railway para ver o uso.{"\n"}
                Crie em: <span className="text-[#6c5fff]">platform.openai.com → Settings → Admin Keys</span>
              </p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {PLATAFORMAS.map(({ Logo, label, url }) => (
              <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-3 flex flex-col items-center gap-1.5
                  hover:border-[#6c5fff44] hover:bg-[#1e1e30] transition-all active:scale-95">
                <Logo />
                <span className="text-xs text-[#c8c8e0] font-medium">{label}</span>
                <span className="text-[10px] text-[#4a4a6a]">Dashboard ↗</span>
              </a>
            ))}
          </div>
        </Secao>

        {/* ── Sobre ── */}
        <Secao titulo="Sobre">
          <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#c8c8e0]">App</span>
              <span className="text-sm font-semibold text-[#e8e8f0]">JARVIS v1.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#c8c8e0]">Backend</span>
              <span className="text-xs text-[#6a6a8a] font-mono truncate max-w-[180px]">{JARVIS_URL.replace("https://", "")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#c8c8e0]">Stack</span>
              <span className="text-sm text-[#6a6a8a]">React · Node.js · Supabase</span>
            </div>
          </div>
        </Secao>

      </div>
    </div>
  );
}
