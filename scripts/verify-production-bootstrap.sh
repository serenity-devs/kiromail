#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
cd "${repo_dir}"

suffix="$(date -u +%Y%m%d%H%M%S)_$$"
test_db="serenity_bootstrap_${suffix}"
if [[ ! "${test_db}" =~ ^serenity_bootstrap_[0-9]{14}_[0-9]+$ ]]; then
  echo "El nombre de base temporal no superó la validación de seguridad." >&2
  exit 1
fi

compose=(docker compose)
postgres=("${compose[@]}" exec -T postgres)

cleanup() {
  "${postgres[@]}" dropdb --if-exists -U serenity "${test_db}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${postgres[@]}" pg_isready -U serenity -d serenity_mail >/dev/null
"${postgres[@]}" createdb -U serenity "${test_db}"

database_url="postgres://serenity:serenity@postgres:5432/${test_db}"
"${compose[@]}" run --rm --no-deps \
  -e DATABASE_URL="${database_url}" \
  -e ADMIN_EMAIL="bootstrap@example.test" \
  -e ADMIN_PASSWORD="Bootstrap-production-password-2026" \
  migrate npm run db:setup:production >/dev/null

counts="$("${postgres[@]}" psql -At -v ON_ERROR_STOP=1 -U serenity -d "${test_db}" -c \
  "SELECT (SELECT count(*) FROM users) || ':' || (SELECT count(*) FROM contacts) || ':' || (SELECT count(*) FROM lists) || ':' || (SELECT count(*) FROM campaigns) || ':' || (SELECT count(*) FROM templates)")"
if [[ "${counts}" != "1:0:0:0:0" ]]; then
  echo "El bootstrap de producción creó datos inesperados: ${counts}" >&2
  exit 1
fi

admin="$("${postgres[@]}" psql -At -v ON_ERROR_STOP=1 -U serenity -d "${test_db}" -c \
  "SELECT email || ':' || role || ':' || status FROM users")"
if [[ "${admin}" != "bootstrap@example.test:admin:active" ]]; then
  echo "El administrador inicial no coincide con lo esperado: ${admin}" >&2
  exit 1
fi

if npx tsx scripts/seed.ts >/dev/null 2>&1; then
  echo "El seed demo se ejecutó sin la autorización explícita requerida." >&2
  exit 1
fi

echo "Bootstrap de producción verificado: administrador 1; contactos/listas/campañas/plantillas 0; seed demo bloqueado."
