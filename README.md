# Obsidian as IDE for Claude Code

Minimal bridge between Obsidian and Claude Code — shares your selections and open files with the CLI, nothing more.

- Zero config — install, enable, `/ide`, done
- Zero dependencies — single `main.js`, no runtime deps
- Send to Claude — select text or a file in Obsidian

https://github.com/user-attachments/assets/79c7e68f-accd-42a8-9508-6d5953aa90c4

## Install

> Community plugin submission is pending review.

Install with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install BRAT from Community Plugins
2. BRAT settings → Add Beta plugin → `petersolopov/obsidian-claude-ide`
3. Enable in Settings → Community plugins → toggle on Claude Code IDE
4. In Claude Code: run `/ide` → select Obsidian

<details>
<summary>Manual install</summary>

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/petersolopov/obsidian-claude-ide/releases/latest)
2. Create folder `claude-code-ide` in your vault's `.obsidian/plugins/` and put both files there
3. Enable and connect as above

</details>

## How it works

The plugin runs an MCP server over WebSocket inside Obsidian.
Claude Code discovers it automatically and shows Obsidian in the `/ide` selector.
Once connected, Claude Code can see your open files and current selection.
Use the "Send to Claude" command to explicitly pass selected text as context.

Claude Code reads and edits files directly through the filesystem.
The plugin provides editor context in the other direction — open files and selections.
No diff view — edits appear directly in the file.

## Security

- **Localhost only** — WebSocket server binds to `127.0.0.1`, no network exposure
- **Per-session auth** — unique token via `crypto.randomUUID()`, verified on every connection
- **Read-only** — plugin shares selections and open file names, never writes files or executes code
- **Zero runtime dependencies** — single bundled `main.js`, no third-party code at runtime
- **No shared secrets** — auth token readable only by your OS user, discarded on restart

## Tips

Claude Code can call [Obsidian CLI](https://help.obsidian.md/cli) directly through the terminal — open daily notes, move and rename files with automatic link updates, search the vault, and more.
This plugin handles editor context, Obsidian CLI handles the rest.
Run `obsidian help` to see available commands.

## Development

Requires Node.js 24+.

```bash
git clone https://github.com/petersolopov/obsidian-claude-ide
cd obsidian-claude-ide
npm install
npm run build
cp main.js manifest.json /path/to/vault/.obsidian/plugins/claude-code-ide/
```

Enable in Settings → Community plugins → toggle on Claude Code IDE.

## See also

- [claudecode.nvim](https://github.com/coder/claudecode.nvim) — Neovim integration, protocol documentation that made this plugin possible
- [obsidian-claude-code-mcp](https://github.com/iansinnott/obsidian-claude-code-mcp) — all-in-one alternative: embedded terminal, Claude Desktop support

## License

[MIT](LICENSE)
