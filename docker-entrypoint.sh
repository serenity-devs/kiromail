#!/bin/sh
set -eu

# Docker Compose implements local secrets as bind mounts and therefore keeps
# the host's root-only permissions. Copy only the explicitly supported secret
# files into the container tmpfs before dropping privileges; host files remain
# 0600 inside a root-only directory.
runtime_secrets_dir=/tmp/kiromail-secrets
install -d -m 0700 -o kiromail -g kiromail "$runtime_secrets_dir"
for secret_name in \
  DATABASE_URL REDIS_URL ADMIN_PASSWORD SESSION_SECRET DATA_ENCRYPTION_KEY \
  METRICS_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  secret_file_variable="${secret_name}_FILE"
  secret_source=$(printenv "$secret_file_variable" || true)
  if [ -n "$secret_source" ]; then
    if [ ! -f "$secret_source" ]; then
      echo "No se encuentra el secreto $secret_name" >&2
      exit 1
    fi
    secret_target="$runtime_secrets_dir/$secret_name"
    cp "$secret_source" "$secret_target"
    chown kiromail:kiromail "$secret_target"
    chmod 0400 "$secret_target"
    export "$secret_file_variable=$secret_target"
  fi
done

# Named volumes can preserve files written by an older root-running release.
# Restrict ownership repair to KiroMail's two explicit mutable directories.
for directory in /app/uploads /app/message-content; do
  if [ ! -d "$directory" ]; then
    mkdir -p "$directory"
  fi
  chown -R kiromail:kiromail "$directory"
done

exec su-exec kiromail "$@"
