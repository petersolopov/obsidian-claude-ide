# Community plugin 0.2.4 release design

## Goal

Publish `obsidian-claude-ide` version `0.2.4` and clean up the
Obsidian Community Plugin scorecard issues that are actionable without
weakening the public positioning of the plugin.

The release should make Community Plugins the primary install path,
remove the outdated BRAT-first install instructions, add GitHub release
provenance, publish non-empty release notes, and address source-code
warnings from the Obsidian plugin admin dashboard.

## Proposed approach

Use a practical scorecard cleanup release.

Fix the warnings that reflect real source or release-process problems:

- Parse lock files through an explicit `unknown` JSON boundary instead
  of using `JSON.parse` as `any`
- Use Obsidian `activeWindow` timer APIs where the plugin schedules
  browser-window timers
- Replace the third-party release action with official `gh release create`
  in CI
- Add GitHub artifact attestations for release assets
- Generate release notes automatically during CI release creation
- Update README and AGENTS.md so install and release instructions match
  the new Community Plugin process

Keep the README title `Obsidian as IDE for Claude Code`. The Obsidian
scorecard warning expects the README title to match `manifest.json`, but
the current title explains the product better. Treat that warning as an
accepted limitation.

## Step-by-step implementation strategy

1. Keep the `.gitignore` exception that allows `docs/spec/` to contain
   committed NeoPlan design documents while other ad hoc `docs/` content
   stays ignored. This was completed with the design-doc commit.

2. Update `src/lock.ts` to parse existing lock files through a small
   typed boundary:
   - Read file content as a string
   - Parse JSON into `unknown`
   - Inspect it as `Record<string, unknown>`
   - Preserve enough shape information to skip non-Obsidian locks
   - Treat malformed Obsidian lock files as stale/corrupt and remove them

3. Extend `test/lock.test.ts` for the lock parser behavior:
   - Malformed JSON is removed
   - Obsidian lock without a numeric `pid` is removed
   - Non-Obsidian lock files are preserved even when their `pid` is not
     useful to this plugin

4. Update timer usage:
   - Import `activeWindow` in `src/main.ts`
   - Use `activeWindow.setTimeout` and `activeWindow.clearTimeout`
   - Register the focus listener on `activeWindow`
   - Import `activeWindow` in `src/server.ts`
   - Use `activeWindow.setInterval` and `activeWindow.clearInterval`
   - Update the test `obsidian` loader stub to export `activeWindow`
     with `setTimeout`, `clearTimeout`, `setInterval`, and
     `clearInterval`

5. Update test runner script:
   - Remove `--experimental-strip-types` from `npm test`
   - Keep the existing Obsidian loader import

6. Update release workflow:
   - Keep `contents: write`
   - Add `id-token: write`
   - Add `attestations: write`
   - Use Node `24`
   - Run `npm run typecheck`
   - Run `npm test`
   - Build production `main.js`
   - Attest `main.js` and `manifest.json` with `actions/attest@v4`
   - Create the release with official `gh release create`
   - Use `--verify-tag`, `--generate-notes`, and explicit assets

7. Update README:
   - Make Community Plugins the primary install path
   - Remove BRAT from the visible install flow
   - Keep manual install as the fallback
   - Keep the current title

8. Update AGENTS.md:
   - Document the new release checklist
   - Add attestation verification
   - Replace mandatory BRAT regression with Community install/update
     verification
   - Note the intentional README title mismatch as a known scorecard
     limitation

9. Bump version to `0.2.4`:
   - `manifest.json`
   - `package.json`
   - `package-lock.json`
   - `versions.json`

10. Run local verification:
    - `npm run typecheck`
    - `npm test`
    - `npm run build -- --production`

11. Run manual Obsidian regression before publishing:
    - `npm run build -- --production && npm run obsidian:install-plugin`
    - Verify the production console is silent
    - Connect Claude Code with `/ide`
    - Verify open-file context and selected-text context
    - Verify "Send to Claude" with and without selection
    - Verify a file with spaces in its name still produces a valid path
    - Reload the plugin and verify lock-file cleanup/recreation behavior

12. Final code review:
    - Review the full diff for behavioral regressions, docs drift, and
      release-flow inconsistencies
    - Fix findings before committing and publishing the release
    - Rerun targeted checks after fixes

13. Commit the implementation and version bump in logical commits

