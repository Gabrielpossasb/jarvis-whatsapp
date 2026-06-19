import { HashRouter, Routes, Route } from "react-router-dom";
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Chat from "./pages/Chat";
import Tarefas from "./pages/Tarefas";
import Gastos from "./pages/Gastos";
import Financeiro from "./pages/Financeiro";

export default function App() {
  const [chatMessages, setChatMessages] = useState([
    { role: "jarvis", text: "Olá, Gabriel! Como posso ajudar hoje? 🤖" }
  ]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const onMenuClick = () => setSidebarOpen(true);

  return (
    <HashRouter>
      <div className="flex h-dvh bg-[#0f0f13] text-[#e8e8f0] overflow-hidden"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif", paddingTop: "env(safe-area-inset-top)" }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<Chat messages={chatMessages} setMessages={setChatMessages} onMenuClick={onMenuClick} />} />
            <Route path="/tarefas" element={<Tarefas onMenuClick={onMenuClick} />} />
            <Route path="/gastos" element={<Gastos onMenuClick={onMenuClick} />} />
            <Route path="/financeiro" element={<Financeiro onMenuClick={onMenuClick} />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}