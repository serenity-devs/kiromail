#!/bin/sh
set -eu

# Named volumes can preserve files written by an older root-running release.
# Restrict ownership repair to KiroMail's two explicit mutable directories.
for directory in /app/uploads /app/message-content; do
  if [ ! -d "$directory" ]; then
    mkdir -p "$directory"
  fi
  chown -R kiromail:kiromail "$directory"
done

exec su-exec kiromail "$@"
