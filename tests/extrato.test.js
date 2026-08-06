// Testes de verificarDuplicatasExtrato — lógica crítica: bug aqui = dado financeiro duplicado no banco.

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

const { supabase } = require("../services/supabase");
const { verificarDuplicatasExtrato } = require("../handlers/webhook");

// Helper: configura o mock do supabase para retornar gastos existentes
function mockGastosExistentes(gastos) {
  supabase.from.mockReturnValue({
    select: jest.fn().mockResolvedValue({ data: gastos, error: null }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("verificarDuplicatasExtrato", () => {
  test("classifica como nova quando banco está vazio", async () => {
    mockGastosExistentes([]);
    const transacoes = [{ descricao: "Mercado", valor: 50, data: "2024-01-15", mes: "Janeiro" }];
    const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
    expect(novas).toHaveLength(1);
    expect(duplicatas).toHaveLength(0);
  });

  test("detecta duplicata quando descrição e valor são iguais no mesmo mês", async () => {
    mockGastosExistentes([
      { descricao: "Mercado", valor: 50, data: "2024-01-15", mes: "Janeiro" },
    ]);
    const transacoes = [{ descricao: "Mercado", valor: 50, data: "2024-01-15", mes: "Janeiro" }];
    const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
    expect(novas).toHaveLength(0);
    expect(duplicatas).toHaveLength(1);
  });

  test("não é duplicata quando mês é diferente", async () => {
    mockGastosExistentes([
      { descricao: "Mercado", valor: 50, data: "2024-01-15", mes: "Janeiro" },
    ]);
    const transacoes = [{ descricao: "Mercado", valor: 50, data: "2024-02-15", mes: "Fevereiro" }];
    const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
    expect(novas).toHaveLength(1);
    expect(duplicatas).toHaveLength(0);
  });

  test("não é duplicata quando valor difere em mais de R$0,01", async () => {
    mockGastosExistentes([
      { descricao: "Mercado", valor: 50.00, data: "2024-01-15", mes: "Janeiro" },
    ]);
    const transacoes = [{ descricao: "Mercado", valor: 50.02, data: "2024-01-15", mes: "Janeiro" }];
    const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
    expect(novas).toHaveLength(1);
    expect(duplicatas).toHaveLength(0);
  });

  test("detecta duplicata via prefixo de 15 chars quando descrição >= 10 chars", async () => {
    // Banco tem "pagamento cartao nubank dezembro"
    // Extrato traz "pagamento cartao nubank novembro" — mesmo prefixo de 15 chars
    mockGastosExistentes([
      { descricao: "pagamento cartao nubank dezembro", valor: 100, data: "2024-01-10", mes: "Janeiro" },
    ]);
    const transacoes = [
      { descricao: "pagamento cartao nubank novembro", valor: 100, data: "2024-01-10", mes: "Janeiro" },
    ];
    const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
    expect(novas).toHaveLength(0);
    expect(duplicatas).toHaveLength(1);
  });

  test("não usa prefixo para descrições curtas (< 10 chars)", async () => {
    // "Merc" (4 chars) e "Merc novo" (9 chars) — ambas < 10, só igualdade exata vale
    mockGastosExistentes([
      { descricao: "Mercado", valor: 100, data: "2024-01-10", mes: "Janeiro" },
    ]);
    const transacoes = [
      { descricao: "Mercado Extra", valor: 100, data: "2024-01-10", mes: "Janeiro" },
    ];
    const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
    // "Mercado" (7 chars) < 10, então não usa prefixo — não é duplicata
    expect(novas).toHaveLength(1);
    expect(duplicatas).toHaveLength(0);
  });

  test("separa corretamente novas e duplicatas em lote misto", async () => {
    mockGastosExistentes([
      { descricao: "Mercado", valor: 50, data: "2024-01-15", mes: "Janeiro" },
    ]);
    const transacoes = [
      { descricao: "Mercado", valor: 50, data: "2024-01-15", mes: "Janeiro" },   // duplicata
      { descricao: "Gasolina", valor: 80, data: "2024-01-16", mes: "Janeiro" },  // nova
    ];
    const { novas, duplicatas } = await verificarDuplicatasExtrato(transacoes);
    expect(novas).toHaveLength(1);
    expect(novas[0].descricao).toBe("Gasolina");
    expect(duplicatas).toHaveLength(1);
    expect(duplicatas[0].descricao).toBe("Mercado");
  });
});
