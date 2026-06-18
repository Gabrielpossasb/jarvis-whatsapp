import { useState, useRef, useEffect } from "react";

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL || "https://web-production-f30e8.up.railway.app";

export default function Chat({ messages, setMessages }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [preview, setPreview] = useState(null); // { base64, mimetype, name, isAudio }
  const chatRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  async function enviar() {
    if (preview) { enviarArquivo(preview.base64, preview.mimetype, preview.name); return; }
    if (!input.trim() || loading) return;
    const texto = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
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

  async function enviarArquivo(base64, mimetype, name) {
    setPreview(null);
    setMessages(m => [...m, {
      role: "user",
      text: input.trim() || name,
      attachment: { base64, mimetype, isAudio: mimetype.startsWith("audio/") },
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

  function onFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = ev => setPreview({
      base64: ev.target.result.split(",")[1],
      mimetype: file.type,
      name: file.name,
      isAudio: false,
    });
    reader.readAsDataURL(file);
  }

  async function toggleGravacao() {
    if (!recording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        const chunks = [];
        mr.ondataavailable = e => chunks.push(e.data);
        mr.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          const reader = new FileReader();
          reader.onload = ev => setPreview({
            base64: ev.target.result.split(",")[1],
            mimetype: "audio/webm",
            name: "audio.webm",
            isAudio: true,
          });
          reader.readAsDataURL(blob);
          stream.getTracks().forEach(t => t.stop());
        };
        mr.start();
        setMediaRecorder(mr);
        setRecording(true);
      } catch {
        alert("Não foi possível acessar o microfone.");
      }
    } else {
      mediaRecorder?.stop();
      setRecording(false);
    }
  }

  function formatarWhatsApp(texto) {
    return texto
      .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
      .replace(/_(.*?)_/g, "<em>$1</em>")
      .replace(/~~(.*?)~~/g, "<s>$1</s>")
      .replace(/\n/g, "<br/>");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-[#1e1e2e] flex items-center justify-between">
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
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6c5fff] to-[#a78bfa] flex items-center justify-center text-sm shrink-0 mt-1">🤖</div>
            )}
            <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed
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
              {m.attachment?.isAudio && (
                <audio
                  controls
                  className="mb-1 w-full max-w-[220px]"
                  src={`data:audio/webm;base64,${m.attachment.base64}`}
                />
              )}
              {m.attachment && !m.attachment.mimetype?.startsWith("image/") && !m.attachment.isAudio && (
                <div className="text-xs opacity-70 mb-1">📎 {m.text}</div>
              )}
              {(!m.attachment || m.attachment.mimetype?.startsWith("image/") || m.attachment.isAudio) && (
                <span dangerouslySetInnerHTML={{ __html: formatarWhatsApp(m.text) }} />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6c5fff] to-[#a78bfa] flex items-center justify-center text-sm">🤖</div>
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
      <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar border-t border-[#1e1e2e]">
        {["Tarefas de hoje", "Tarefas pendentes", "Gastos do mês"].map(s => (
          <button key={s} onClick={() => setInput(s)}
            className="text-xs px-3 py-1 rounded-full border border-[#2a2a3e] text-[#6a6a8a] hover:border-[#6c5fff] hover:text-[#a78bfa] transition-all whitespace-nowrap">
            {s}
          </button>
        ))}
      </div>

      {/* Preview de arquivo/áudio */}
      {preview && (
        <div className="px-4 py-2 border-t border-[#1e1e2e] flex items-center gap-3 bg-[#1a1a28]">
          {preview.isAudio
            ? <span className="text-xs text-[#a78bfa] flex-1">🎙️ Áudio gravado — pronto para enviar</span>
            : <span className="text-xs text-[#a78bfa] flex-1 truncate">📎 {preview.name}</span>}
          <button onClick={() => setPreview(null)} className="text-[#6a6a8a] hover:text-white text-xs shrink-0">✕</button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 flex gap-2 items-end"
           style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        {/* Anexar arquivo */}
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" hidden onChange={onFileChange} />
        <button onClick={() => fileRef.current?.click()} title="Anexar arquivo"
          className="text-[#6a6a8a] hover:text-[#a78bfa] shrink-0 p-2 transition-colors">
          📎
        </button>
        {/* Gravar áudio */}
        <button onClick={toggleGravacao} title={recording ? "Parar gravação" : "Gravar áudio"}
          className={`shrink-0 p-2 transition-colors ${recording ? "text-red-400 animate-pulse" : "text-[#6a6a8a] hover:text-[#a78bfa]"}`}>
          🎙️
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize(); }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder={preview ? (preview.isAudio ? "Legenda opcional..." : "Legenda opcional...") : "Como posso ajudar hoje?"}
          rows={1}
          style={{ maxHeight: "150px" }}
          className="flex-1 bg-[#1a1a28] border border-[#2a2a3e] rounded-xl px-4 py-2.5 text-[16px] text-[#e8e8f0] placeholder-[#4a4a6a] focus:outline-none focus:border-[#6c5fff] transition-colors resize-none overflow-y-auto leading-relaxed" />
        <button onClick={enviar} disabled={loading}
          className="px-4 py-2.5 bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-colors shrink-0">
          {preview ? "Enviar" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
