# AgentMemory for Pi

Persistent memory shared with your other coding agents. Tested with Pi 1.4.0.

## Install

Start AgentMemory in a separate terminal, then connect Pi:

```bash
agentmemory
agentmemory connect pi --with-mcp
```

The connector installs the compiled extension and 17 skills in `~/.pi/agent/agentmemory`, registers the package in `settings.json`, and adds the full MCP toolset in `mcp.json`. It respects `PI_CODING_AGENT_DIR`, preserves other settings and existing MCP servers, and backs up replaced files. Customized extension files require `--force`. Reconnect after upgrading AgentMemory to refresh the bundled runtime paths. Omit `--with-mcp` for the three native tools only.

Alternatively, after the first npm publication:

```bash
pi install npm:@agentmemory/pi
```

From a source checkout, build the package before installing it:

```bash
npm install
npm run plugin:pack:pi
pi install ./integrations/pi
```

Pi keeps a reference to a local checkout; keep it in place. The archive is written to `dist/plugins/`. It contains the compiled extension, skills and license; Pi supplies the runtime dependencies.

Use one extension installation method. Before migrating an old copied installation, move `~/.pi/agent/extensions/agentmemory` outside Pi's extensions directory and remove explicit settings entries pointing to that copy. Keep it as a backup. Before switching a connector installation to npm, remove its local path from `settings.json.packages`. `connect pi --with-mcp` recognizes an existing global npm or local package and only adds MCP when needed.

Restart Pi or run `/reload`, then `/agentmemory-status`. Keep the memory server running. Manage an npm installation with `pi update` and `pi remove npm:@agentmemory/pi`. Removing a package does not remove separately configured MCP settings; remove `mcpServers.agentmemory` from `mcp.json` if desired.

## Tools, commands and capture

- `memory_health`, `memory_search`, `memory_save`: native server health, project recall and deliberate saves.
- `/agentmemory-status`: health plus pending, retained, dropped and rejected capture counts; also retries queued captures.
- `/skill:remember`, `/skill:recall`, `/skill:session-history`, `/skill:recap`, `/skill:handoff`, `/skill:lesson`, `/skill:forget`, `/skill:commit-context`, `/skill:commit-history`: bundled workflows. Pi also discovers eight reference skills. Workflows referring to tools beyond native save/search require MCP.
- With `--with-mcp`, Pi exposes the full server toolset under `mcp__agentmemory__*`. Native operations use the active repository's project scope; MCP callers must pass their intended project explicitly. Project MCP settings override global entries only in trusted projects.

Prompts, tool results, failures and final replies are captured with privacy filtering before truncation. Memory tools are excluded by default to avoid capturing recalled data again. The model still sees the original tool results. Temporary delivery failures are queued locally and replayed on startup, subsequent prompts, status checks and every ten seconds. The queue is bounded; inspect status for dropped or rejected captures. Capture does not replace deliberate memory saves.

Recall is inserted as reference data, separate from the system prompt. Completed compaction refreshes memory context before the next model call. `/reload` flushes capture without ending the active session; quit, new, resume and fork close the previous session. Requests and shutdown waits are bounded.

## Configuration

Set these in Pi's launch environment:

| Variable | Default | Purpose |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | Server URL |
| `AGENTMEMORY_SECRET` | Local credential | Explicit bearer token; otherwise loopback URLs read `~/.agentmemory/.env`, then `~/.agentmemory/secret` |
| `AGENTMEMORY_CREDENTIAL_MODE` | Local discovery | `explicit` disables local credential lookup |
| `AGENTMEMORY_PROJECT_NAME` | Repository basename | Override native memory scope; worktrees share their repository scope |
| `AGENTMEMORY_TOOL_OBSERVE` | Enabled | `0` disables automatic tool-result capture |
| `AGENTMEMORY_CAPTURE_ALLOW` / `AGENTMEMORY_CAPTURE_DENY` | Shared capture defaults | Tool-name filters; an explicit allow list overrides defaults |
| `AGENTMEMORY_CAPTURE_OUTPUT_MAX` | `8000` | Maximum captured text length |
| `AGENTMEMORY_CAPTURE_SPOOL` | Enabled | `false` disables offline queuing |
| `AGENTMEMORY_CAPTURE_SPOOL_DIR` | Platform data directory | Override the private local queue directory |
| `AGENTMEMORY_INJECT_CONTEXT` | Off | `1` adds file-related memory after read/write/edit calls |
| `AGENTMEMORY_PRE_COMPACT_BUDGET` | `1500` | Context budget after compaction; `0` disables it |

Bearer credentials are never sent over remote plaintext HTTP. Use HTTPS or an SSH tunnel to a loopback address. Redirects are rejected. Remote URLs never inherit a local daemon credential.

## Verify

Run `/agentmemory-status`, save a distinctive fact with `memory_save`, and retrieve it using `memory_search` in a new session. Confirm `/skill:remember` is listed. With MCP enabled, ask Pi to list sessions through `mcp__agentmemory__memory_sessions`.

For offline recovery, stop the memory server, complete a harmless file operation in Pi, and check the pending capture count. Restart the same server and run `/agentmemory-status`; pending captures should drain. A failed search reports failure rather than claiming that no memories exist.
