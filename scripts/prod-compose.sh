#!/bin/sh
set -eu

repository=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$repository"

exec docker compose \
  -f docker-compose.yml \
  -f docker-compose.production.yml \
  "$@"
