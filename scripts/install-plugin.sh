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
OBSIDIAN_CONFIG_DIR="$OBSIDIAN_VAULT/.obsidian"
PLUGIN_DIR="$OBSIDIAN_CONFIG_DIR/plugins/claude-code-ide"
COMMUNITY_PLUGINS_JSON="$OBSIDIAN_CONFIG_DIR/community-plugins.json"
MAIN_JS="$PROJECT_DIR/main.js"
MANIFEST_JSON="$PROJECT_DIR/manifest.json"

if [ ! -d "$OBSIDIAN_CONFIG_DIR" ]; then
  echo "Obsidian config directory not found: $OBSIDIAN_CONFIG_DIR"
  echo "Make sure OBSIDIAN_VAULT points to an existing Obsidian vault."
  exit 1
fi

if [ ! -f "$MAIN_JS" ] || [ ! -f "$MANIFEST_JSON" ]; then
  echo "Build artifacts not found. Run npm run build first."
  exit 1
fi

mkdir -p "$PLUGIN_DIR"
cp "$MAIN_JS" "$MANIFEST_JSON" "$PLUGIN_DIR"

# Obsidian only loads local community plugins listed in community-plugins.json.
node -e '
const fs = require("node:fs");
const path = process.argv[1];
const pluginId = process.argv[2];
let ids = [];

try {
  ids = JSON.parse(fs.readFileSync(path, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (!Array.isArray(ids)) {
  throw new Error(`${path} must contain a JSON array`);
}

if (!ids.includes(pluginId)) {
  ids.push(pluginId);
  fs.writeFileSync(path, `${JSON.stringify(ids, null, 2)}\n`);
}
' "$COMMUNITY_PLUGINS_JSON" "claude-code-ide"

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
