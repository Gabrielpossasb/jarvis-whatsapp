import { useRef } from "react";
import { NavLink } from "react-router-dom";
import logo from "../assets/logo-transparent.png";

const links = [
  { to: "/", icon: "💬", label: "Chat" },
  { to: "/tarefas", icon: "✅", label: "Tarefas" },
  { to: "/gastos", icon: "💰", label: "Lançamentos" },
  { to: "/financeiro", icon: "📊", label: "Financeiro" },
  { to: "/configuracoes", icon: "⚙️", label: "Configurações" },
];

const SWIPE_THRESHOLD = 60;

function NavLinks({ onNavigate, big }) {
  return (
    <nav className="flex flex-col gap-1 px-2">
      {links.map(({ to, icon, label }) => (
        <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
          tabIndex={-1}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${big ? "text-base" : "text-sm"}
            ${isActive ? "bg-[#1e1e2e] text-[#a78bfa] font-semibold" : "text-[#6a6a8a] hover:bg-[#1a1a26] hover:text-[#9a9ab8]"}`
          }>
          <span className={big ? "text-lg" : "text-base"}>{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function Sidebar({ open, onClose }) {
  const touchStartRef = useRef(null);

  function handleTouchStart(e) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchMove(e) {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (dx < -SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 2) {
      onClose();
      touchStartRef.current = null;
    }
  }

  function handleTouchEnd() {
    touchStartRef.current = null;
  }

  return (
    <>
      {/* Desktop: sempre visível */}
      <aside className="hidden md:flex md:w-52 bg-[#12121a] border-r border-[#1e1e2e] flex-col py-5 shrink-0">
        <div className="px-5 pb-5 border-b border-[#1e1e2e] mb-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="JARVIS" className="w-11 h-11 object-contain shrink-0" />
            <div>
              <div className="text-[#a78bfa] text-xs font-mono font-medium tracking-widest">JARVIS</div>
              <div className="text-[#4a4a6a] text-[10px] tracking-wider">ASSISTENTE PESSOAL</div>
            </div>
          </div>
        </div>
        <NavLinks />
      </aside>

      {/* Backdrop — começa abaixo do header compartilhado */}
      <div className="md:hidden fixed left-0 right-0 bottom-0 z-30 transition-opacity duration-300"
        style={{
          top: "var(--header-h, 56px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={onClose}>
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Drawer — sem container scrollável, começa exatamente abaixo do header */}
      <div
        className="md:hidden fixed left-0 right-0 bottom-0 z-30 bg-[#0f0f13] overflow-hidden transition-transform duration-300 ease-out"
        style={{
          top: "var(--header-h, 56px)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          pointerEvents: open ? "auto" : "none",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}>
        <div className="pt-4">
          <NavLinks onNavigate={onClose} big />
        </div>
      </div>
    </>
  );
}
