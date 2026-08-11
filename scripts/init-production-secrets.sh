#!/bin/sh
set -eu

repository=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
secrets_dir=${KIROMAIL_SECRETS_DIR:-$repository/secrets}
case "$secrets_dir" in
  /*) ;;
  *) echo "KIROMAIL_SECRETS_DIR debe ser una ruta absoluta" >&2; exit 1 ;;
esac
umask 077
mkdir -p "$secrets_dir"

create_random_secret() {
  target="$1"
  bytes="$2"
  if [ -e "$target" ]; then
    echo "Conservado: $target"
    return
  fi
  openssl rand -base64 "$bytes" > "$target"
  chmod 0600 "$target"
  echo "Creado: $target"
}

create_empty_secret() {
  target="$1"
  if [ -e "$target" ]; then
    echo "Conservado: $target"
    return
  fi
  : > "$target"
  chmod 0600 "$target"
  echo "Creado vacío: $target"
}

create_random_secret "$secrets_dir/postgres_password" 32
create_random_secret "$secrets_dir/redis_password" 32
create_random_secret "$secrets_dir/admin_password" 36
create_random_secret "$secrets_dir/session_secret" 48
create_random_secret "$secrets_dir/data_encryption_key" 48
create_random_secret "$secrets_dir/metrics_token" 32
create_random_secret "$secrets_dir/backup_passphrase" 48

# Vacíos significa «usar el rol IAM del servidor». Rellénalos únicamente en un
# VPS externo a AWS que necesite credenciales estáticas de mínimo privilegio.
create_empty_secret "$secrets_dir/aws_access_key_id"
create_empty_secret "$secrets_dir/aws_secret_access_key"
create_empty_secret "$secrets_dir/aws_session_token"

postgres_password=$(sed -n '1p' "$secrets_dir/postgres_password")
redis_password=$(sed -n '1p' "$secrets_dir/redis_password")
if [ -z "$postgres_password" ] || [ -z "$redis_password" ]; then
  echo "Las contraseñas de PostgreSQL y Redis no pueden estar vacías" >&2
  exit 1
fi

database_url_file="$secrets_dir/database_url"
if [ ! -e "$database_url_file" ]; then
  printf 'postgres://kiromail:%s@postgres:5432/kiromail' "$postgres_password" > "$database_url_file"
  chmod 0600 "$database_url_file"
  echo "Creado: $database_url_file"
else
  echo "Conservado: $database_url_file"
fi

redis_url_file="$secrets_dir/redis_url"
if [ ! -e "$redis_url_file" ]; then
  printf 'redis://:%s@redis:6379' "$redis_password" > "$redis_url_file"
  chmod 0600 "$redis_url_file"
  echo "Creado: $redis_url_file"
else
  echo "Conservado: $redis_url_file"
fi

echo "Secretos de producción preparados sin sobrescribir archivos existentes."
