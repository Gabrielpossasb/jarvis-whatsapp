#!/usr/bin/env node
// ─────────────────────────────────────────────
//  scripts/migrate.js — Runner de migrações SQL
// ─────────────────────────────────────────────
//
// Aplica os arquivos de `migrations/` em ordem de nome (o prefixo NNN_ é o
// que garante a ordem) e registra o que já rodou na tabela
// `schema_migrations`, pra nunca aplicar duas vezes.
//
// Por que não o client do supabase-js: ele fala com o PostgREST, que não
// executa DDL. Migração precisa de conexão Postgres de verdade — daí o `pg`
// e a DATABASE_URL, que é uma credencial diferente (e MUITO mais poderosa)
// que a chave publishable usada pelo app.
//
// Uso:
//   npm run migrate            aplica as pendentes
//   npm run migrate -- --status   só lista, não aplica
//   npm run migrate -- --baseline marca todas as atuais como aplicadas
//                                 (sem executar) — usado uma única vez, pra
//                                 adotar o runner num banco que já foi
//                                 migrado à mão

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DIR = path.join(__dirname, "..", "migrations");

function conectar() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(`
❌ DATABASE_URL não está no .env.

   Pegue em: Supabase → Project Settings → Database → Connection string
   Use a URI do "Session pooler" (porta 5432). O "Transaction pooler"
   (6543) não serve: ele não mantém a sessão entre statements, então
   BEGIN/COMMIT e funções PL/pgSQL quebram.

   .env:
   DATABASE_URL=postgresql://postgres.SEU_REF:SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres

   ⚠️  Essa credencial dá acesso total ao banco — diferente da chave
   publishable do app. Nunca commitar, nunca subir pro Vercel.
`);
    process.exit(1);
  }
  // Supabase exige TLS; o certificado é de uma CA que o Node não traz por
  // padrão, daí o rejectUnauthorized false (conexão segue criptografada).
  return new Client({ connectionString, ssl: { rejectUnauthorized: false } });
}

function arquivosDeMigracao() {
  return fs.readdirSync(DIR).filter(f => f.endsWith(".sql")).sort();
}

async function main() {
  const status = process.argv.includes("--status");
  const baseline = process.argv.includes("--baseline");

  const client = conectar();
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nome TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const { rows } = await client.query("SELECT nome FROM schema_migrations");
  const aplicadas = new Set(rows.map(r => r.nome));
  const todas = arquivosDeMigracao();
  const pendentes = todas.filter(f => !aplicadas.has(f));

  if (status) {
    console.log(`\n📋 ${todas.length} migração(ões) em migrations/\n`);
    for (const f of todas) console.log(`  ${aplicadas.has(f) ? "✅" : "⬜"} ${f}`);
    console.log(pendentes.length === 0 ? "\nTudo aplicado.\n" : `\n${pendentes.length} pendente(s).\n`);
    await client.end();
    return;
  }

  if (baseline) {
    for (const f of pendentes) {
      await client.query("INSERT INTO schema_migrations (nome) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
    }
    console.log(`📌 ${pendentes.length} migração(ões) marcada(s) como aplicada(s) sem executar.`);
    console.log("   (baseline — use só ao adotar o runner num banco já migrado à mão)");
    await client.end();
    return;
  }

  if (pendentes.length === 0) {
    console.log("✅ Nenhuma migração pendente.");
    await client.end();
    return;
  }

  console.log(`\n🚀 Aplicando ${pendentes.length} migração(ões)...\n`);
  let falhou = false;

  for (const arquivo of pendentes) {
    const sql = fs.readFileSync(path.join(DIR, arquivo), "utf8");
    try {
      // Uma transação por arquivo: se o SQL falhar no meio, nada dele fica
      // aplicado e o registro em schema_migrations também some — o arquivo
      // volta a ser "pendente" em vez de virar meia-migração silenciosa.
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (nome) VALUES ($1)", [arquivo]);
      await client.query("COMMIT");
      console.log(`  ✅ ${arquivo}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ❌ ${arquivo}\n     ${err.message}`);
      // Para na primeira falha: migrações costumam depender das anteriores,
      // então seguir em frente só produziria erros em cascata.
      falhou = true;
      break;
    }
  }

  await client.end();
  if (falhou) process.exit(1);
  console.log("\n✅ Migrações aplicadas.\n");
}

main().catch(err => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
