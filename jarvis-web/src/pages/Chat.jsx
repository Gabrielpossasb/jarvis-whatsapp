import { useState, useRef, useEffect } from "react";
import logo from "../assets/logo-transparent.png";

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL || "https://web-production-f30e8.up.railway.app";

function MicIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}


export default function Chat({ messages, setMessages }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [preview, setPreview] = useState(null); // { base64, mimetype, name }
  const chatRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const pressStartRef = useRef(null);
  const holdTimerRef = useRef(null);
  const isHoldModeRef = useRef(false);
  const recordingRef = useRef(false);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }, [input]);

  async function enviar() {
    if (preview) { enviarArquivo(); return; }
    if (!input.trim() || loading) return;
    const texto = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: texto }]);
    setLoading(true);
    try {
      const res = await fetch(`${JARVIS_URL}/api/mensagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "jarvis", text: data.texto || "Não consegui processar." }]);
    } catch {
      setMessages(m => [...m, { role: "jarvis", text: "Erro ao conectar. Tente novamente." }]);
    }
    setLoading(false);
  }

  async function enviarArquivo() {
    if (!preview) return;
    const { base64, mimetype, name } = preview;
    setPreview(null);
    setMessages(m => [...m, {
      role: "user",
      text: input.trim() || name,
      attachment: { base64, mimetype },
    }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${JARVIS_URL}/api/mensagem/arquivo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimetype, texto: input.trim() }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "jarvis", text: data.texto || "Não consegui processar." }]);
    } catch {
      setMessages(m => [...m, { role: "jarvis", text: "Erro ao conectar. Tente novamente." }]);
    }
    setLoading(false);
  }

  async function transcreverAudioInput(base64) {
    setTranscrevendo(true);
    try {
      const res = await fetch(`${JARVIS_URL}/api/audio/transcrever`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimetype: "audio/webm" }),
      });
      const data = await res.json();
      if (data.texto) {
        setInput(data.texto);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    } catch {
      // silently ignore
    }
    setTranscrevendo(false);
  }

  async function iniciarGravacao() {
    if (recordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = ev => transcreverAudioInput(ev.target.result.split(",")[1]);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      recordingRef.current = true;
      setRecording(true);
    } catch {
      // mic not available or permission denied
    }
  }

  function pararGravacao() {
    if (!recordingRef.current) return;
    mediaRecorderRef.current?.stop();
    recordingRef.current = false;
    setRecording(false);
  }

  function handleMicClick() {
    if (recordingRef.current) pararGravacao();
    else iniciarGravacao();
  }

  // Mobile: toque curto = toggle, segurar = gravar enquanto segura
  function handleTouchStart(e) {
    e.preventDefault();
    pressStartRef.current = Date.now();
    isHoldModeRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      isHoldModeRef.current = true;
      iniciarGravacao();
    }, 350);
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    clearTimeout(holdTimerRef.current);
    if (isHoldModeRef.current) {
      pararGravacao();
    } else {
      handleMicClick();
    }
  }

  function onFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview({
      base64: ev.target.result.split(",")[1],
      mimetype: file.type,
      name: file.name,
    });
    reader.readAsDataURL(file);
  }

  function formatarWhatsApp(texto) {
    return texto
      .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
      .replace(/_(.*?)_/g, "<em>$1</em>")
      .replace(/~~(.*?)~~/g, "<s>$1</s>")
      .replace(/\n/g, "<br/>");
  }

  const placeholder = transcrevendo
    ? "Transcrevendo..."
    : preview
    ? "Legenda opcional..."
    : "Como posso ajudar hoje?";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-[#1e1e2e] flex items-center justify-between shrink-0">
        <div>
          <div className="text-base font-semibold">Chat com JARVIS</div>
          <div className="text-xs text-[#4a4a6a] mt-0.5">Texto, imagem, PDF e áudio</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400">Online</span>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-4 flex flex-col gap-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "jarvis" && (
              <img src={logo} alt="JARVIS" className="w-10 h-10 object-contain shrink-0 -mt-1" />
            )}
            <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed
              ${m.role === "user"
                ? "bg-gradient-to-br from-[#6c5fff] to-[#a78bfa] text-white rounded-br-sm"
                : "bg-[#1a1a28] text-[#c8c8e0] rounded-bl-sm"}`}>
              {m.attachment?.mimetype?.startsWith("image/") && (
                <img
                  src={`data:${m.attachment.mimetype};base64,${m.attachment.base64}`}
                  className="rounded-lg max-w-full mb-1"
                  alt="imagem"
                />
              )}
              {m.attachment && !m.attachment.mimetype?.startsWith("image/") && (
                <div className="text-xs opacity-70 mb-1">📎 {m.text}</div>
              )}
              {!m.attachment && (
                <span dangerouslySetInnerHTML={{ __html: formatarWhatsApp(m.text) }} />
              )}
              {m.attachment?.mimetype?.startsWith("image/") && m.text && (
                <div className="mt-1 text-xs opacity-80">{m.text}</div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <img src={logo} alt="JARVIS" className="w-10 h-10 object-contain" />
            <div className="bg-[#1a1a28] px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#6c5fff] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sugestões rápidas */}
      <div className="px-3 pt-2 pb-1 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {["Tarefas de hoje", "Tarefas pendentes", "Gastos do mês"].map(s => (
          <button key={s} onClick={() => setInput(s)}
            className="text-xs px-3 py-1 rounded-full border border-[#2a2a3e] text-[#6a6a8a] hover:border-[#6c5fff] hover:text-[#a78bfa] transition-all whitespace-nowrap shrink-0">
            {s}
          </button>
        ))}
      </div>

      {/* Input flutuante */}
      <div className="px-3 shrink-0" style={{ paddingBottom: "max(8px, calc(env(safe-area-inset-bottom) * 0.5))" }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.doc,.docx" hidden onChange={onFileChange} />

        {/* Card */}
        <div className="bg-[#1a1a28] border border-[#2a2a3e] rounded-3xl shadow-lg">

          {/* Preview de arquivo */}
          {preview && (
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[#2a2a3e]">
              <span className="text-xs text-[#a78bfa] flex-1 truncate">📎 {preview.name}</span>
              <button onClick={() => setPreview(null)} className="text-[#6a6a8a] hover:text-white text-xs shrink-0">✕</button>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder={placeholder}
            disabled={loading}
            rows={1}
            style={{ maxHeight: "150px" }}
            className="w-full bg-transparent px-4 pt-3 pb-2 text-[16px] text-[#e8e8f0] placeholder-[#4a4a6a] focus:outline-none resize-none overflow-y-auto leading-relaxed disabled:opacity-50"
          />

          {/* Barra de botões */}
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            {/* Botão "+" — abre seletor nativo */}
            <button
              onClick={() => { fileRef.current.value = ""; fileRef.current.click(); }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-[#6a6a8a] hover:bg-[#2a2a3e] hover:text-[#a78bfa] transition-colors text-2xl font-light leading-none select-none">
              +
            </button>

            <div className="flex-1" />

            {/* Botão microfone */}
            <button
              onClick={handleMicClick}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-all select-none
                ${recording ? "" : "text-[#6a6a8a] hover:bg-[#2a2a3e] hover:text-[#a78bfa]"}`}>
              {recording ? (
                <>
                  <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-40" />
                  <div className="absolute inset-0 rounded-full bg-red-500" />
                  <span className="relative z-10 text-white"><MicIcon size={18} /></span>
                </>
              ) : transcrevendo ? (
                <span className="text-[#a78bfa] animate-pulse"><MicIcon size={20} /></span>
              ) : (
                <MicIcon size={20} />
              )}
            </button>

            {/* Botão Enviar */}
            <button
              onClick={enviar}
              disabled={loading || transcrevendo}
              className="px-4 py-2 bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-50 rounded-2xl text-sm font-semibold text-white transition-colors ml-1">
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
