// Testes do financeiro do PSH. O foco é a apuração: um erro em qual custo
// entra no lucro faz o usuário tomar decisão de preço com número errado,
// e é justamente a parte que não aparece como "quebrado" na tela.

jest.mock("../services/supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("../services/pending-states", () => ({
  obterEstado: jest.fn(), salvarEstado: jest.fn(), deletarEstado: jest.fn(),
}));
jest.mock("../services/openai", () => ({ extrairComandoPSHIA: jest.fn() }));

const { supabase } = require("../services/supabase");
const { salvarEstado } = require("../services/pending-states");
const { processarComandoPSH, confirmarVendaPSH } = require("../handlers/psh");

const PRODUTOS = [
  { id: "p1", nome: "Goiaba", unidade: "kg", preco: 25, preco_compra: 15, estoque_atual: 10, estoque_atual_camara: 4 },
  { id: "p2", nome: "Açaí", unidade: "kg", preco: 35, preco_compra: 20, estoque_atual: 3, estoque_atual_camara: 0 },
  { id: "p3", nome: "Tamarindo", unidade: "kg", preco: 30, preco_compra: null, estoque_atual: 5, estoque_atual_camara: 0 },
];

beforeEach(() => {
  jest.clearAllMocks();
});

// Deixa `psh_lancamentos` responder com `lancs` a qualquer forma de query
// (com ou sem .eq/.gte encadeados), já que o handler monta a query de
// jeitos diferentes conforme o escopo da consulta.
function mockLancamentos(lancs) {
  const thenable = {
    select: jest.fn(() => thenable),
    eq: jest.fn(() => thenable),
    gte: jest.fn(() => thenable),
    insert: jest.fn().mockResolvedValue({ error: null }),
    then: (resolve) => resolve({ data: lancs, error: null }),
  };
  return thenable;
}

describe("consulta de resultado", () => {
  test("lucro usa o custo do que foi VENDIDO, não o das compras do mês", async () => {
    // Mês com um pedido grande: comprou R$ 3.000 e vendeu só 10kg.
    // Caixa fica negativo, mas o lucro tem que ser positivo — senão o
    // usuário acharia que está tendo prejuízo toda vez que faz pedido.
    const lancs = [
      { tipo: "venda", produto_id: "p1", quantidade: 10, valor: 250 },
      { tipo: "compra", produto_id: "p1", quantidade: 200, valor: 3000 },
      { tipo: "despesa", valor: 50 },
    ];
    supabase.from.mockImplementation(t =>
      t === "psh_lancamentos" ? mockLancamentos(lancs) : {});

    const r = await processarComandoPSH(
      { cmd: { modo: "consulta", escopo: "geral", periodo: "mes" }, produtos: PRODUTOS },
      "jid", "quanto lucrei?");

    // receita 250 − CMV (10 × 15 = 150) − despesas 50 = 50
    expect(r.texto).toContain("R$ 50,00");
    // caixa 250 − 3000 − 50 = −2800
    expect(r.texto).toContain("-R$ 2.800,00");
  });

  test("avisa quando uma venda é de produto sem preço de compra", async () => {
    const lancs = [{ tipo: "venda", produto_id: "p3", quantidade: 2, valor: 60 }];
    supabase.from.mockImplementation(t =>
      t === "psh_lancamentos" ? mockLancamentos(lancs) : {});

    const r = await processarComandoPSH(
      { cmd: { modo: "consulta", escopo: "geral", periodo: "mes" }, produtos: PRODUTOS },
      "jid", "quanto lucrei?");

    expect(r.texto).toMatch(/superestimado/i);
  });

  test("margem por produto é lucro ÷ preço de venda", async () => {
    supabase.from.mockImplementation(t =>
      t === "psh_lancamentos" ? mockLancamentos([]) : {});

    const r = await processarComandoPSH(
      { cmd: { modo: "consulta", escopo: "produto", produto: "Goiaba" }, produtos: PRODUTOS },
      "jid", "qual a margem da goiaba?");

    // (25 − 15) / 25 = 40%
    expect(r.texto).toContain("R$ 10,00");
    expect(r.texto).toContain("40.0%");
  });
});

