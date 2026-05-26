#!/usr/bin/env bash
# Pull Nexus secrets from macOS Keychain into .env.local.
# Adds OPENROUTER_API_KEY without touching any other lines.
#
# Run: npm run env:pull

set -euo pipefail

ENV_FILE=".env.local"
SERVICE="nexus"
ACCOUNT="openrouter"
VAR_NAME="OPENROUTER_API_KEY"

if ! KEY=$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w 2>/dev/null); then
  echo "Error: Keychain item $SERVICE/$ACCOUNT not found." >&2
  echo "Add it with:" >&2
  echo "  pbpaste | tr -d '\\n\\r' | xargs -I{} security add-generic-password -U -s $SERVICE -a $ACCOUNT -w {}" >&2
  exit 1
fi

touch "$ENV_FILE"
# Strip any existing line, then append the fresh value.
grep -v "^${VAR_NAME}=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
echo "${VAR_NAME}=${KEY}" >> "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

unset KEY
echo "Pulled ${VAR_NAME} from Keychain into ${ENV_FILE}"
