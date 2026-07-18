import { HashRouter, Routes, Route } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import { HeaderProvider } from "./contexts/HeaderContext";
import Chat from "./pages/Chat";
import Tarefas from "./pages/Tarefas";
import Gastos from "./pages/Gastos";
import Financeiro from "./pages/Financeiro";
import Configuracoes from "./pages/Configuracoes";

const EDGE_WIDTH = 24;
const SWIPE_THRESHOLD = 60;

export default function App() {
  const MENSAGEM_INICIAL = [{ role: "jarvis", text: "Olá, Gabriel! Como posso ajudar hoje? 🤖" }];
  const [chatMessages, setChatMessages] = useState(MENSAGEM_INICIAL);

  useEffect(() => {
    const handler = () => setChatMessages([...MENSAGEM_INICIAL]);
    window.addEventListener("jarvis:reset-chat", handler);
    return () => window.removeEventListener("jarvis:reset-chat", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const onMenuClick = () => setSidebarOpen(v => !v);
  const touchStartRef = useRef(null);

  function handleTouchStart(e) {
    if (sidebarOpen) return;
    const x = e.touches[0].clientX;
    if (x > EDGE_WIDTH) return;
    touchStartRef.current = { x, y: e.touches[0].clientY };
  }

  function handleTouchMove(e) {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (dx > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 2) {
      setSidebarOpen(true);
      touchStartRef.current = null;
    }
  }

  function handleTouchEnd() {
    touchStartRef.current = null;
  }

  return (
    <HashRouter>
      <HeaderProvider>
        <div className="flex h-dvh bg-[#0f0f13] text-[#e8e8f0] overflow-hidden"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif", paddingTop: "env(safe-area-inset-top)" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}>
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header sidebarOpen={sidebarOpen} onMenuClick={onMenuClick} />
            <main className="flex-1 flex flex-col overflow-hidden">
              <Routes>
                <Route path="/" element={<Chat messages={chatMessages} setMessages={setChatMessages} />} />
                <Route path="/tarefas" element={<Tarefas />} />
                <Route path="/gastos" element={<Gastos />} />
                <Route path="/financeiro" element={<Financeiro />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
              </Routes>
            </main>
          </div>
        </div>
      </HeaderProvider>
    </HashRouter>
  );
}
