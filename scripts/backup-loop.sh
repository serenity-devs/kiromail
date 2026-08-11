#!/bin/sh
set -eu
interval=${BACKUP_INTERVAL_SECONDS:-86400}
case "$interval" in *[!0-9]*|'') echo "BACKUP_INTERVAL_SECONDS debe ser un entero" >&2; exit 1;; esac
if [ "$interval" -lt 300 ]; then echo "El intervalo mínimo es 300 segundos" >&2; exit 1; fi
while true; do
  /opt/kiromail/backup.sh || echo "La copia ha fallado; se reintentará en el siguiente intervalo" >&2
  sleep "$interval"
done
