import { test, expect } from "@playwright/test";

// Layout da página Polpa SH. Cobre o que quebra sem quebrar nada visível:
// estouro de largura, aba escondida fora do scroll, e a troca
// tabela ↔ cards por breakpoint.
//
// LEITURA APENAS — nenhum clique que grave. A página fala com o Supabase de
// produção; registrar uma movimentação aqui criaria estoque e lançamento
// financeiro reais.
//
// O app usa HashRouter, então a rota vem depois do "#". Sem isso a SPA cai
// no Chat e o teste passa medindo a página errada.
const ESTOQUE = "/#/estoque";

// Casadas por data-testid: o nome acessível do botão muda entre
// breakpoints (o emoji só aparece a partir de `sm`), então casar por texto
// quebraria em um dos dois projetos.
const ABAS = [
  { id: "estoque", nome: "Estoque" },
  { id: "historico", nome: "Histórico" },
  { id: "financeiro", nome: "Financeiro" },
  { id: "tabela", nome: "Tabela" },
];

/** Elementos cuja borda direita passa da largura do documento, ignorando os
 *  que estão dentro de um container com scroll horizontal intencional
 *  (as tiras de filtro usam overflow-x-auto de propósito). */
async function elementosEstourando(page) {
  return page.evaluate(() => {
    const limite = document.documentElement.clientWidth;
    const dentroDeScrollIntencional = el => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowX === "auto") return true;
      }
      return false;
    };
    return [...document.querySelectorAll("*")]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > limite + 1 && !dentroDeScrollIntencional(el);
      })
      .map(el => `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`);
  });
}

async function irParaEstoque(page) {
  await page.goto(ESTOQUE);
  // Espera a aba, não o título: "Polpa SH" aparece três vezes (link da
  // sidebar no desktop + título do header) e derrubaria o modo estrito.
  // A aba só existe depois que a página monta e chama setCfg.
  await expect(page.getByTestId("aba-estoque")).toBeVisible();
}

test.describe("Polpa SH — layout", () => {
  test("carrega a página certa (HashRouter)", async ({ page }) => {
    await irParaEstoque(page);
    // Se o hash fosse ignorado, cairia no Chat — a asserção abaixo é o
    // guarda contra os outros testes medirem a tela errada.
    await expect(page.getByText("Chat com JARVIS")).toHaveCount(0);
  });

  test("as quatro abas ficam acessíveis", async ({ page }) => {
    await irParaEstoque(page);
    for (const aba of ABAS) {
      await expect(page.getByTestId(`aba-${aba.id}`)).toBeVisible();
    }
  });

  for (const aba of ABAS) {
    test(`aba ${aba.nome} não estoura a largura`, async ({ page }) => {
      await irParaEstoque(page);
      await page.getByTestId(`aba-${aba.id}`).click();

      const estouros = await elementosEstourando(page);
      expect(estouros, `elementos além da largura em "${aba.nome}"`).toEqual([]);

      const rolaHorizontal = await page.evaluate(() => {
        const d = document.documentElement;
        return d.scrollWidth > d.clientWidth;
      });
      expect(rolaHorizontal, `a página rola horizontal em "${aba.nome}"`).toBe(false);
    });
  }

  test("aba Estoque lista produtos", async ({ page }) => {
    await irParaEstoque(page);
    // Depende dos dados reais do Supabase. Falhar aqui com base vazia é o
    // comportamento desejado: significa que a página não carregou.
    await expect(page.getByRole("button", { name: /Registrar venda de/ }).first()).toBeVisible();
  });

  test("não há erro no console", async ({ page }) => {
    const erros = [];
    page.on("console", m => m.type() === "error" && erros.push(m.text()));
    page.on("pageerror", e => erros.push(e.message));

    await irParaEstoque(page);
    for (const aba of ABAS) {
      await page.getByTestId(`aba-${aba.id}`).click();
    }
    expect(erros).toEqual([]);
  });
});

test.describe("aba Tabela troca de forma por breakpoint", () => {
  // A tabela de 6 colunas precisa de 620px; no celular ela viraria scroll
  // horizontal permanente, então abaixo de `sm` o mesmo dado vira card.
  test("celular mostra cards, não a grade", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular", "só no projeto celular");
    await irParaEstoque(page);
    await page.getByTestId("aba-tabela").click();

    await expect(page.getByText("PRODUTO", { exact: true })).toHaveCount(0);
    await expect(page.getByText("COMPRA", { exact: true }).first()).toBeVisible();
  });

  test("desktop mostra a grade com cabeçalho", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "só no projeto desktop");
    await irParaEstoque(page);
    await page.getByTestId("aba-tabela").click();

    await expect(page.getByText("PRODUTO", { exact: true })).toBeVisible();
    await expect(page.getByText("MARGEM", { exact: true })).toBeVisible();
  });
});
