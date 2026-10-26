// Configurazione pubblica di Supabase.
// Qui va SOLO la chiave pubblica (publishable / anon): è fatta per stare nel browser
// e da sola non permette di leggere nulla, perché ogni tabella è protetta dalla RLS.
// MAI mettere qui la chiave secret / service_role o la password del database.
window.DIETA_CONFIG = {
  supabaseUrl: "https://xphoceoyzpaijdwhjipz.supabase.co",
  supabaseKey: "sb_publishable_ATV9PX4KPsY_c62n08YpRA_-zEtyR94",
};
