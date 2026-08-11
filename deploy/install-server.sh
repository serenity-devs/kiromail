#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 77
fi

repository_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
app_dir=/opt/kiromail
if ! docker network inspect valuebets_web >/dev/null 2>&1; then
  echo "Expected the existing valuebets_web Docker network." >&2
  exit 69
fi

install -d -m 0755 -o root -g root "$app_dir"
install -d -m 0700 -o root -g root "$app_dir/secrets"
install -m 0644 "$repository_dir/deploy/compose.server.yml" "$app_dir/compose.yml"
install -m 0755 "$repository_dir/deploy/kiromail-deploy" /usr/local/sbin/kiromail-deploy
install -m 0755 "$repository_dir/deploy/kiromail-update" /usr/local/sbin/kiromail-update
install -m 0755 "$repository_dir/scripts/init-production-secrets.sh" /usr/local/sbin/kiromail-init-secrets
install -m 0644 "$repository_dir/deploy/systemd/kiromail-update.service" /etc/systemd/system/kiromail-update.service
install -m 0644 "$repository_dir/deploy/systemd/kiromail-update.timer" /etc/systemd/system/kiromail-update.timer

systemctl daemon-reload
systemctl enable kiromail-update.timer >/dev/null

echo "KiroMail server files and automatic update timer installed."
