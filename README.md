# Obsidian IDE

Connect Obsidian to Claude Code as an IDE.

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

Once enabled, Claude Code detects Obsidian and shows it in the IDE selector.
The plugin sends your current selection and open files to Claude Code automatically.
