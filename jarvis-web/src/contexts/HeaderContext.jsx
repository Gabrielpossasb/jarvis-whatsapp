import { useState } from "react";
import { HeaderCtx } from "./HeaderCtx";

export function HeaderProvider({ children }) {
  const [cfg, setCfg] = useState({ title: "", subtitle: "", right: null, secondRow: null });
  return <HeaderCtx.Provider value={{ cfg, setCfg }}>{children}</HeaderCtx.Provider>;
}
