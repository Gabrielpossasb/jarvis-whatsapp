/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fundos e bordas — mesmos tons de sempre, só nomeados
        cinza: {
          950: "#0f0f13", // fundo raiz do app
          900: "#13131e", // fundo de painel/seção
          850: "#1a1a28", // fundo de card / hover
          800: "#1e1e2e", // fundo de card alternativo
          700: "#2a2a3e", // borda padrão
          600: "#3a3a50", // borda clara / hover
          // Tons claros — usados como texto secundário/terciário. Também usados para
          // clarear textos que antes usavam tons escuros demais (baixo contraste).
          350: "#8a8aaa",
          300: "#9a9ab8",
          200: "#c8c8e0",
          100: "#d8d8f0",
          50: "#e8e8f0", // texto principal
        },
        roxo: {
          900: "#5b4de8", // hover do accent principal
          700: "#6c5fff", // accent principal
          600: "#7c6fff", // variação/hover do accent
          400: "#a78bfa", // accent claro / lavanda
        },
      },
    },
  },
  plugins: [],
}