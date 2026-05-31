// ─────────────────────────────────────────────
//  services/sheets.js — Google Sheets
// Colunas Tarefas:
//   A=Descrição B=Data C=Hora D=Recorrente E=Status
//   F=LembreteEnviado G=Categoria H=DataCriação
//   I=DiasLembrete J=HoraLembrete K=DataConclusão
// ─────────────────────────────────────────────

const { google } = require("googleapis");
const { CONFIG, MESES, DIAS_SEMANA } = require("../config");
const { agora, formatarData } = require("../utils/date");

let _sheetsClient = null;
async function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: CONFIG.GOOGLE_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _sheetsClient = google.sheets({ version: "v4", auth });
  return _sheetsClient;
}

// ════════════════════════════════════════════
//  GASTOS
// ════════════════════════════════════════════
async function adicionarGasto(data, descricao, valor, meioPagamento, categoria, tipo) {
  const sheets = await getSheetsClient();
  const mesAtual = MESES[new Date().getMonth()];
  const colInicio = tipo === "fixa" ? "L" : "R";
  const colFim    = tipo === "fixa" ? "P" : "V";

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_GASTOS_ID,
    range: `${mesAtual}!${colInicio}:${colFim}`,
  });
  const rows = res.data.values || [];
  const proximaLinha = Math.max(8, rows.length + 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_GASTOS_ID,
    range: `${mesAtual}!${colInicio}${proximaLinha}:${colFim}${proximaLinha}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[data, descricao, valor, meioPagamento, categoria]] },
  });
}

// ════════════════════════════════════════════
//  TAREFAS
// ════════════════════════════════════════════
async function inicializarPlanilhaTarefas() {
  const sheets = await getSheetsClient();
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID });
    const abas = meta.data.sheets.map(s => s.properties.title);

    if (!abas.includes("Tarefas")) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: "Tarefas" } } }] },
      });
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
      range: "Tarefas!A1:K1",
    });

    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
        range: "Tarefas!A1:K1",
        valueInputOption: "RAW",
        requestBody: {
          values: [["Descrição","Data","Hora","Recorrente","Status","Lembrete Enviado","Categoria","Data Criação","Dias Lembrete","Hora Lembrete","Data Conclusão"]],
        },
      });
    } else {
      // Adiciona cabeçalho K se ainda não existir (migração)
      const row = res.data.values[0];
      if (!row[10]) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
          range: "Tarefas!K1",
          valueInputOption: "RAW",
          requestBody: { values: [["Data Conclusão"]] },
        });
        console.log("✅ Coluna K (Data Conclusão) adicionada!");
      }
    }
    console.log("Planilha Tarefas OK!");
  } catch (e) {
    console.error("Erro ao inicializar tarefas:", e.message);
  }
}

function rowToTarefa(row, index) {
  return {
    linha:           index + 2,
    descricao:       row[0] || "",
    data:            row[1] || "",
    hora:            row[2] || "",
    recorrente:      row[3] || "Não",
    status:          row[4] || "Pendente",
    lembreteEnviado: row[5] || "Não",
    categoria:       row[6] || "Outros",
    dataCriacao:     row[7] || "",
    diasLembrete:    row[8] || "",
    horaLembrete:    row[9] || "",
    dataConclusao:   row[10] || "",  // K — conclusão do dia (tarefas recorrentes)
  };
}

async function adicionarTarefa(descricao, data, hora, recorrente, categoria, diasLembrete, horaLembrete) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: "Tarefas!A:K",
  });
  const rows = res.data.values || [];
  const proximaLinha = Math.max(2, rows.length + 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: `Tarefas!A${proximaLinha}:K${proximaLinha}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        descricao, data, hora || "", recorrente || "Não",
        "Pendente", "Não", categoria || "Outros", formatarData(),
        diasLembrete || "", horaLembrete || "", ""
      ]],
    },
  });
}

async function buscarTodasTarefas() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: "Tarefas!A:K",
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  return rows.slice(1).map((row, i) => rowToTarefa(row, i));
}

function recorreBateDia(recorrente, diaHoje) {
  if (!recorrente || recorrente === "Não") return false;
  const dias = recorrente.toLowerCase().split(",").map(d => d.trim());
  return dias.some(d => diaHoje.includes(d) || d.includes(diaHoje));
}

async function buscarTarefasDoDia(dataStr) {
  const tarefas = await buscarTodasTarefas();
  const diaHoje = DIAS_SEMANA[agora().getDay()];
  const hoje = formatarData();

  return tarefas.filter(t => {
    if (t.status === "Concluída") return false;
    if (t.data === "backlog") return false;
    if (t.recorrente && t.recorrente !== "Não") {
      if (t.dataConclusao === hoje) return false; // já concluída hoje
      return recorreBateDia(t.recorrente, diaHoje);
    }
    return t.data.replace(/\.$/, "") === dataStr;
  });
}

// Retorna tarefas concluídas hoje (recorrentes marcadas com dataConclusao = hoje)
async function buscarTarefasConcluidasHoje() {
  const tarefas = await buscarTodasTarefas();
  const hoje = formatarData();
  return tarefas.filter(t => t.dataConclusao === hoje);
}

