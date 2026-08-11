#!/bin/sh
set -eu

backup_dir=/backups
if [ "$backup_dir" != "/backups" ] || [ ! -d "$backup_dir" ]; then
  echo "El volumen /backups no está disponible" >&2
  exit 1
fi

secret_value() {
  variable_name="$1"
  eval "file_path=\${${variable_name}_FILE:-}"
  if [ -n "$file_path" ]; then
    if [ ! -f "$file_path" ]; then echo "No se encuentra el secreto $variable_name" >&2; exit 1; fi
    value=$(sed -n '1p' "$file_path")
  else
    eval "value=\${$variable_name:-}"
  fi
  if [ -z "$value" ]; then echo "Falta el secreto $variable_name" >&2; exit 1; fi
  printf '%s' "$value"
}

passphrase=$(secret_value BACKUP_ENCRYPTION_PASSPHRASE)
database_url=$(secret_value DATABASE_URL)
retention_days=${BACKUP_RETENTION_DAYS:-14}
case "$retention_days" in *[!0-9]*|'') echo "BACKUP_RETENTION_DAYS debe ser un entero" >&2; exit 1;; esac

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=$(mktemp -d)
archive="$backup_dir/kiromail-$timestamp.tar.gz.enc"
run_id=$(psql "$database_url" -v ON_ERROR_STOP=1 -qAtc "INSERT INTO operational_runs(type,status,instance_id,started_at) VALUES('backup','running','backup',now()) RETURNING id")
case "$run_id" in
  ????????-????-????-????-????????????) ;;
  *) echo "No se pudo obtener el identificador de la ejecución de backup" >&2; exit 1;;
esac
cleanup() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ -n "${run_id:-}" ]; then
    psql "$database_url" -v run_id="$run_id" -v exit_status="$status" >/dev/null 2>&1 <<'SQL' || true
UPDATE operational_runs
SET status='failed', error='El proceso de copia terminó con código ' || :'exit_status', completed_at=now()
WHERE id=:'run_id';
SQL
  fi
  rm -rf "${temporary:?}"
  exit "$status"
}
trap cleanup EXIT INT TERM

mkdir -p "$temporary/payload/uploads" "$temporary/payload/message-content"
pg_dump --format=custom --compress=9 --no-owner --no-privileges "$database_url" --file "$temporary/payload/postgres.dump"
if [ -d /data/uploads ]; then cp -a /data/uploads/. "$temporary/payload/uploads/"; fi
if [ -d /data/message-content ]; then cp -a /data/message-content/. "$temporary/payload/message-content/"; fi
printf '{"created_at":"%s","format":1,"database":"postgres.dump"}\n' "$timestamp" > "$temporary/payload/manifest.json"
tar -C "$temporary/payload" -czf "$temporary/backup.tar.gz" .
printf '%s' "$passphrase" | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 -pass stdin -in "$temporary/backup.tar.gz" -out "$archive"
sha256sum "$archive" > "$archive.sha256"
chmod 0600 "$archive" "$archive.sha256"

bytes=$(wc -c < "$archive" | tr -d ' ')
archive_name=$(basename "$archive")
psql "$database_url" -v ON_ERROR_STOP=1 -v run_id="$run_id" -v archive_name="$archive_name" -v backup_bytes="$bytes" >/dev/null <<'SQL'
UPDATE operational_runs
SET status='completed',
    detail=jsonb_build_object('filename', :'archive_name', 'bytes', :'backup_bytes'::bigint, 'encrypted', true),
    completed_at=now()
WHERE id=:'run_id';
SQL
find "$backup_dir" -maxdepth 1 -type f \( -name 'kiromail-*.tar.gz.enc' -o -name 'kiromail-*.tar.gz.enc.sha256' \) -mtime "+$retention_days" -delete
echo "Backup cifrado creado: $archive ($bytes bytes)"
