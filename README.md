# Obsidian IDE

Obsidian plugin that integrates with Claude Code.

> The plugin is in active development

## Install

Requires Node.js 24+.

```bash
git clone https://github.com/petersolopov/obsidian-claude-ide
cd obsidian-claude-ide
npm install
npm run build
ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/obsidian-claude-ide
```

1. Enable in Obsidian: Settings → Community plugins → Installed plugins → toggle on Obsidian IDE
2. In Claude Code: run `/ide` → select Obsidian

## How it works

The plugin runs an MCP server over WebSocket inside Obsidian.
Claude Code discovers it automatically and shows Obsidian in the `/ide` selector.
Once connected, the plugin sends your current selection and open files to Claude Code.
