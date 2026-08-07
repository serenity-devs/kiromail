#!/bin/sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "RESTORE_SERENITY_MAIL" ]; then echo "Define CONFIRM_RESTORE=RESTORE_SERENITY_MAIL para confirmar" >&2; exit 1; fi
archive=${1:-}
case "$archive" in /backups/serenity-*.tar.gz.enc) ;; *) echo "Indica un backup dentro de /backups" >&2; exit 1;; esac
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
temporary=$(mktemp -d); trap 'rm -rf "${temporary:?}"' EXIT INT TERM
printf '%s' "$passphrase" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 -pass stdin -in "$archive" -out "$temporary/backup.tar.gz"
tar -C "$temporary" -xzf "$temporary/backup.tar.gz"
pg_restore --exit-on-error --clean --if-exists --no-owner --no-privileges --dbname "$database_url" "$temporary/postgres.dump"
mkdir -p /data/uploads /data/message-content
cp -a "$temporary/uploads/." /data/uploads/
cp -a "$temporary/message-content/." /data/message-content/
archive_name=$(basename "$archive")
psql "$database_url" -v ON_ERROR_STOP=1 -v archive_name="$archive_name" >/dev/null <<'SQL'
INSERT INTO operational_runs(type,status,instance_id,detail,started_at,completed_at)
VALUES('restore_test','completed','restore',jsonb_build_object('filename', :'archive_name', 'full_restore', true),now(),now());
SQL
echo "Restauración terminada. Reinicia app y worker y ejecuta /api/health/ready."
