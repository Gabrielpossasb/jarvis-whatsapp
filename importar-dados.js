// importar-dados.js
// Roda uma vez para importar os dados históricos da planilha para o Supabase
// Execute: node importar-dados.js

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const dados = {
  "Maio": {
    "fixas": [
      { data: "09/mai", descricao: "SPOTIFY", valor: 40.9, meio_pagamento: "Nubank", categoria: "Assinaturas", tipo: "fixa", mes: "Maio" },
      { data: "15/mai", descricao: "FATURA NUBANK", valor: 179.29, meio_pagamento: "Nubank", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "11/mai", descricao: "EMPRESTIMO-5/6", valor: 134.12, meio_pagamento: "Nubank", categoria: "Dívidas/Empréstimo", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "MERCADO LIVRE-1/6", valor: 34.84, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "MERCADO LIVRE-1/5", valor: 44.18, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "MERCADO LIVRE-2/3", valor: 30.31, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "MERCADO LIVRE-2/3 (b)", valor: 28.36, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "MERCADO LIVRE-2/6", valor: 30.16, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "MERCADO LIVRE-3/9", valor: 95.44, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "MERCADO LIVRE-5/6", valor: 29.41, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "CHEERS-1/2", valor: 60.5, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "SHOPEE-2/2", valor: 39.49, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "SHOPEE-3/3", valor: 50.61, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "HOSTGATOR-2/3", valor: 35.38, meio_pagamento: "Mercado Pago", categoria: "Assinaturas", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "CURSO-3/3", valor: 16.77, meio_pagamento: "Mercado Pago", categoria: "Assinaturas", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "EMPRESTIMO ANA-3/6", valor: 316.66, meio_pagamento: "Mercado Pago", categoria: "Dívidas/Empréstimo", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "EMPRESTIMO ANA-5/5", valor: 80.0, meio_pagamento: "Mercado Pago", categoria: "Dívidas/Empréstimo", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "GAZIN-6/8", valor: 73.73, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "PARCELA FATURA-5/6", valor: 492.68, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "PARCELA FATURA-6/6", valor: 373.58, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "IFOOD", valor: 5.95, meio_pagamento: "Mercado Pago", categoria: "Alimentação", tipo: "fixa", mes: "Maio" },
      { data: "10/mai", descricao: "AMAZON", valor: 19.9, meio_pagamento: "Mercado Pago", categoria: "Cartão/Fatura", tipo: "fixa", mes: "Maio" },
    ],
    "variaveis": [
      { data: "09/mai", descricao: "TRANSPOTE", valor: 64.33, meio_pagamento: "Nubank", categoria: "Transporte", tipo: "variavel", mes: "Maio" },
      { data: "09/mai", descricao: "IFOOD, COMIDA", valor: 50.0, meio_pagamento: "Nubank", categoria: "Alimentação", tipo: "variavel", mes: "Maio" },
      { data: "09/mai", descricao: "MERCADO", valor: 29.98, meio_pagamento: "Nubank", categoria: "Alimentação", tipo: "variavel", mes: "Maio" },
      { data: "09/mai", descricao: "AMORZINHO", valor: 240.0, meio_pagamento: "Nubank", categoria: "Relacionamento", tipo: "variavel", mes: "Maio" },
      { data: "09/mai", descricao: "PRESENTA MAE", valor: 141.42, meio_pagamento: "Nubank", categoria: "Presentes", tipo: "variavel", mes: "Maio" },
      { data: "09/mai", descricao: "RELOJOALIA", valor: 20.0, meio_pagamento: "Nubank", categoria: "Presentes", tipo: "variavel", mes: "Maio" },
      { data: "13/mai", descricao: "GUI", valor: 60.0, meio_pagamento: "Nubank", categoria: "Relacionamento", tipo: "variavel", mes: "Maio" },
      { data: "13/mai", descricao: "CAFÉ", valor: 6.0, meio_pagamento: "Nubank", categoria: "Alimentação", tipo: "variavel", mes: "Maio" },
      { data: "18/mai", descricao: "BARBEARIA", valor: 40.0, meio_pagamento: "Nubank", categoria: "Cuidados Pessoais", tipo: "variavel", mes: "Maio" },
      { data: "19/mai", descricao: "FARMACIA", valor: 9.29, meio_pagamento: "Nubank", categoria: "Saúde", tipo: "variavel", mes: "Maio" },
      { data: "10/mai", descricao: "IFOOD", valor: 126.54, meio_pagamento: "Mercado Pago", categoria: "Alimentação", tipo: "variavel", mes: "Maio" },
      { data: "10/mai", descricao: "MERCADO LIVE", valor: 29.53, meio_pagamento: "Mercado Pago", categoria: "Alimentação", tipo: "variavel", mes: "Maio" },
      { data: "10/mai", descricao: "UBER", valor: 12.9, meio_pagamento: "Mercado Pago", categoria: "Transporte", tipo: "variavel", mes: "Maio" },
    ]
  }
};

async function importar() {
  console.log("🚀 Iniciando importação...\n");

  for (const [mes, { fixas, variaveis }] of Object.entries(dados)) {
    const todos = [...fixas, ...variaveis];
    console.log(`📅 ${mes}: ${todos.length} registros`);

    const { error } = await supabase.from("gastos").insert(todos);

    if (error) {
      console.error(`❌ Erro ao importar ${mes}:`, error.message);
    } else {
      console.log(`✅ ${mes} importado com sucesso!`);
      console.log(`   Fixas: ${fixas.length} | Variáveis: ${variaveis.length}`);
      console.log(`   Total: R$ ${todos.reduce((s, g) => s + g.valor, 0).toFixed(2)}`);
    }
  }

  console.log("\n✅ Importação concluída!");
}

importar();