describe("venda pelo chat", () => {
  test("não grava nada antes de confirmar — só guarda o estado", async () => {
    const r = await processarComandoPSH(
      { cmd: { modo: "venda", itens: [{ produto: "Goiaba", quantidade: 5 }], cliente: "Maria" }, produtos: PRODUTOS },
      "jid", "vendi 5kg de goiaba pra maria");

    expect(supabase.from).not.toHaveBeenCalled();
    expect(salvarEstado).toHaveBeenCalledWith("jid", "venda_psh", expect.objectContaining({
      cliente: "Maria",
      itens: [expect.objectContaining({ produto_id: "p1", quantidade: 5 })],
    }));
    expect(r.texto).toContain("R$ 125,00"); // 5 × 25
    expect(r.opcoes.botoes).toHaveLength(2);
  });

  test("avisa quando a quantidade vendida passa do saldo do freezer", async () => {
    const r = await processarComandoPSH(
      { cmd: { modo: "venda", itens: [{ produto: "Açaí", quantidade: 8 }], cliente: null }, produtos: PRODUTOS },
      "jid", "vendi 8kg de açaí");

    expect(r.texto).toMatch(/insuficiente/i);
  });

  test("confirmação grava a movimentação e baixa o estoque", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq: updateEq }));
    supabase.from.mockImplementation(t => {
      if (t === "estoque_movimentacoes") return { insert };
      if (t === "estoque_produtos") return { update };
      return {};
    });

    const msg = await confirmarVendaPSH({
      itens: [{ produto_id: "p1", nome: "Goiaba", unidade: "kg", quantidade: 5, preco: 25, estoque_atual: 10 }],
      cliente: "Maria",
    });

    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      produto_id: "p1", tipo: "venda", quantidade: 5, local: "freezer", pessoa: "Maria",
    })]);
    // Nenhum insert em psh_lancamentos: a receita nasce do trigger no banco.
    expect(supabase.from).not.toHaveBeenCalledWith("psh_lancamentos");
    expect(update).toHaveBeenCalledWith({ estoque_atual: 5 });
    expect(msg).toContain("R$ 125,00");
  });
});

describe("estoque negativo", () => {
  // Vender antes de registrar a transferência da câmara é rotina. Se o
  // saldo fosse truncado em 0, a transferência seguinte somaria em cima de
  // um número errado e o estoque nunca fecharia.
  test("venda além do saldo deixa o freezer negativo, sem truncar em zero", async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq: updateEq }));
    supabase.from.mockImplementation(t => {
      if (t === "estoque_movimentacoes") return { insert: jest.fn().mockResolvedValue({ error: null }) };
      if (t === "estoque_produtos") return { update };
      return {};
    });

    const msg = await confirmarVendaPSH({
      itens: [{ produto_id: "p2", nome: "Açaí", unidade: "kg", quantidade: 8, preco: 35, estoque_atual: 3 }],
      cliente: null,
    });

    expect(update).toHaveBeenCalledWith({ estoque_atual: -5 });
    expect(msg).toContain("-5");
    expect(msg).toMatch(/falta transferir da câmara/i);
  });
});

