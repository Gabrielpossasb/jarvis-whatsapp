// ─────────────────────────────────────────────
//  utils/date.js — Funções de data e hora
// ─────────────────────────────────────────────

const { CONFIG, MESES_CURTOS } = require("../config");

// Retorna o momento atual no fuso de Campo Grande (GMT-4)
function agora() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: CONFIG.TIMEZONE }));
}

// Formata uma data como "DD/mmm" — ex: "29/mai"
function formatarData(date) {
  const d = date || agora();
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = MESES_CURTOS[d.getMonth()];
  return `${dia}/${mes}`;
}

// Formata hora como "HH:MM" — ex: "14:30"
function formatarHora(date) {
  const d = date || agora();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Retorna a data de amanhã formatada
function amanha() {
  const d = agora();
  d.setDate(d.getDate() + 1);
  return formatarData(d);
}

module.exports = { agora, formatarData, formatarHora, amanha };
