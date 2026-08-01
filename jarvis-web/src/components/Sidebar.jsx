import { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import logo from "../assets/logo-transparent.png";

const links = [
  { to: "/", icon: "💬", label: "Chat" },
  { to: "/tarefas", icon: "✅", label: "Tarefas" },
  { to: "/gastos", icon: "💰", label: "Lançamentos" },
  { to: "/financeiro", icon: "📊", label: "Financeiro" },
  { to: "/estoque", icon: "📦", label: "Estoque" },
  { to: "/faculdade", icon: "🎓", label: "Faculdade" },
  { to: "/configuracoes", icon: "⚙️", label: "Configurações" },
];

const SWIPE_THRESHOLD = 60;

function NavLinks({ onNavigate, big }) {
  const { pathname } = useLocation();

  function isActive(to) {
    if (to === "/") return pathname === "/";
    return pathname.startsWith(to);
  }

  return (
    <nav className="flex flex-col gap-1 px-2">
      {links.map(({ to, icon, label }) => (
        <Link key={to} to={to} onClick={onNavigate}
          tabIndex={-1}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${big ? "text-base" : "text-sm"}
            ${isActive(to) ? "bg-cinza-800 text-roxo-400 font-semibold" : "text-cinza-200 hover:bg-cinza-850 hover:text-cinza-300"}`}>
          <span className={big ? "text-lg" : "text-base"}>{icon}</span>
          <span>{label}</span>
        </Link>
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
      <aside className="hidden md:flex md:w-52 bg-cinza-900 border-r border-cinza-800 flex-col py-5 shrink-0">
        <div className="px-5 pb-5 border-b border-cinza-800 mb-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="JARVIS" className="w-11 h-11 object-contain shrink-0" />
            <div>
              <div className="text-roxo-400 text-xs font-mono font-medium tracking-widest">JARVIS</div>
              <div className="text-cinza-350 text-[10px] tracking-wider">ASSISTENTE PESSOAL</div>
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
        className="md:hidden fixed left-0 right-0 bottom-0 z-30 bg-cinza-950 overflow-hidden transition-transform duration-300 ease-out"
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
