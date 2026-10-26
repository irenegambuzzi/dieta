# Dieta

Pagina personale per seguire la dieta. Sito statico su GitHub Pages + Supabase (database e login).

## Com'è fatto
- `index.html`, `css/`, `js/` — la pagina, senza build: si modifica e si pubblica.
- `js/config.js` — indirizzo del progetto Supabase e **chiave pubblica** (publishable). Nient'altro.
- `vendor/` — libreria Supabase JS (copia fissa, versione nel nome del file).
- `supabase/migrations/` — lo schema del database. Si applica con `supabase db push`.
- `scripts/controlla-segreti.sh` — controlla che nel repository non ci siano segreti (gira prima di ogni push).

## Sicurezza
- Row Level Security attiva su tutte le tabelle: ogni riga appartiene a un utente e solo lui la vede.
- Il ruolo anonimo non ha alcun permesso sulle tabelle.
- Registrazioni nuove disattivate su Supabase: esiste un solo account.
- Mai nel repository: chiave secret / service_role, password del database, token.
