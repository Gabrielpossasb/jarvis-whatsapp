// ─────────────────────────────────────────────
//  services/evolution.js — WhatsApp via Evolution API
// ─────────────────────────────────────────────

const axios = require("axios");
const { CONFIG } = require("../config");

// Envia mensagem de texto pelo WhatsApp
async function enviarMensagem(numero, texto) {
  const numeroLimpo = numero.replace("@s.whatsapp.net", "");
  await axios.post(
    `${CONFIG.EVOLUTION_API_URL}/message/sendText/${CONFIG.EVOLUTION_INSTANCE}`,
    { number: numeroLimpo, text: texto },
    { headers: { apikey: CONFIG.EVOLUTION_API_KEY, "Content-Type": "application/json" } }
  );
}

// Baixa mídia (áudio, foto, PDF) da mensagem em base64
async function baixarMidia(messageData) {
  const res = await axios.post(
    `${CONFIG.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${CONFIG.EVOLUTION_INSTANCE}`,
    { message: messageData },
    { headers: { apikey: CONFIG.EVOLUTION_API_KEY, "Content-Type": "application/json" } }
  );
  return res.data.base64;
}

module.exports = { enviarMensagem, baixarMidia };
