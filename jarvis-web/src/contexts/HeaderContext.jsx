import { createContext, useContext, useState } from "react";

const Ctx = createContext(null);

export function HeaderProvider({ children }) {
  const [cfg, setCfg] = useState({ title: "", subtitle: "", right: null, secondRow: null });
  return <Ctx.Provider value={{ cfg, setCfg }}>{children}</Ctx.Provider>;
}

export function useHeader() { return useContext(Ctx); }
