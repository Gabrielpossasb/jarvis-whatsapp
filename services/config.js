const { supabase } = require("./supabase");

const DEFAULTS = {
  hora_lembrete: "06",
  timezone: "America/Campo_Grande",
};

async function buscarConfig() {
  const { data, error } = await supabase
    .from("app_config")
    .select("hora_lembrete, timezone")
    .eq("id", 1)
    .single();
  if (error || !data) return { ...DEFAULTS };
  return { ...DEFAULTS, ...data };
}

async function salvarConfig(cfg) {
  const { error } = await supabase
    .from("app_config")
    .upsert({ id: 1, ...cfg });
  if (error) throw error;
}

module.exports = { buscarConfig, salvarConfig };
