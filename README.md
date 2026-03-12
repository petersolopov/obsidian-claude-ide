# Obsidian IDE

Obsidian plugin that integrates with Claude Code.

https://github.com/user-attachments/assets/79c7e68f-accd-42a8-9508-6d5953aa90c4

## Install

Requires Node.js 24+.

```bash
git clone https://github.com/petersolopov/obsidian-claude-ide
cd obsidian-claude-ide
npm install
npm run build
mkdir -p /path/to/vault/.obsidian/plugins/claude-code-ide
cp main.js manifest.json /path/to/vault/.obsidian/plugins/claude-code-ide/
```

1. Enable in Obsidian: Settings → Community plugins → Installed plugins → toggle on Obsidian IDE
2. In Claude Code: run `/ide` → select Obsidian

## How it works

The plugin runs an MCP server over WebSocket inside Obsidian.
Claude Code discovers it automatically and shows Obsidian in the `/ide` selector.
Once connected, the plugin sends your current selection and open files to Claude Code.

## Security

The WebSocket server binds to 127.0.0.1, so only local connections are accepted and nothing is exposed to the network. Each session uses a unique authentication token stored in a lock file under `~/.claude/ide/`, ensuring only the Claude Code CLI can connect. All data stays on your machine and is never sent to external servers.
