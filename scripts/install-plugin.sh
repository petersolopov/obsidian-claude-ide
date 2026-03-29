#!/bin/bash
set -e

source "$(dirname "$0")/../.env"

if [ -z "$OBSIDIAN_VAULT" ]; then
  echo "OBSIDIAN_VAULT is not set. Add it to .env"
  exit 1
fi

PLUGIN_DIR="$OBSIDIAN_VAULT/.obsidian/plugins/claude-code-ide"

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "Plugin directory not found: $PLUGIN_DIR"
  echo "Make sure Obsidian vault exists and the plugin was installed at least once."
  exit 1
fi

obsidian plugin:disable id=claude-code-ide
rm -f "$PLUGIN_DIR/main.js" "$PLUGIN_DIR/manifest.json"
cp main.js manifest.json "$PLUGIN_DIR"
obsidian plugin:enable id=claude-code-ide
obsidian plugin:reload id=claude-code-ide
