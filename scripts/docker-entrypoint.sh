#!/bin/sh
set -eu

BOOTSTRAP_FLAG="${BOOTSTRAP_TRANSLATION:-0}"
MARKER_FILE="/app/.argos/.translation_bootstrap_done"

if [ "$BOOTSTRAP_FLAG" = "1" ] && [ ! -f "$MARKER_FILE" ]; then
  echo "[entrypoint] Bootstrapping local ru->en translation model..."
  if python scripts/bootstrap_local_translation.py; then
    date -u +"%Y-%m-%dT%H:%M:%SZ" > "$MARKER_FILE"
    echo "[entrypoint] Translation bootstrap completed."
  else
    echo "[entrypoint] Translation bootstrap failed. Continuing without local translation."
  fi
fi

exec "$@"
