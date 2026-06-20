import { HashRouter, Routes, Route } from "react-router-dom";
import { useState, useRef } from "react";
import Sidebar from "./components/Sidebar";
import Chat from "./pages/Chat";
import Tarefas from "./pages/Tarefas";
import Gastos from "./pages/Gastos";
import Financeiro from "./pages/Financeiro";

const EDGE_WIDTH = 24;
const SWIPE_THRESHOLD = 60;

export default function App() {
  const [chatMessages, setChatMessages] = useState([
    { role: "jarvis", text: "Olá, Gabriel! Como posso ajudar hoje? 🤖" }
  ]);
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
      <div className="flex h-dvh bg-[#0f0f13] text-[#e8e8f0] overflow-hidden"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif", paddingTop: "env(safe-area-inset-top)" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<Chat messages={chatMessages} setMessages={setChatMessages} sidebarOpen={sidebarOpen} onMenuClick={onMenuClick} />} />
            <Route path="/tarefas" element={<Tarefas sidebarOpen={sidebarOpen} onMenuClick={onMenuClick} />} />
            <Route path="/gastos" element={<Gastos sidebarOpen={sidebarOpen} onMenuClick={onMenuClick} />} />
            <Route path="/financeiro" element={<Financeiro sidebarOpen={sidebarOpen} onMenuClick={onMenuClick} />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
