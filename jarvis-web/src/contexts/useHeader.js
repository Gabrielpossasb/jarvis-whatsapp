import { useContext } from "react";
import { HeaderCtx } from "./HeaderCtx";

export function useHeader() {
  return useContext(HeaderCtx);
}
