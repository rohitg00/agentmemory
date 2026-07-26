# agentmemory for Cursor

Cursor-native plugin: **lifecycle hooks** (workspace resolver), **MCP**, and shared **skills**.

Upstream today ships Claude/Codex hooks only. This integration adds `plugin/.cursor-plugin/` + `plugin/hooks/hooks.cursor.json` — the PR-ready layout.

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
5. Confirm hooks log shows `${CURSOR_PLUGIN_ROOT}/scripts/cursor/agentmemory-*`

Only after plugin hooks are confirmed:

```bash
node integrations/cursor/install-local.mjs --clear-user-hooks
```

## Layout (PR target)

```text
agentmemory/                          ← marketplace root (git repo)
  .cursor-plugin/marketplace.json
  plugin/
    .cursor-plugin/plugin.json
    hooks/hooks.cursor.json           ← Cursor camelCase format
    scripts/cursor/agentmemory-*.mjs  ← workspace resolver + detached workers
    skills/                           ← shared with Claude/Codex
    .mcp.json
integrations/cursor/
  install-local.mjs                   ← dev installer
  verify-flow.mjs                     ← smoke test
```

## Hooks

| Hook | Role |
|------|------|
| `sessionStart` | Register session + optional context inject |
| `beforeSubmitPrompt` | Capture user intent |
| `preToolUse` / `postToolUse` | Tool I/O capture |
| `stop` | Episodic summarize (reliable) |
| `sessionEnd` | `session/end` + consolidation |

## sessionEnd (Cursor 3.13.x)

- `window_close`: often broken (`MainThreadShellExec not initialized`)
- Tab close may work — test manually
- `stop` is reliable for summarize, not for `completed` status

## PR checklist

- [ ] `plugin/.cursor-plugin/plugin.json` + `hooks.cursor.json`
- [ ] README: Cursor = MCP + native hooks (not MCP-only)
- [ ] `agentmemory connect cursor` docs update
- [ ] Disable duplicate user `~/.cursor/hooks.json` in docs only (not auto-cleared)
