export default function MenuButton({ open, onClick }) {
  return (
    <button onClick={onClick} className="md:hidden text-[#a78bfa] p-2 -ml-2 shrink-0">
      {open ? (
        <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
    </button>
  );
}
