async function buscarUsoOpenAI() {
  const key = process.env.OPENAI_ADMIN_KEY;
  if (!key) return null;

  const agora = new Date();
  const inicioMes = Math.floor(new Date(agora.getFullYear(), agora.getMonth(), 1).getTime() / 1000);

  try {
    const [costsRes, tokensRes] = await Promise.all([
      fetch(`https://api.openai.com/v1/organization/costs?start_time=${inicioMes}&bucket_width=1d&limit=31`, {
        headers: { Authorization: `Bearer ${key}` },
      }),
      fetch(`https://api.openai.com/v1/organization/usage/completions?start_time=${inicioMes}&bucket_width=1d&limit=31`, {
        headers: { Authorization: `Bearer ${key}` },
      }),
    ]);

    const costs = await costsRes.json();
    const tokens = await tokensRes.json();

    const totalCusto = (costs.data || []).reduce((acc, b) =>
      acc + (b.results || []).reduce((s, r) => s + (r.amount?.value || 0), 0), 0);

    const totalTokens = (tokens.data || []).reduce((acc, b) =>
      acc + (b.results || []).reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0), 0);

    return { custo: totalCusto, tokens: totalTokens };
  } catch (err) {
    console.error("buscarUsoOpenAI erro:", err.message);
    return null;
  }
}

module.exports = { buscarUsoOpenAI };
