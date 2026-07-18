import { useState, useEffect, useRef } from "react";
import { useHeader } from "../contexts/HeaderContext";

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL || "https://web-production-f30e8.up.railway.app";
const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

const PLATAFORMAS = [
  { icon: "🚂", label: "Railway",  url: "https://railway.com/dashboard" },
  { icon: "⚡", label: "Supabase", url: "https://supabase.com/dashboard/project/pbfcidkwidnfpegonhfk" },
  { icon: "▲",  label: "Vercel",   url: "https://vercel.com/dashboard" },
];

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

export default function Configuracoes() {
  const { setCfg } = useHeader();
  const [pushStatus, setPushStatus] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const [uso, setUso] = useState(null);
  const [loadingUso, setLoadingUso] = useState(true);
  const [modal, setModal] = useState(null);
  const oneSignalRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCfg({ title: "Configurações", subtitle: "Gerenciar app e integrações", right: null, secondRow: null });
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
  }, []);

  async function ativarNotificacoes() {
    if (!oneSignalRef.current) {
      setModal({ titulo: "Aguarde", corpo: "Notificações ainda carregando, tente novamente em instantes." });
      return;
    }
    const isPWA = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (!isPWA) {
      setModal({
        titulo: "Adicione à tela de início",
        corpo: "Para ativar notificações no iPhone, adicione o JARVIS à tela de início:\n\nSafari → Compartilhar → \"Adicionar à Tela de Início\"\n\nDepois abra o app de lá.",
      });
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

  return (
    <div className="flex flex-col h-full">

      {/* Modal */}
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

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 flex flex-col gap-6">

        {/* Notificações */}
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

        {/* Uso */}
        <Secao titulo="Uso este mês">

          {/* OpenAI */}
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

          {/* Links de plataformas */}
          <div className="grid grid-cols-3 gap-2">
            {PLATAFORMAS.map(({ icon, label, url }) => (
              <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                className="bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-3 flex flex-col items-center gap-1.5
                  hover:border-[#6c5fff44] hover:bg-[#1e1e30] transition-all active:scale-95">
                <span className="text-xl">{icon}</span>
                <span className="text-xs text-[#c8c8e0] font-medium">{label}</span>
                <span className="text-[10px] text-[#4a4a6a]">Dashboard ↗</span>
              </a>
            ))}
          </div>
        </Secao>

      </div>
    </div>
  );
}
