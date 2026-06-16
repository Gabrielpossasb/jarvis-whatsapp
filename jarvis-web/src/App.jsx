import { BrowserRouter, Routes, Route } from "react-router-dom";
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

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-[#0f0f13] text-[#e8e8f0] overflow-hidden"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<Chat messages={chatMessages} setMessages={setChatMessages} />} />
            <Route path="/tarefas" element={<Tarefas />} />
            <Route path="/gastos" element={<Gastos />} />
            <Route path="/financeiro" element={<Financeiro />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}