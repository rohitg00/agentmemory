# agentmemory for Cursor

Cursor-native plugin: **lifecycle hooks** (thin shim + workspace resolver), **MCP**, and shared **skills**.

Hooks delegate to the canonical compiled scripts in `plugin/scripts/*.mjs` (from `src/hooks/*.ts`). The only Cursor-specific code lives in `plugin/scripts/cursor/`.

## Quick local install

Prereq: `~/.agentmemory/.env` with `AGENTMEMORY_URL` and `AGENTMEMORY_SECRET`.

```bash
node integrations/cursor/install-local.mjs
node integrations/cursor/verify-flow.mjs
```

Then in Cursor:

1. **Settings → Plugins → Add marketplace** → select the **repo root**  
   `<path-to-your-agentmemory-clone>`  
   (must contain `.cursor-plugin/marketplace.json`)
2. Enable plugin **agentmemory**
3. **Disable** the old `rohitg00/agentmemory` marketplace entry if both are on
4. **Developer: Reload Window**
5. Confirm hooks log shows `scripts/cursor/run-hook.mjs` or `run-detached.mjs`

Only after plugin hooks are confirmed:

```bash
node integrations/cursor/install-local.mjs --clear-user-hooks
```

## Layout

```text
agentmemory/                          ← marketplace root (git repo)
  .cursor-plugin/marketplace.json
  plugin/
    .cursor-plugin/plugin.json
    hooks/hooks.cursor.json           ← Cursor camelCase format
    scripts/cursor/
      workspace.mjs                   ← resolveWorkspace()
      run-hook.mjs                    ← shim → plugin/scripts/*.mjs
      run-detached.mjs                ← non-blocking stop / sessionEnd
    scripts/*.mjs                     ← canonical hooks (shared with Claude/Codex)
    skills/
    .mcp.json
integrations/cursor/
  install-local.mjs
  verify-flow.mjs
  close-stale-am-sessions.mjs         ← dev utility
  migrate-bad-projects.mjs            ← one-off migration for bad .cursor projects
```

## Hooks

| Hook | Shim | Delegates to |
|------|------|--------------|
| `sessionStart` | `run-hook.mjs` | `session-start.mjs` |
| `beforeSubmitPrompt` | `run-hook.mjs` | `prompt-submit.mjs` |
| `preToolUse` / `postToolUse` | `run-hook.mjs` | `pre-tool-use.mjs` / `post-tool-use.mjs` |
| `stop` | `run-detached.mjs` | `stop.mjs` |
| `sessionEnd` | `run-detached.mjs` | `session-end.mjs` |

The shim calls `resolveWorkspace()`, sets `AGENTMEMORY_PROJECT_NAME`, enriches `cwd` on the payload, then spawns the official hook script.

## sessionEnd (Cursor 3.13.x)

- `window_close`: often broken (`MainThreadShellExec not initialized`)
- Tab close may work — test manually
- `stop` is reliable for summarize; treat `sessionEnd` as best-effort until Cursor fixes lifecycle on their side

## Dev utilities

```bash
node integrations/cursor/close-stale-am-sessions.mjs --dry-run
node integrations/cursor/migrate-bad-projects.mjs --dry-run
```

`migrate-bad-projects.mjs` is for legacy sessions stored with `project=.cursor` only. The resolver should prevent new bad data.

## PR checklist

- [x] `plugin/.cursor-plugin/plugin.json` + `hooks.cursor.json`
- [x] Shim delegates to `plugin/scripts/*.mjs` (no duplicated hook logic)
- [ ] README: Cursor = MCP + native hooks (not MCP-only) — upstream root README
- [ ] `agentmemory connect cursor` docs update
- [x] Disable duplicate user `~/.cursor/hooks.json` in docs only (not auto-cleared)
