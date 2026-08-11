#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 77
fi

repository_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
public_key_file=${1:?Pass the GitHub Actions public-key file}
app_dir=/opt/kiromail
deploy_user=kiromail-deploy

if [[ ! -f "$public_key_file" ]]; then
  echo "Public key not found: $public_key_file" >&2
  exit 66
fi
read -r key_type key_value key_comment <"$public_key_file"
if [[ "$key_type" != ssh-ed25519 || -z "$key_value" ]]; then
  echo "Expected an Ed25519 public key." >&2
  exit 65
fi
if ! docker network inspect valuebets_web >/dev/null 2>&1; then
  echo "Expected the existing valuebets_web Docker network." >&2
  exit 69
fi

if ! id "$deploy_user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$deploy_user"
fi

install -d -m 0755 -o root -g root "$app_dir"
install -d -m 0700 -o root -g root "$app_dir/secrets"
install -m 0644 "$repository_dir/deploy/compose.server.yml" "$app_dir/compose.yml"
install -m 0755 "$repository_dir/deploy/kiromail-deploy" /usr/local/sbin/kiromail-deploy
install -m 0755 "$repository_dir/deploy/kiromail-actions-command" /usr/local/sbin/kiromail-actions-command
install -m 0755 "$repository_dir/scripts/init-production-secrets.sh" /usr/local/sbin/kiromail-init-secrets

ssh_dir="/home/$deploy_user/.ssh"
install -d -m 0700 -o "$deploy_user" -g "$deploy_user" "$ssh_dir"
authorized_keys="$ssh_dir/authorized_keys"
restricted_line="restrict,command=\"/usr/local/sbin/kiromail-actions-command\" $key_type $key_value ${key_comment:-kiromail-actions}"
touch "$authorized_keys"
if ! grep -Fqx "$restricted_line" "$authorized_keys"; then
  printf '%s\n' "$restricted_line" >>"$authorized_keys"
fi
chown "$deploy_user:$deploy_user" "$authorized_keys"
chmod 0600 "$authorized_keys"

sudoers_file=/etc/sudoers.d/kiromail-deploy
printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/kiromail-deploy *\n' "$deploy_user" >"$sudoers_file"
chmod 0440 "$sudoers_file"
visudo -cf "$sudoers_file" >/dev/null

echo "KiroMail server files and restricted Actions user installed."
ssh-keygen -lf "$public_key_file"
