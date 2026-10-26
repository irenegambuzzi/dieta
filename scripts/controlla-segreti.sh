#!/usr/bin/env bash
# Controlla che nei file tracciati da git non ci siano segreti.
# Uso: scripts/controlla-segreti.sh   (esce con errore se trova qualcosa)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

trovato=0
segnala() { echo "SEGRETO? $1"; trovato=1; }

# 1. Chiavi secret di Supabase (nuovo formato) e token di accesso personali
git grep -nIE 'sb_secret_[A-Za-z0-9_-]{10,}' -- . ':!scripts/controlla-segreti.sh' && segnala "chiave sb_secret" || true
git grep -nIE 'sbp_[A-Za-z0-9]{20,}' -- . ':!scripts/controlla-segreti.sh' && segnala "token personale Supabase" || true

# 2. JWT con ruolo service_role (vecchio formato delle chiavi)
while IFS= read -r jwt; do
  payload=$(printf '%s' "$jwt" | cut -d. -f2 | tr '_-' '/+')
  while [ $(( ${#payload} % 4 )) -ne 0 ]; do payload="$payload="; done
  if printf '%s' "$payload" | base64 -d 2>/dev/null | grep -q '"role":"service_role"'; then
    segnala "JWT service_role"
  fi
done < <(git grep -hoIE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' -- . ':!vendor' || true)

# 3. Stringhe di connessione al database con password
git grep -nIE 'postgres(ql)?://[^:@/[:space:]]+:[^@[:space:]]+@' -- . ':!scripts/controlla-segreti.sh' && segnala "connessione database con password" || true

# 4. Token GitHub
git grep -nIE 'gh[pousr]_[A-Za-z0-9]{30,}' -- . ':!scripts/controlla-segreti.sh' && segnala "token GitHub" || true

# 5. File che non devono essere tracciati
git ls-files | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|supabase/\.temp/' && segnala "file sensibile tracciato" || true

if [ "$trovato" -ne 0 ]; then
  echo "STOP: trovati possibili segreti. Non fare push."
  exit 1
fi
echo "OK: nessun segreto nei file tracciati."
