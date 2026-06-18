import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL || "https://web-production-f30e8.up.railway.app";

export default function Chat({ messages, setMessages }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);
  const textareaRef = useRef(null);

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
      const resposta = data.texto || "Não consegui processar.";
      setMessages(m => [...m, { role: "jarvis", text: resposta }]);
    } catch {
      setMessages(m => [...m, { role: "jarvis", text: "Erro ao conectar. Tente novamente." }]);
    }
    setLoading(false);
  }

  function formatarWhatsApp(texto) {
    return texto
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<s>$1</s>')
      .replace(/\n/g, '<br/>');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-[#1e1e2e] flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">Chat com JARVIS</div>
          <div className="text-xs text-[#4a4a6a] mt-0.5">Mesmas funcionalidades do WhatsApp</div>
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
            <div className={`max-w-[65%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed
              ${m.role === "user"
                ? "bg-gradient-to-br from-[#6c5fff] to-[#a78bfa] text-white rounded-br-sm"
                : "bg-[#1a1a28] text-[#c8c8e0] rounded-bl-sm"}`}>
              <span dangerouslySetInnerHTML={{ __html: formatarWhatsApp(m.text) }} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6c5fff] to-[#a78bfa] flex items-center justify-center text-sm">🤖</div>
            <div className="bg-[#1a1a28] px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#6c5fff] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sugestões rápidas */}
      <div className="px-4 py-2 flex gap-2 flex-wrap border-t border-[#1e1e2e] overflow-x-auto">
        {["Tarefas de hoje", "Tarefas pendentes", "Gastos do mês"].map(s => (
          <button key={s} onClick={() => { setInput(s); }}
            className="text-xs px-3 py-1 rounded-full border border-[#2a2a3e] text-[#6a6a8a] hover:border-[#6c5fff] hover:text-[#a78bfa] transition-all">
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 flex gap-3 items-end"
           style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize(); }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Ex: adicionar reunião amanhã às 14h, gastei 50 no almoço..."
          rows={1}
          style={{ maxHeight: "150px" }}
          className="flex-1 bg-[#1a1a28] border border-[#2a2a3e] rounded-xl px-4 py-2.5 text-[16px] text-[#e8e8f0] placeholder-[#4a4a6a] focus:outline-none focus:border-[#6c5fff] transition-colors resize-none overflow-y-auto leading-relaxed" />
        <button onClick={enviar} disabled={loading}
          className="px-5 py-2.5 bg-[#6c5fff] hover:bg-[#7c6fff] disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-colors shrink-0">
          Enviar
        </button>
      </div>
    </div>
  );
}
