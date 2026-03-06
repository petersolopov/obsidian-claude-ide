## commands

- `npm run dev` — watch mode, rebuilds on changes
- `npm run build` — production build
- `npm test` — run unit/integration tests
- `npm run typecheck` — TypeScript type check, run before committing

## dev workflow

After code changes, reload the plugin without restarting Obsidian:

```bash
obsidian plugin:reload id=obsidian-claude-bridge
```

## debugging

```bash
obsidian dev:console
obsidian dev:errors
```

No need to ask the user to open DevTools or restart Obsidian.

## architecture

Obsidian plugin that acts as an MCP server over WebSocket. Claude Code discovers the plugin via lock files in `~/.claude/ide/` and connects to exchange RPC messages (initialize, tools/list, tools/call). The plugin exposes Obsidian-specific tools: selection, open editors, workspace folders, file opening. esbuild bundles everything into a single `main.js` for Obsidian to load.