// Busca tarefas que têm diasLembrete definido e batem com hoje
async function buscarTarefasComLembreteHoje() {
  const tarefas = await buscarTodasTarefas();
  const diaHoje = DIAS_SEMANA[agora().getDay()];

  return tarefas.filter(t => {
    if (t.status === "Concluída") return false;
    if (!t.diasLembrete || !t.horaLembrete) return false;
    return recorreBateDia(t.diasLembrete, diaHoje);
  });
}

async function buscarBacklog() {
  const tarefas = await buscarTodasTarefas();
  return tarefas.filter(t => t.data === "backlog" && t.status !== "Concluída");
}

async function buscarTarefasPorPeriodo(periodo, categoria) {
  const { amanha } = require("../utils/date");
  let tarefas;

  if (periodo === "backlog") tarefas = await buscarBacklog();
  else if (periodo === "amanhã" || periodo === "amanha") tarefas = await buscarTarefasDoDia(amanha());
  else if (periodo === "hoje") tarefas = await buscarTarefasDoDia(formatarData());
  else tarefas = await buscarTarefasDoDia(periodo);

  if (!categoria || categoria === "todas") return tarefas;
  return tarefas.filter(t => t.categoria.toLowerCase() === categoria.toLowerCase());
}

async function buscarTarefasVencidas() {
  const tarefas = await buscarTodasTarefas();
  const hoje = agora();
  const MESES_MAP = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};

  return tarefas.filter(t => {
    if (t.status === "Concluída") return false;
    if (t.data === "backlog" || t.recorrente !== "Não" || !t.data) return false;
    const partes = t.data.split("/");
    if (partes.length !== 2) return false;
    const dia = parseInt(partes[0]);
    const mes = MESES_MAP[partes[1].toLowerCase()];
    if (isNaN(dia) || mes === undefined) return false;
    const dataTarefa = new Date(hoje.getFullYear(), mes, dia);
    const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return dataTarefa < hojeZerado;
  });
}

async function buscarTarefasEsquecidas() {
  const tarefas = await buscarTodasTarefas();
  const hoje = agora();
  const MESES_MAP = {jan:0,fev:1,mar:2,abr:3,mai:4,jun:5,jul:6,ago:7,set:8,out:9,nov:10,dez:11};

  return tarefas.filter(t => {
    if (t.status === "Concluída") return false;
    if (!t.dataCriacao) return false;
    const partes = t.dataCriacao.split("/");
    if (partes.length !== 2) return false;
    const dia = parseInt(partes[0]);
    const mes = MESES_MAP[partes[1].toLowerCase()];
    if (isNaN(dia) || mes === undefined) return false;
    const dataCriacao = new Date(hoje.getFullYear(), mes, dia);
    return (hoje - dataCriacao) / (1000 * 60 * 60 * 24) >= 7;
  });
}

// Conclui tarefa permanentemente (tarefas normais)
async function concluirTarefa(linha) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: `Tarefas!E${linha}`,
    valueInputOption: "RAW",
    requestBody: { values: [["Concluída"]] },
  });
}

// Conclui tarefa recorrente apenas para hoje — amanhã ela volta
async function concluirTarefaDoDia(linha) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: `Tarefas!K${linha}`,
    valueInputOption: "RAW",
    requestBody: { values: [[formatarData()]] },
  });
}

async function excluirTarefa(linha) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: `Tarefas!A${linha}:K${linha}`,
  });
}

async function alterarCategoriaTarefa(linha, novaCategoria) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: `Tarefas!G${linha}`,
    valueInputOption: "RAW",
    requestBody: { values: [[novaCategoria]] },
  });
}

async function alterarTarefa(linha, campos) {
  const sheets = await getSheetsClient();
  const COL_MAP = { data: "B", hora: "C", diasLembrete: "I", horaLembrete: "J" };

  for (const [campo, valor] of Object.entries(campos)) {
    const col = COL_MAP[campo];
    if (!col) continue;
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
      range: `Tarefas!${col}${linha}`,
      valueInputOption: "RAW",
      requestBody: { values: [[valor]] },
    });
  }
}

async function marcarLembreteEnviado(linha, valor) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_TAREFAS_ID,
    range: `Tarefas!F${linha}`,
    valueInputOption: "RAW",
    requestBody: { values: [[valor || "Sim"]] },
  });
}

module.exports = {
  adicionarGasto,
  inicializarPlanilhaTarefas,
  adicionarTarefa,
  buscarTodasTarefas,
  buscarTarefasDoDia,
  buscarTarefasConcluidasHoje,
  buscarTarefasComLembreteHoje,
  buscarBacklog,
  buscarTarefasPorPeriodo,
  buscarTarefasVencidas,
  buscarTarefasEsquecidas,
  concluirTarefa,
  concluirTarefaDoDia,
  excluirTarefa,
  alterarCategoriaTarefa,
  alterarTarefa,
  marcarLembreteEnviado,
};
