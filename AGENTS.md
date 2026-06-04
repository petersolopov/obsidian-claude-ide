## commands

- `npm run dev` — watch mode, rebuilds on changes
- `npm run build` — debug build
- `npm test` — run unit/integration tests
- `npm run typecheck` — TypeScript type check, run before committing
- `npm run obsidian:install-plugin` — copy `main.js` and `manifest.json` to vault, reload plugin. Requires `.env` with `OBSIDIAN_VAULT`

## environment

`.env` (gitignored, create manually):

```
OBSIDIAN_VAULT="path/to/your-vault"
OBSIDIAN_VAULT_NAME="vault-name"
OBSIDIAN_TEST_VAULT="path/to/your-test-vault"
```

- `OBSIDIAN_VAULT` — vault where the plugin is installed for development
- `OBSIDIAN_VAULT_NAME` — optional Obsidian CLI vault name, defaults to the basename of `OBSIDIAN_VAULT`
- `OBSIDIAN_TEST_VAULT` — vault used for Community Plugin install/update testing

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
- reload plugin → verify old lock file deleted, new one created with `0o600` permissions

## release

Work happens in `release/X.Y.Z` branch (create when first commit appears). Master always matches the latest release. After a release, never commit directly to master — create `release/X.Y.Z` for the next version first.

Infrastructure-only maintenance that does not change release artifacts
(`main.js`, `manifest.json`, package versions, or `versions.json`) may be
committed directly to `master`. Examples: GitHub Actions maintenance and
repository metadata. Do not bump versions or create a release tag for those
changes.

The release workflow runs on pushed tags. It uses Node 24, runs typecheck,
tests, and a production build, creates artifact attestations for `main.js`
and `manifest.json`, then creates the GitHub Release with official
`gh release create --verify-tag --generate-notes`.

The README title intentionally does not match `manifest.json`. The title
`Obsidian as IDE for Claude Code` explains the product better, so that
Community Plugin scorecard warning is accepted.

Bump in `manifest.json`, `package.json`, `package-lock.json`, `versions.json`.
Commit the release candidate.

Before pushing the release tag, run the full regression checklist above
against the bumped release candidate.

Then run a production build and install it into the development vault:

```bash
npm run build -- --production && npm run obsidian:install-plugin
```

Verify console is silent (no debug logs). Repeat manual checks from regression (skip typecheck/test/build steps).

Push, merge, and tag:

```bash
git push origin release/X.Y.Z
git checkout master
git merge release/X.Y.Z --no-ff -m "release: X.Y.Z"
git tag X.Y.Z
git push origin master --tags
```

Wait for CI and inspect the release:

```bash
gh run watch
gh release view X.Y.Z
```

Inspect the release notes. If generated notes contain only the changelog
link or are too sparse, edit the release body with concise user-facing
`Changes` notes. Keep verification details in the internal release log,
not in public release notes.

Download release assets and verify provenance:

```bash
RELEASE_DIR=$(mktemp -d)
gh release download X.Y.Z --dir "$RELEASE_DIR" --pattern main.js --pattern manifest.json
gh attestation verify "$RELEASE_DIR/main.js" -R petersolopov/obsidian-claude-ide
gh attestation verify "$RELEASE_DIR/manifest.json" -R petersolopov/obsidian-claude-ide
```

Compare release asset sha256 values against a clean production build from
tag `X.Y.Z`.

After the Obsidian Community Plugin directory indexes the release, install
or update the plugin from Community Plugins in the test vault. Verify the
installed manifest reports `X.Y.Z`:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.OBSIDIAN_TEST_VAULT + '/.obsidian/plugins/claude-code-ide/manifest.json', 'utf8')).version)"
```

Repeat the manual regression checklist against the Community Plugin install.

Cleanup:

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
