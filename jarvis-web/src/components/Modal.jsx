import { useState, useEffect } from "react";

const DURACAO = 200; // ms — precisa bater com as classes duration-200 abaixo

// Modal com animação de abrir/fechar (fade + scale), sem depender de lib externa.
// Mantém o card montado durante a saída pra transição rodar antes de sumir do DOM.
export default function Modal({ open, onClose, children, align = "center" }) {
  const [montado, setMontado] = useState(open);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        setMontado(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setVisivel(true)));
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setVisivel(false);
      setTimeout(() => setMontado(false), DURACAO);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!montado) return null;

  return (
    <div className={`fixed inset-0 z-50 flex ${align === "bottom" ? "items-end sm:items-center" : "items-center"} justify-center p-4`}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${visivel ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full transition-all duration-200 ease-out ${
          visivel ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-3"
        }`}>
        {children}
      </div>
    </div>
  );
}
