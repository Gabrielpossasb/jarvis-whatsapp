import { NavLink } from "react-router-dom";
import logo from "../assets/logo-transparent.png";

const links = [
  { to: "/", icon: "💬", label: "Chat" },
  { to: "/tarefas", icon: "✅", label: "Tarefas" },
  { to: "/gastos", icon: "💰", label: "Lançamentos" },
  { to: "/financeiro", icon: "📊", label: "Financeiro" },
];

function NavLinks({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1 px-2 flex-1">
      {links.map(({ to, icon, label }) => (
        <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 md:py-2.5 rounded-lg text-base md:text-sm transition-all duration-150
            ${isActive ? "bg-[#1e1e2e] text-[#a78bfa] font-semibold" : "text-[#6a6a8a] hover:bg-[#1a1a26] hover:text-[#9a9ab8]"}`
          }>
          <span className="text-lg md:text-base">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function Sidebar({ open, onClose }) {
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

      {/* Mobile: drawer full-screen */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="absolute inset-0 bg-[#12121a] flex flex-col py-5">
            <div className="px-4 pb-5 border-b border-[#1e1e2e] mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={logo} alt="JARVIS" className="w-11 h-11 object-contain shrink-0" />
                <div>
                  <div className="text-[#a78bfa] text-xs font-mono font-medium tracking-widest">JARVIS</div>
                  <div className="text-[#4a4a6a] text-[10px] tracking-wider">ASSISTENTE PESSOAL</div>
                </div>
              </div>
              <button onClick={onClose} className="text-[#6a6a8a] hover:text-white p-2 text-xl leading-none">
                ✕
              </button>
            </div>
            <NavLinks onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
