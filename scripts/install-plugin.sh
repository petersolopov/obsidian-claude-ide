#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo ".env file not found. Add OBSIDIAN_VAULT to .env"
  exit 1
fi

source "$ENV_FILE"

if [ -z "${OBSIDIAN_VAULT:-}" ]; then
  echo "OBSIDIAN_VAULT is not set. Add it to .env"
  exit 1
fi

OBSIDIAN_VAULT_NAME="${OBSIDIAN_VAULT_NAME:-$(basename "$OBSIDIAN_VAULT")}"
OBSIDIAN_VAULT_ARG="vault=$OBSIDIAN_VAULT_NAME"
PLUGIN_DIR="$OBSIDIAN_VAULT/.obsidian/plugins/claude-code-ide"
MAIN_JS="$PROJECT_DIR/main.js"
MANIFEST_JSON="$PROJECT_DIR/manifest.json"

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "Plugin directory not found: $PLUGIN_DIR"
  echo "Make sure Obsidian vault exists and the plugin was installed at least once."
  exit 1
fi

if [ ! -f "$MAIN_JS" ] || [ ! -f "$MANIFEST_JSON" ]; then
  echo "Build artifacts not found. Run npm run build first."
  exit 1
fi

cp "$MAIN_JS" "$MANIFEST_JSON" "$PLUGIN_DIR"

run_obsidian() {
  local output
  if ! output="$(obsidian "$@" 2>&1)"; then
    printf '%s\n' "$output" >&2
    return 1
  fi
  if [[ "$output" == Error:* ]]; then
    printf '%s\n' "$output" >&2
    return 1
  fi
  if [ -n "$output" ]; then
    printf '%s\n' "$output"
  fi
}

if ! run_obsidian plugin:reload "$OBSIDIAN_VAULT_ARG" id=claude-code-ide; then
  echo "Plugin-specific reload failed; reloading vault $OBSIDIAN_VAULT_NAME"
  run_obsidian reload "$OBSIDIAN_VAULT_ARG"
fi
