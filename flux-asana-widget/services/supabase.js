const { createClient } = require("@supabase/supabase-js");

let _supabase = null;

/**
 * Lazy-initialize the Supabase client.
 * Allows the server to start without env vars for testing routes/structure.
 */
function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key || url === "https://your-project.supabase.co") {
    console.warn("[Supabase] ⚠️  Not configured — using mock mode");
    console.warn("           Copy .env.example to .env and fill in your values");
    return null;
  }

  _supabase = createClient(url, key);
  console.log("[Supabase] ✅ Client initialized");
  return _supabase;
}

module.exports = { getSupabase };
