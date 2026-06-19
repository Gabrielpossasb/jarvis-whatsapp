export default function MenuButton({ onClick }) {
  return (
    <button onClick={onClick} className="md:hidden text-[#a78bfa] p-1 -ml-1 shrink-0">
      <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
