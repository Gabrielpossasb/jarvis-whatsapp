// Testes das funções puras de handlers/webhook.js — sem mocks de Supabase.
// Mocks dos serviços externos apenas para evitar erros de inicialização do módulo.

jest.mock("../services/supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("../services/pending-states", () => ({ obterEstado: jest.fn(), salvarEstado: jest.fn(), deletarEstado: jest.fn() }));
jest.mock("../services/evolution", () => ({ enviarMensagem: jest.fn(), baixarMidia: jest.fn() }));
jest.mock("../services/openai", () => ({
  extrairDados: jest.fn(), revisarCategorias: jest.fn(), transcreverAudio: jest.fn(),
  analisarImagem: jest.fn(), analisarPDF: jest.fn(), extrairExtratoTexto: jest.fn(),
  extrairExtrato: jest.fn(), extrairEventoFaculdadeIA: jest.fn(),
  extrairPlanoFaculdadeIA: jest.fn(), calcularMediaFaculdadeIA: jest.fn(),
}));
jest.mock("../services/tarefas", () => ({
  adicionarGasto: jest.fn(), adicionarTarefa: jest.fn(),
  buscarTarefasPorPeriodo: jest.fn(), buscarTodasTarefas: jest.fn(),
  buscarTarefasConcluidasHoje: jest.fn(), concluirTarefa: jest.fn(),
  concluirTarefaDoDia: jest.fn(), excluirTarefa: jest.fn(),
  alterarCategoriaTarefa: jest.fn(), alterarTarefa: jest.fn(),
}));
jest.mock("../services/categorias", () => ({
  getCategorias: jest.fn(), getListaCategorias: jest.fn(), adicionarCategoria: jest.fn(), getEmoji: jest.fn(),
}));
jest.mock("../utils/similarity", () => ({ encontrarSimilar: jest.fn() }));
jest.mock("../utils/coresFaculdade", () => ({ corParaDisciplina: jest.fn() }));

const { parsearContagemEstoque, normalizarNome } = require("../handlers/estoque");
const { datasNoIntervalo } = require("../handlers/faculdade");
const { formatarMsgExtrato } = require("../handlers/webhook");

// ─── parsearContagemEstoque ──────────────────────────────────────────────────

describe("parsearContagemEstoque", () => {
  test("parse linha com em-dash e unidade kg", () => {
    const resultado = parsearContagemEstoque("Morango — 5 kg");
    expect(resultado).toEqual([{ nome: "Morango", quantidade: 5, unidade: "kg" }]);
  });

  test("parse linha com hífen simples", () => {
    const resultado = parsearContagemEstoque("Açaí - 2.5 kg");
    expect(resultado).toEqual([{ nome: "Açaí", quantidade: 2.5, unidade: "kg" }]);
  });

  test("parse número com vírgula decimal", () => {
    const resultado = parsearContagemEstoque("Maracujá — 3,5 kg");
    expect(resultado).toEqual([{ nome: "Maracujá", quantidade: 3.5, unidade: "kg" }]);
  });

  test("parse sem unidade retorna unidade null", () => {
    const resultado = parsearContagemEstoque("Morango — 5");
    expect(resultado).toEqual([{ nome: "Morango", quantidade: 5, unidade: null }]);
  });

  test("parse múltiplas linhas", () => {
    const texto = "Morango — 5 kg\nAçaí - 2,5 kg\nMaracujá — 3";
    const resultado = parsearContagemEstoque(texto);
    expect(resultado).toHaveLength(3);
    expect(resultado[0].nome).toBe("Morango");
    expect(resultado[1].nome).toBe("Açaí");
    expect(resultado[2].nome).toBe("Maracujá");
  });

  test("ignora linhas sem separador", () => {
    const resultado = parsearContagemEstoque("texto qualquer sem número");
    expect(resultado).toEqual([]);
  });

  test("ignora linhas com texto após o número", () => {
    const resultado = parsearContagemEstoque("Produto inválido — abc");
    expect(resultado).toEqual([]);
  });

  test("aceita quantidade zero", () => {
    const resultado = parsearContagemEstoque("Morango — 0 kg");
    expect(resultado).toEqual([{ nome: "Morango", quantidade: 0, unidade: "kg" }]);
  });
});

// ─── normalizarNome ──────────────────────────────────────────────────────────

describe("normalizarNome", () => {
  test("remove acentos", () => {
    expect(normalizarNome("Açaí")).toBe("acai");
    expect(normalizarNome("Maracujá")).toBe("maracuja");
    expect(normalizarNome("Ação")).toBe("acao");
  });

  test("converte para minúsculas", () => {
    expect(normalizarNome("MORANGO")).toBe("morango");
  });

  test("remove espaços nas bordas", () => {
    expect(normalizarNome("  morango  ")).toBe("morango");
  });

  test("mantém espaços internos", () => {
    expect(normalizarNome("Acerola c/ Laranja")).toBe("acerola c/ laranja");
  });
});

// ─── datasNoIntervalo ────────────────────────────────────────────────────────

describe("datasNoIntervalo", () => {
  // 2024-01-01 é segunda-feira (getDay() === 1)
  test("retorna segunda-feira dentro do intervalo de uma semana", () => {
    const datas = datasNoIntervalo("2024-01-01", "2024-01-07", 1);
    expect(datas).toEqual(["2024-01-01"]);
  });

  test("retorna domingo (dia 0) dentro do intervalo", () => {
    // 2024-01-07 é domingo
    const datas = datasNoIntervalo("2024-01-01", "2024-01-07", 0);
    expect(datas).toEqual(["2024-01-07"]);
  });

  test("retorna vazio quando nenhuma data no intervalo bate o dia da semana", () => {
    // Intervalo de só 1 dia (segunda), pedindo terça (2)
    const datas = datasNoIntervalo("2024-01-01", "2024-01-01", 2);
    expect(datas).toEqual([]);
  });

  test("retorna múltiplas semanas corretamente", () => {
    // Terças em jan 2024: 2, 9, 16, 23, 30
    const datas = datasNoIntervalo("2024-01-01", "2024-01-31", 2);
    expect(datas).toEqual(["2024-01-02", "2024-01-09", "2024-01-16", "2024-01-23", "2024-01-30"]);
  });

  test("início igual ao fim com dia correspondente", () => {
    // 2024-01-03 é quarta (3)
    const datas = datasNoIntervalo("2024-01-03", "2024-01-03", 3);
    expect(datas).toEqual(["2024-01-03"]);
  });
});

// ─── formatarMsgExtrato ──────────────────────────────────────────────────────

describe("formatarMsgExtrato", () => {
  const transacoes = [
    { descricao: "Mercado", valor: 50.0, data: "2024-01-10", categoria: "Alimentação" },
    { descricao: "Gasolina", valor: 30.5, data: "2024-01-11", categoria: "Transporte" },
  ];

  test("inclui o título no início", () => {
    const msg = formatarMsgExtrato(transacoes, "Transações novas");
    expect(msg).toMatch(/^Transações novas/);
  });

  test("numera os itens sequencialmente", () => {
    const msg = formatarMsgExtrato(transacoes, "Título");
    expect(msg).toContain("*1.* Mercado");
    expect(msg).toContain("*2.* Gasolina");
  });

  test("exibe total correto no final", () => {
    const msg = formatarMsgExtrato(transacoes, "Título");
    expect(msg).toContain("R$ 80.50");
  });

  test("inclui categoria de cada transação", () => {
    const msg = formatarMsgExtrato(transacoes, "Título");
    expect(msg).toContain("Alimentação");
    expect(msg).toContain("Transporte");
  });

  test("funciona com lista vazia (total zero)", () => {
    const msg = formatarMsgExtrato([], "Vazio");
    expect(msg).toContain("R$ 0.00");
  });
});