14. Publish release:
    - Push `release/0.2.4`
    - Merge to `master` according to the project release flow
    - Tag `0.2.4`
    - Push `master` and tags

15. Deploy and verify:
    - Wait for GitHub Actions with `gh run watch`
    - Confirm the GitHub Release exists and has non-empty notes
    - Download release `main.js` and `manifest.json`
    - Compare sha256 with a clean build from tag `0.2.4`
    - Verify artifact attestation with `gh attestation verify`
    - Check the Obsidian Community page and dashboard for scorecard changes
    - After the Community directory indexes `0.2.4`, install or update the
      plugin from Community Plugins in the test vault
    - Verify the installed test-vault plugin manifest reports `0.2.4`

16. Retro:
    - Record what scorecard warnings were resolved
    - Record any remaining false positives or intentionally accepted
      warnings
    - Update the project tracker after the release is verified

## Dependencies and sequencing

The source fixes should land before the version bump. The version bump
should land before tagging. The tag should be pushed only after local
typecheck, tests, and production build pass.

Manual Obsidian regression should happen before pushing the release tag.
Release asset verification depends on the GitHub Actions release job.
Community scorecard and Community install/update verification depend on
Obsidian processing the new release, so they may lag behind the GitHub
release.

The design document requires a `.gitignore` exception for `docs/spec/`
before it can be committed.

## Anticipated challenges

Obsidian build verification may still report a mismatch even when the
release asset is reproducible. The `0.2.3` release was locally rebuilt
from source and matched the published `main.js` byte-for-byte, so the
current warning appears to be a scanner false positive or a mismatch in
their build recipe.

Timer changes in `src/server.ts` introduce an Obsidian API import into a
module that otherwise looks server-like. This is acceptable because the
bundle is an Obsidian desktop plugin, not a reusable server package.
Avoid adding timer injection solely for this warning.

`gh release create --generate-notes` depends on commit history between
tags. If generated notes are too sparse, edit the release body after CI
or add a concise manual notes prefix in the workflow later.

Removing `--experimental-strip-types` assumes local development uses
Node `22.18` or newer. CI will use Node `24`, but AGENTS.md should keep
the local runtime prerequisite visible.

## Testing strategy

Use focused unit tests for the lock parser changes and the existing
server/tool tests for regression coverage.

Run:

```bash
npm run typecheck
npm test
npm run build -- --production
```

After publishing, verify release assets:

```bash
gh release download 0.2.4 --pattern main.js --pattern manifest.json
gh attestation verify main.js -R petersolopov/obsidian-claude-ide
```

Then compare sha256 of the release assets against a clean production
build from tag `0.2.4`.

Before publishing the tag, install the production build into the
development vault and run the manual Obsidian regression checklist.

## Docs changes required

README needs the install section updated for Community Plugins and the
BRAT-first flow removed.

AGENTS.md needs the release checklist updated for GitHub CLI release
creation, release notes, artifact attestations, release asset checksum
verification, manual Obsidian regression before tag push, and Community
install/update verification after the directory indexes the new release.

The project tracker should be updated after `0.2.4` is published and
verified.

## Decisions log

- **Practical scorecard cleanup** — fix actionable source and release
  issues while keeping product positioning intact
- **Keep README title** — the current title communicates the plugin's
  purpose better than the manifest name; the checker warning is accepted
- **Remove BRAT from README** — Community Plugins is now the primary
  install path; BRAT is unnecessary unless a beta channel is created
- **Use official `gh release create`** — avoids a third-party release
  action with `GITHUB_TOKEN` access and keeps the workflow simple
- **Keep `actions/attest`** — official GitHub attestation action is the
  intended path for release provenance
- **Use Node 24 in release CI** — Node 24 is the current LTS and matches
  the README development requirement
- **Do not over-abstract timers** — importing `activeWindow` directly in
  the Obsidian plugin modules is simpler than adding timer injection
- **Allow `docs/spec/` in git** — NeoPlan design docs are committed
  project artifacts; other `docs/` content remains ignored

## Known limitations

The README title warning may remain in the Obsidian dashboard.

The manual review prefix in `community-plugins.json` cannot be removed
from this repository. It is controlled by Obsidian's Community Plugin
process and dashboard.

The build verification warning may remain if the Obsidian scanner uses a
different build recipe or has a false positive. The release process will
produce local and CI evidence that the asset was built from source.
