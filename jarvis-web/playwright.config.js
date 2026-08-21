import { defineConfig } from "@playwright/test";

// Testes de layout do frontend. São de LEITURA APENAS: navegam, medem e
// conferem, mas nunca clicam em nada que grave — a página fala com o
// Supabase de produção, e um clique em "Registrar" criaria movimentação de
// estoque e lançamento financeiro de verdade (ver o trigger em
// migrations/010_psh_financeiro.sql).
export default defineConfig({
  testDir: "./e2e",
  // Sem retry: teste de layout que passa na segunda tentativa está
  // escondendo uma corrida, não sendo resiliente.
  retries: 0,
  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:5173",
    // Usa o Chrome instalado na máquina em vez de baixar um Chromium
    // próprio (~120MB) — o app não depende de engine específica.
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  // Sobe o vite sozinho e espera a porta responder. reuseExistingServer
  // evita conflito quando já há um `npm run dev` aberto.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },

  // Viewport explícito em vez de um preset de device: os presets de iPhone
  // rodam em WebKit, que não aceita `channel: "chrome"`. 390x844 é o
  // tamanho que motivou o ajuste de responsividade.
  projects: [
    {
      name: "celular",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
