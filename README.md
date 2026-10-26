# Dieta

Pagina personale per seguire la dieta. Sito statico su GitHub Pages + Supabase (database e login).

## Com'è fatto
- `index.html`, `css/`, `js/` — la pagina, senza build: si modifica e si pubblica.
  - `js/app.js` nucleo (sessione, navigazione, finestre di modifica, calcoli)
  - `js/oggi.js` diario del giorno · `js/peso.js` peso e punto vita
  - `js/cucina.js` piano settimanale, ricette, alimenti (codice a barre / Open Food Facts), drink
  - `js/spesa.js` lista della spesa · `js/impostazioni.js` obiettivi, backup, account
- `js/config.js` — indirizzo del progetto Supabase e **chiave pubblica** (publishable). Nient'altro.
- `vendor/` — librerie in copia fissa (versione nel nome del file): Supabase JS e ZXing (lettura codici a barre, caricata solo quando si usa la fotocamera).
- `supabase/migrations/` — lo schema del database. Si applica con `supabase db push`.
- `scripts/controlla-segreti.sh` — controlla che nel repository non ci siano segreti (gira prima di ogni push).

## Sicurezza
- Row Level Security attiva su tutte le tabelle: ogni riga appartiene a un utente e solo lui la vede.
- Il ruolo anonimo non ha alcun permesso sulle tabelle.
- Registrazioni nuove disattivate su Supabase: esiste un solo account.
- Mai nel repository: chiave secret / service_role, password del database, token.