describe("transferência pelo chat", () => {
  function mockEstoque() {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq: updateEq }));
    supabase.from.mockImplementation(t => {
      if (t === "estoque_movimentacoes") return { insert };
      if (t === "estoque_produtos") return { update };
      return {};
    });
    return { insert, update };
  }

  test("move o saldo entre os dois locais e grava a movimentação", async () => {
    const { insert, update } = mockEstoque();

    const r = await processarComandoPSH(
      { cmd: { modo: "transferencia", itens: [{ produto: "Goiaba", quantidade: 3 }] }, produtos: PRODUTOS },
      "jid", "transferi 3kg de goiaba da câmara pro freezer");

    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      produto_id: "p1", tipo: "transferencia", quantidade: 3, local: "freezer",
    })]);
    // Goiaba: freezer 10 → 13, câmara 4 → 1
    expect(update).toHaveBeenCalledWith({ estoque_atual: 13, estoque_atual_camara: 1 });
    expect(r.texto).toMatch(/Transferência registrada/i);
  });

  test("não gera lançamento financeiro — transferência não movimenta dinheiro", async () => {
    mockEstoque();

    await processarComandoPSH(
      { cmd: { modo: "transferencia", itens: [{ produto: "Goiaba", quantidade: 3 }] }, produtos: PRODUTOS },
      "jid", "transferi 3kg de goiaba");

    expect(supabase.from).not.toHaveBeenCalledWith("psh_lancamentos");
  });

  test("recusa quando a câmara não tem saldo, sem gravar nada", async () => {
    const { insert, update } = mockEstoque();

    const r = await processarComandoPSH(
      { cmd: { modo: "transferencia", itens: [{ produto: "Goiaba", quantidade: 99 }] }, produtos: PRODUTOS },
      "jid", "transferi 99kg de goiaba");

    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(r.texto).toMatch(/câmara fria não tem esse saldo/i);
    expect(r.texto).toMatch(/registre a entrada na câmara primeiro/i);
  });

  test("sinaliza quando a transferência regulariza um freezer negativo", async () => {
    mockEstoque();
    const negativado = PRODUTOS.map(p => p.id === "p1" ? { ...p, estoque_atual: -2 } : p);

    const r = await processarComandoPSH(
      { cmd: { modo: "transferencia", itens: [{ produto: "Goiaba", quantidade: 4 }] }, produtos: negativado },
      "jid", "transferi 4kg de goiaba");

    expect(r.texto).toMatch(/saldo regularizado/i);
  });
});

describe("preço", () => {
  test("atualizar preço de compra recalcula a margem na resposta", async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq: updateEq }));
    supabase.from.mockImplementation(t => t === "estoque_produtos" ? { update } : {});

    const r = await processarComandoPSH(
      { cmd: { modo: "preco", produto: "Goiaba", campo: "compra", valor: 18 }, produtos: PRODUTOS },
      "jid", "a goiaba subiu pra 18 na compra");

    expect(update).toHaveBeenCalledWith({ preco_compra: 18 });
    // venda 25, compra 18 → lucro 7, margem 28%
    expect(r.texto).toContain("R$ 7,00");
    expect(r.texto).toContain("28.0%");
  });

  test("produto sem preço de compra não finge margem", async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq: updateEq }));
    supabase.from.mockImplementation(t => t === "estoque_produtos" ? { update } : {});

    const r = await processarComandoPSH(
      { cmd: { modo: "preco", produto: "Tamarindo", campo: "venda", valor: 32 }, produtos: PRODUTOS },
      "jid", "vou vender tamarindo a 32");

    expect(r.texto).toMatch(/Falta cadastrar o preço de compra/i);
  });
});

describe("despesa", () => {
  test("lança na tabela do PSH, nunca na tabela de gastos pessoais", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    supabase.from.mockImplementation(t => t === "psh_lancamentos" ? { insert } : {});

    const r = await processarComandoPSH(
      { cmd: { modo: "despesa", valor: 80, descricao: "gasolina da entrega", categoria: "Combustível" }, produtos: PRODUTOS },
      "jid", "gastei 80 de gasolina");

    expect(supabase.from).toHaveBeenCalledWith("psh_lancamentos");
    expect(supabase.from).not.toHaveBeenCalledWith("gastos");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ tipo: "despesa", valor: 80 }));
    expect(r.texto).toContain("R$ 80,00");
  });
});

describe("nao_suportado", () => {
  test("guarda o contexto pra reprocessar a resposta seguinte", async () => {
    const r = await processarComandoPSH(
      { cmd: { modo: "nao_suportado", motivo: "não identifiquei o produto" }, produtos: PRODUTOS },
      "jid", "vendi umas coisas");

    expect(salvarEstado).toHaveBeenCalledWith("jid", "esclarecimento",
      expect.objectContaining({ tipoOrigem: "psh", textoOriginal: "vendi umas coisas" }));
    expect(r.texto).toContain("não identifiquei o produto");
  });
});
