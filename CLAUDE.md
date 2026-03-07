## commands

- `npm run dev` — watch mode, rebuilds on changes
- `npm run build` — production build
- `npm test` — run unit/integration tests
- `npm run typecheck` — TypeScript type check, run before committing

## dev workflow

After code changes, reload the plugin without restarting Obsidian:

```bash
obsidian plugin:reload id=obsidian-claude-ide
```

## debugging

```bash
obsidian dev:console
obsidian dev:errors
```

No need to ask the user to open DevTools or restart Obsidian.

## architecture

Obsidian plugin that acts as an MCP server over WebSocket. Claude Code discovers the plugin via lock files in `~/.claude/ide/` and connects to exchange RPC messages (initialize, tools/list, tools/call). The plugin exposes Obsidian-specific tools: selection, open editors, workspace folders, file opening. esbuild bundles everything into a single `main.js` for Obsidian to load.

## protocol reference

Reverse-engineered protocol doc from nvim plugin: https://raw.githubusercontent.com/coder/claudecode.nvim/refs/heads/main/PROTOCOL.md

## how Claude Code uses IDE tools

Claude Code CLI sits between the model and the IDE MCP server. Most IDE tools are CLI-internal — the model never sees them.

CLI **internally** calls tools on the IDE server via `tools/call`:
- `closeAllDiffTabs` and `getDiagnostics` — confirmed in Obsidian logs
- `openDiff` — confirmed in VS Code (CLI shows diff when model uses `Edit`)
- `openFile`, `close_tab`, `set_permission_mode` — found in CLI binary, not confirmed in practice

Two exceptions — `executeCode` and `getDiagnostics` — are exposed to the model (hardcoded whitelist in CLI binary as of v2.1.71).

Selection works via broadcast: the plugin sends `selection_changed` notifications, CLI handles them and shows context to the model.
