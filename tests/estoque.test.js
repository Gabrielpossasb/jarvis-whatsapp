// Testes de processarContagemEstoque — atualização em massa do estoque.
// Erro silencioso aqui pode sobrescrever quantidades erradas sem aviso.

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
const { processarContagemEstoque } = require("../handlers/estoque");

// Mounts do builder Supabase para cada teste
let mockInsert;
let mockUpdate;
let mockUpdateEq;
let mockSelectEq;
let mockSelect;

function configurarMockSupabase(produtos) {
  mockInsert = jest.fn().mockResolvedValue({ error: null });
  mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
  mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq });
  mockSelectEq = jest.fn().mockResolvedValue({ data: produtos, error: null });
  mockSelect = jest.fn().mockReturnValue({ eq: mockSelectEq });

  supabase.from.mockImplementation((tabela) => {
    if (tabela === "estoque_produtos") return { select: mockSelect, update: mockUpdate };
    if (tabela === "estoque_movimentacoes") return { insert: mockInsert };
    return {};
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("processarContagemEstoque", () => {
  test("atualiza produto encontrado por nome exato e registra movimentação", async () => {
    const produtos = [{ id: "uuid-1", nome: "Morango", unidade: "kg", estoque_atual: 3 }];
    configurarMockSupabase(produtos);

    const itens = [{ nome: "Morango", quantidade: 5, unidade: "kg" }];
    const msg = await processarContagemEstoque(itens);

    expect(msg).toContain("Morango");
    expect(msg).toContain("1 produto");
    // Deve ter inserido 1 movimentação
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const movimentos = mockInsert.mock.calls[0][0];
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0].produto_id).toBe("uuid-1");
    expect(movimentos[0].quantidade).toBe(5);
    // Deve ter atualizado o estoque_atual
    expect(mockUpdate).toHaveBeenCalledWith({ estoque_atual: 5 });
  });

  test("informa produto não encontrado sem atualizar o banco", async () => {
    const produtos = [{ id: "uuid-1", nome: "Morango", unidade: "kg", estoque_atual: 3 }];
    configurarMockSupabase(produtos);

    const itens = [{ nome: "ProdutoInexistente", quantidade: 5, unidade: "kg" }];
    const msg = await processarContagemEstoque(itens);

    expect(msg).toContain("ProdutoInexistente");
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("não atualiza quando quantidade é igual ao estoque atual", async () => {
    const produtos = [{ id: "uuid-1", nome: "Morango", unidade: "kg", estoque_atual: 5 }];
    configurarMockSupabase(produtos);

    const itens = [{ nome: "Morango", quantidade: 5, unidade: "kg" }];
    const msg = await processarContagemEstoque(itens);

    expect(msg).toContain("sem alterações");
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("encontra produto via normalização de acentos", async () => {
    // "Açaí" no banco, "acai" na mensagem — normalizarNome resolve
    const produtos = [{ id: "uuid-2", nome: "Açaí", unidade: "kg", estoque_atual: 2 }];
    configurarMockSupabase(produtos);

    const itens = [{ nome: "acai", quantidade: 4, unidade: "kg" }];
    const msg = await processarContagemEstoque(itens);

    expect(msg).toContain("Açaí");
    expect(mockUpdate).toHaveBeenCalledWith({ estoque_atual: 4 });
  });

  test("retorna aviso quando nenhum produto está cadastrado", async () => {
    configurarMockSupabase(null); // simula banco vazio

    const itens = [{ nome: "Morango", quantidade: 5, unidade: "kg" }];
    const msg = await processarContagemEstoque(itens);

    expect(msg).toContain("Nenhum produto cadastrado");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
