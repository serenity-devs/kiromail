#!/bin/sh
set -eu

archive=${1:-}
case "$archive" in /backups/kiromail-*.tar.gz.enc) ;; *) echo "Indica un backup dentro de /backups" >&2; exit 1;; esac
if [ ! -f "$archive" ]; then echo "El backup no existe" >&2; exit 1; fi
if [ -f "$archive.sha256" ]; then (cd /backups && sha256sum -c "$(basename "$archive.sha256")"); fi

secret_value() {
  variable_name="$1"; eval "file_path=\${${variable_name}_FILE:-}"
  if [ -n "$file_path" ]; then value=$(sed -n '1p' "$file_path"); else eval "value=\${$variable_name:-}"; fi
  if [ -z "$value" ]; then echo "Falta el secreto $variable_name" >&2; exit 1; fi
  printf '%s' "$value"
}
passphrase=$(secret_value BACKUP_ENCRYPTION_PASSPHRASE)
database_url=$(secret_value DATABASE_URL)
test_database=${RESTORE_TEST_DATABASE:-kiromail_restore_test}
if [ "$test_database" != "kiromail_restore_test" ]; then echo "La prueba solo puede usar kiromail_restore_test" >&2; exit 1; fi
temporary=$(mktemp -d); trap 'rm -rf "${temporary:?}"' EXIT INT TERM
printf '%s' "$passphrase" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 -pass stdin -in "$archive" -out "$temporary/backup.tar.gz"
tar -C "$temporary" -xzf "$temporary/backup.tar.gz"
pg_restore --list "$temporary/postgres.dump" >/dev/null
psql "$database_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS kiromail_restore_test WITH (FORCE)" >/dev/null
psql "$database_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE kiromail_restore_test" >/dev/null
test_database_url=${RESTORE_TEST_DATABASE_URL:-${database_url%/*}/kiromail_restore_test}
pg_restore --exit-on-error --no-owner --no-privileges --dbname "$test_database_url" "$temporary/postgres.dump"
tables=$(psql "$test_database_url" -Atc "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'")
if [ "$tables" -lt 10 ]; then echo "La restauración de prueba no contiene las tablas esperadas" >&2; exit 1; fi
psql "$database_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE kiromail_restore_test WITH (FORCE)" >/dev/null
archive_name=$(basename "$archive")
psql "$database_url" -v ON_ERROR_STOP=1 -v archive_name="$archive_name" -v restored_tables="$tables" >/dev/null <<'SQL'
INSERT INTO operational_runs(type,status,instance_id,detail,started_at,completed_at)
VALUES('restore_test','completed','backup',jsonb_build_object('filename', :'archive_name', 'tables', :'restored_tables'::integer),now(),now());
SQL
echo "Restauración aislada verificada: $tables tablas"
