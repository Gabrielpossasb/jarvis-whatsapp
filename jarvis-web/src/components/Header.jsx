import { useRef, useEffect } from "react";
import MenuButton from "./MenuButton";
import { useHeader } from "../contexts/HeaderContext";

export default function Header({ sidebarOpen, onMenuClick }) {
  const { cfg } = useHeader();
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const update = () => {
      document.documentElement.style.setProperty(
        "--header-h",
        `${ref.current.getBoundingClientRect().bottom}px`
      );
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="shrink-0 bg-[#0f0f13] border-b border-[#1e1e2e] z-40">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 gap-3">
        <div className="flex items-center gap-3">
          <MenuButton open={sidebarOpen} onClick={onMenuClick} />
          <div>
            <div className="text-base font-semibold">{cfg.title}</div>
            {cfg.subtitle && (
              <div className="text-xs text-[#4a4a6a] mt-0.5">{cfg.subtitle}</div>
            )}
          </div>
        </div>
        {cfg.right && (
          <div className="flex items-center gap-2 shrink-0">{cfg.right}</div>
        )}
      </div>
      {cfg.secondRow && <div className="px-4 pb-2">{cfg.secondRow}</div>}
    </div>
  );
}
