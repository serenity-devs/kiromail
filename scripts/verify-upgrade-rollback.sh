#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
cd "${repo_dir}"

migrations=(db/migrations/*.sql)
if (( ${#migrations[@]} < 2 )); then
  echo "Se necesitan al menos dos migraciones para ensayar una actualización." >&2
  exit 1
fi

latest_index=$(( ${#migrations[@]} - 1 ))
latest_migration="${migrations[${latest_index}]}"
latest_name="$(basename "${latest_migration}")"
suffix="$(date -u +%Y%m%d%H%M%S)_$$"
test_db="kiromail_upgrade_${suffix}"
snapshot_db="${test_db}_snapshot"

if [[ ! "${test_db}" =~ ^kiromail_upgrade_[0-9]{14}_[0-9]+$ ]] ||
   [[ ! "${snapshot_db}" =~ ^kiromail_upgrade_[0-9]{14}_[0-9]+_snapshot$ ]]; then
  echo "Los nombres de base temporal no superaron la validación de seguridad." >&2
  exit 1
fi

compose=(docker compose)
postgres=("${compose[@]}" exec -T postgres)

cleanup() {
  "${postgres[@]}" dropdb --if-exists -U kiromail "${test_db}" >/dev/null 2>&1 || true
  "${postgres[@]}" dropdb --if-exists -U kiromail "${snapshot_db}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${postgres[@]}" pg_isready -U kiromail -d kiromail >/dev/null
"${postgres[@]}" createdb -U kiromail "${test_db}"

apply_migration() {
  local database="$1"
  local migration="$2"
  local name
  name="$(basename "${migration}")"
  "${postgres[@]}" psql -v ON_ERROR_STOP=1 --single-transaction -U kiromail -d "${database}" < "${migration}" >/dev/null
  "${postgres[@]}" psql -v ON_ERROR_STOP=1 -U kiromail -d "${database}" \
    -c "INSERT INTO schema_migrations (name) VALUES ('${name}') ON CONFLICT (name) DO NOTHING" >/dev/null
  echo "Aplicada ${name}"
}

"${postgres[@]}" psql -v ON_ERROR_STOP=1 -U kiromail -d "${test_db}" \
  -c "CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())" >/dev/null

for ((index=0; index<latest_index; index++)); do
  apply_migration "${test_db}" "${migrations[${index}]}"
done

"${postgres[@]}" psql -v ON_ERROR_STOP=1 -U kiromail -d "${test_db}" >/dev/null <<'SQL'
WITH new_contact AS (
  INSERT INTO contacts (email, first_name, status, source)
  VALUES ('upgrade-sentinel@example.test', 'Antes', 'active', 'upgrade_rehearsal')
  RETURNING id
), new_list AS (
  INSERT INTO lists (name, key, description)
  VALUES ('Lista de ensayo de actualización', 'upgrade_rehearsal', 'Dato centinela')
  RETURNING id
)
INSERT INTO subscriptions (contact_id, list_id, status, source, subscribed_at, confirmed_at)
SELECT new_contact.id, new_list.id, 'active', 'upgrade_rehearsal', now(), now()
FROM new_contact CROSS JOIN new_list;
SQL

"${postgres[@]}" createdb -U kiromail --template="${test_db}" "${snapshot_db}"
snapshot_revision_columns="$("${postgres[@]}" psql -At -v ON_ERROR_STOP=1 -U kiromail -d "${snapshot_db}" -c \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='revision'")"
apply_migration "${test_db}" "${latest_migration}"

post_upgrade="$("${postgres[@]}" psql -At -v ON_ERROR_STOP=1 -U kiromail -d "${test_db}" -c \
  "SELECT (SELECT count(*) FROM contacts WHERE email='upgrade-sentinel@example.test') || ':' || (SELECT count(*) FROM lists WHERE key='upgrade_rehearsal') || ':' || (SELECT count(*) FROM subscriptions WHERE source='upgrade_rehearsal') || ':' || (SELECT revision FROM contacts WHERE email='upgrade-sentinel@example.test')")"
if [[ "${post_upgrade}" != "1:1:1:1" ]]; then
  echo "La actualización no conservó íntegramente los datos centinela: ${post_upgrade}" >&2
  exit 1
fi

# Representa una versión anterior de la aplicación: no conoce la columna revision.
"${postgres[@]}" psql -v ON_ERROR_STOP=1 -U kiromail -d "${test_db}" \
  -c "UPDATE contacts SET first_name='Después', updated_at=now() WHERE email='upgrade-sentinel@example.test'" >/dev/null
legacy_compatible="$("${postgres[@]}" psql -At -v ON_ERROR_STOP=1 -U kiromail -d "${test_db}" -c \
  "SELECT first_name || ':' || revision FROM contacts WHERE email='upgrade-sentinel@example.test'")"
if [[ "${legacy_compatible}" != "Después:2" ]]; then
  echo "El esquema actualizado no admite el rollback de aplicación esperado: ${legacy_compatible}" >&2
  exit 1
fi

"${postgres[@]}" dropdb -U kiromail "${test_db}"
"${postgres[@]}" createdb -U kiromail --template="${snapshot_db}" "${test_db}"

restored="$("${postgres[@]}" psql -At -v ON_ERROR_STOP=1 -U kiromail -d "${test_db}" -c \
  "SELECT (SELECT count(*) FROM contacts WHERE email='upgrade-sentinel@example.test') || ':' || (SELECT count(*) FROM subscriptions WHERE source='upgrade_rehearsal') || ':' || (SELECT count(*) FROM schema_migrations WHERE name='${latest_name}') || ':' || (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='revision')")"
if [[ "${restored}" != "1:1:0:${snapshot_revision_columns}" ]]; then
  echo "La restauración del estado anterior no coincide con el snapshot: ${restored}" >&2
  exit 1
fi

echo "Ensayo superado: ${latest_name}; datos 1:1:1, rollback de aplicación compatible y snapshot anterior restaurable."
