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
