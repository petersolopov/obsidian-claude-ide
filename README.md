# Obsidian as IDE for Claude Code

Minimal bridge between Obsidian and Claude Code — shares real-time editor context with the CLI, nothing more.

- Zero config — install, enable, `/ide`, done
- Zero dependencies — single `main.js`, no runtime deps
- Send to Claude — select text or a file in Obsidian

https://github.com/user-attachments/assets/79c7e68f-accd-42a8-9508-6d5953aa90c4

## Install

Install from Obsidian Community Plugins:

1. Open Settings → Community plugins → Browse
2. Search for `Claude Code IDE`
3. Install and enable the plugin
4. In Claude Code: run `/ide` → select Obsidian

Or install directly from the [community plugin page](https://community.obsidian.md/plugins/claude-code-ide)

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
```

Copy `main.js` and `manifest.json` to your vault's `.obsidian/plugins/claude-code-ide/` folder, or use `npm run obsidian:install-plugin` (requires `.env` with `OBSIDIAN_VAULT` path — see `AGENTS.md`).

## FAQ

**Why do I need this? Claude Code can already read files in my vault.**

> It can, and it still does. This plugin adds real-time editor context — Claude Code continuously sees which file is open and what text you selected. Instead of "I'm editing notes/project/todo.md, rewrite the second paragraph" you just say "rewrite the second paragraph".

**How is this different from Obsidian CLI?**

> Different layers. Obsidian CLI lets Claude Code run commands — open files, search the vault, rename with automatic link updates. This plugin shares real-time editor context — which file is open, what's selected.

**Is my vault data sent to Anthropic?**

> Yes. Claude Code sends your prompts and context to Anthropic's API — that's how it works, with or without this plugin. If your vault has personal notes you'd rather keep private, point Claude Code at a separate project vault instead.

**Does it work on mobile?**

> No. The plugin needs Node.js APIs that only Obsidian desktop provides. Claude Code itself is a CLI tool, so desktop on both sides.

**Does it work with Gemini CLI / Codex / other agents?**

> No. This plugin implements Claude Code's protocol only — zero dependencies, single file, instant startup. For multi-agent support (Gemini CLI, Codex, OpenCode) check out [Agent Client](https://github.com/RAIT-09/obsidian-agent-client).

More perspectives in [the Reddit thread](https://www.reddit.com/r/ObsidianMD/comments/1rz89qh/connect_obsidian_to_claude_code/).

## See also

- [claudecode.nvim](https://github.com/coder/claudecode.nvim) — Neovim integration, protocol documentation that made this plugin possible
- [obsidian-claude-code-mcp](https://github.com/iansinnott/obsidian-claude-code-mcp) — all-in-one alternative: embedded terminal, Claude Desktop support

## License

[MIT](LICENSE)
