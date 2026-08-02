# agentmemory for Amp (Sourcegraph)

Persistent memory for [Amp](https://ampcode.com) via the [agentmemory](https://github.com/rohitg00/agentmemory) memory engine.

## What this gives you

- **Auto-capture**: Every tool call, tool result, and user prompt is automatically POSTed to the agentmemory REST API (`localhost:3111`). No manual `memory_save` calls needed.
- **Cross-session recall**: Relevant memories from past sessions are available at the start of new threads via `memory_recall` / `memory_smart_search` tools.
- **Context injection** (optional): Set `AGENTMEMORY_INJECT_CONTEXT=true` to have recalled context automatically injected into the agent's first turn.
- **Command palette**: `/recall`, `/remember`, `/session-history` commands for explicit memory operations.

## Prerequisites

1. **Amp** installed (`amp` on PATH) — https://ampcode.com/install
2. **agentmemory server** running:
   ```bash
   npx @agentmemory/agentmemory
   ```
   Verify: `curl http://localhost:3111/agentmemory/health`

## Install

### Option A: One command (MCP + plugin)

```bash
agentmemory connect amp --with-hooks
```

This writes the MCP server config to `~/.config/amp/settings.json` (or `%APPDATA%\amp\settings.json` on Windows) AND copies the plugin file to `~/.config/amp/plugins/agentmemory.ts`.

Restart Amp (or run `plugins: reload` from the command palette) to pick up the changes.

### Option B: Manual

1. Copy `agentmemory.ts` to `~/.config/amp/plugins/agentmemory.ts` (or `.amp/plugins/` for project scope).

2. Add the MCP server to your Amp settings:
   ```json
   {
     "amp.mcpServers": {
       "agentmemory": {
         "command": "npx",
         "args": ["-y", "@agentmemory/mcp"],
         "env": {
           "AGENTMEMORY_URL": "http://localhost:3111"
         }
       }
     }
   }
   ```

3. Run `plugins: reload` from the Amp command palette (`Ctrl+O`).

## How it works

### Event mapping

| Amp event | agentmemory REST endpoint | hookType |
|---|---|---|
| `session.start` | `POST /agentmemory/session/start` | — |
| `agent.start` | `POST /agentmemory/observe` | `prompt_submit` |
| `tool.call` | (allowed, no interception) | — |
| `tool.result` (done) | `POST /agentmemory/observe` | `post_tool_use` |
| `tool.result` (error) | `POST /agentmemory/observe` | `post_tool_failure` |
| `agent.end` | `POST /agentmemory/summarize` + `/session/end` | — |

### Registered tools

- `memory_recall` — keyword search of past observations
- `memory_save` — save an insight, decision, or fact
- `memory_smart_search` — hybrid semantic + keyword search
- `memory_sessions` — list recent sessions

When the MCP server is also wired, all 53 agentmemory MCP tools are available in addition to these plugin tools.

### Registered commands

- `agentmemory-recall` — search memories from the command palette
- `agentmemory-remember` — save a memory from the command palette
- `agentmemory-session-history` — list recent sessions

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | agentmemory REST server URL |
| `AGENTMEMORY_SECRET` | (none) | Bearer token for authenticated deployments |
| `AGENTMEMORY_INJECT_CONTEXT` | `false` | Set to `true` to auto-inject recalled context |
| `AGENTMEMORY_PROJECT_NAME` | git toplevel basename | Override project name |
| `AGENTMEMORY_AMP_DEBUG` | `0` | Set to `1` for debug logging |

## Remote deployments

Point the plugin at a remote agentmemory instance:

```bash
export AGENTMEMORY_URL=https://agentmemory.my-company.com
export AGENTMEMORY_SECRET=my-token
```

The plugin and MCP shim both respect these environment variables.