import { NavLink } from "react-router-dom";
import logo from "../assets/logo-transparent.png";

const links = [
  { to: "/", icon: "💬", label: "Chat" },
  { to: "/tarefas", icon: "✅", label: "Tarefas" },
  { to: "/gastos", icon: "💰", label: "Lançamentos" },
  { to: "/financeiro", icon: "📊", label: "Financeiro" },
];

export default function Sidebar() {
  return (
    <aside className="w-14 md:w-52 bg-[#12121a] border-r border-[#1e1e2e] flex flex-col py-5 shrink-0">
      {/* Logo */}
      <div className="px-3 md:px-5 pb-5 border-b border-[#1e1e2e] mb-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="JARVIS" className="w-11 h-11 object-contain shrink-0" />
          <div className="hidden md:block">
            <div className="text-[#a78bfa] text-xs font-mono font-medium tracking-widest">JARVIS</div>
            <div className="text-[#4a4a6a] text-[10px] tracking-wider">ASSISTENTE PESSOAL</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-2 flex-1">
        {links.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150
              ${isActive ? "bg-[#1e1e2e] text-[#a78bfa] font-semibold" : "text-[#6a6a8a] hover:bg-[#1a1a26] hover:text-[#9a9ab8]"}`
            }>
            <span className="text-base">{icon}</span>
            <span className="hidden md:block">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
