## commands

- `npm run dev` — watch mode, rebuilds on changes
- `npm run build` — production build
- `npm test` — run unit/integration tests
- `npm run typecheck` — TypeScript type check, run before committing
- `npm run obsidian:install-plugin` — build → copy to vault → enable. Requires `.env` with `OBSIDIAN_VAULT`

## environment

`.env` (gitignored, create manually):

```
OBSIDIAN_VAULT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/your-vault"
OBSIDIAN_TEST_VAULT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/your-test-vault"
```

- `OBSIDIAN_VAULT` — vault where the plugin is installed for development
- `OBSIDIAN_TEST_VAULT` — vault with BRAT, for testing release installs

## dev workflow

esbuild outputs `main.js` to the project root.

```bash
npm run build && npm run obsidian:install-plugin
```

## debugging

```bash
obsidian dev:console
obsidian dev:errors
```

No need to ask the user to open DevTools or restart Obsidian.

## architecture

Obsidian plugin that acts as an MCP server over WebSocket. Claude Code discovers the plugin via lock files in `~/.claude/ide/` and connects to exchange RPC messages (initialize, tools/list, tools/call). The plugin exposes Obsidian-specific tools: selection, open editors, workspace folders, file opening. esbuild bundles everything into a single `main.js` for Obsidian to load.

## naming

Plugin name: `Claude Code IDE`, ID: `claude-code-ide`. Renamed from "Obsidian IDE" because community plugin review prohibits "Obsidian" in name, description, and ID. README header uses "Obsidian as IDE for Claude Code" for clarity. ID uses "claude-code-ide" because community plugins prohibit "obsidian-" prefix. In Claude Code `/ide` selector, "Obsidian" appears as the IDE — configured via `ideName` in the lock file.

## regression

Requires a second Claude Code session from the vault directory, connected via `/ide`.

```bash
npm run typecheck
npm test
npm run build && npm run obsidian:install-plugin
```

Enable debug capture with `obsidian dev:debug on`. Check console for `[DEBUG] [claude-code-ide] vX.Y.Z listening on 127.0.0.1:PORT`.

- `/ide` → select Obsidian
- select text → ask "what do I have selected?"
- switch to another file → ask which file is open
- Send to Claude (Cmd+P) without selection → sends whole file
- Send to Claude with selection → sends file with `:L` line number
- open file with spaces in name → select text → verify path is correct

## release

Work happens in `release/X.Y.Z` branch (create when first commit appears). Master always matches the latest release. After a release, never commit directly to master — create `release/X.Y.Z` for the next version first.

**1. Regression** — run the full regression checklist above

**2. Prod build**

```bash
npm run build -- --production && npm run obsidian:install-plugin
```

Verify console is silent (no debug logs). Repeat regression.

**3. Version bump**

Bump in `manifest.json`, `package.json`, `package-lock.json`, `versions.json`. Commit.

**4. Push, merge, tag**

```bash
git push origin release/X.Y.Z
git checkout master
git merge release/X.Y.Z --no-ff -m "release: X.Y.Z"
git tag X.Y.Z
git push origin master --tags
```

**5. CI + release assets**

`gh run watch` — wait for green. Download `main.js` from release, verify size matches local prod build.

**6. BRAT regression**

Update plugin in test vault via BRAT. Verify version in `$OBSIDIAN_TEST_VAULT/.obsidian/plugins/claude-code-ide/manifest.json`. Repeat regression.

**7. Cleanup**

```bash
git branch -d release/X.Y.Z
git push origin --delete release/X.Y.Z
```

Update project tracker.

## protocol reference

Reverse-engineered protocol doc from nvim plugin: https://raw.githubusercontent.com/coder/claudecode.nvim/refs/heads/main/PROTOCOL.md

## how Claude Code uses IDE tools

Claude Code CLI sits between the model and the IDE MCP server. Most IDE tools are CLI-internal — the model never sees them.

CLI **internally** calls tools on the IDE server via `tools/call`:
- `closeAllDiffTabs` and `getDiagnostics` — confirmed in Obsidian logs
- `openDiff` — confirmed in VS Code (CLI shows diff when model uses `Edit`). Not implemented in Obsidian — no diff view
- `openFile`, `close_tab`, `set_permission_mode` — found in CLI binary, not confirmed in practice

Two exceptions — `executeCode` and `getDiagnostics` — are exposed to the model (hardcoded whitelist in CLI binary as of v2.1.71).

Selection works via broadcast: the plugin sends `selection_changed` notifications, CLI handles them and shows context to the model.
