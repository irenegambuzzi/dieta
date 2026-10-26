// Configurazione pubblica di Supabase.
// Qui va SOLO la chiave pubblica (publishable / anon): è fatta per stare nel browser
// e da sola non permette di leggere nulla, perché ogni tabella è protetta dalla RLS.
// MAI mettere qui la chiave secret / service_role o la password del database.
window.DIETA_CONFIG = {
  supabaseUrl: "__SUPABASE_URL__",
  supabaseKey: "__SUPABASE_PUBLISHABLE_KEY__",
};
