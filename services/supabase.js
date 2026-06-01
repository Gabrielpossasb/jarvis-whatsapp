// ─────────────────────────────────────────────
//  services/supabase.js — Cliente Supabase
// ─────────────────────────────────────────────

const { createClient } = require("@supabase/supabase-js");
const { CONFIG } = require("../config");

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

module.exports = { supabase };
