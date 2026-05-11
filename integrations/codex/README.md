# agentmemory for Codex

Codex supports agentmemory in two layers:

1. MCP tools for explicit memory actions such as `memory_save`,
   `memory_recall`, and `memory_smart_search`.
2. Codex lifecycle hooks for Claude Code-style automatic capture of prompts,
   tool calls, tool results, and turn endings.

Use both layers if you want Codex Desktop or Codex CLI to behave more like the
Claude Code plugin.

## Prerequisites

- Codex Desktop or Codex CLI with MCP and hooks support.
- Node.js 20 or newer.
- A running agentmemory server for full capture, viewer, and shared memory:

```bash
npx -y @agentmemory/agentmemory
```

The server exposes:

- REST API: `http://localhost:3111/agentmemory/*`
- Viewer: `http://localhost:3113`

On Windows, the full server also needs either Docker Desktop or the prebuilt
`iii.exe` runtime described in the main README. Standalone MCP works without
the full server, but automatic hooks need the REST API.

> **API stability:** Codex hook event names and payload fields are still evolving.
> This integration was smoke-tested against Codex Desktop `26.429.8261.0` and
> Codex CLI `0.128.0` on Windows. If a newer Codex release changes hook payloads,
> keep the MCP config and update only the hook bridge mapping.

## 1. Add the MCP server

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.agentmemory]
command = "npx"
args = ["-y", "@agentmemory/mcp"]
env = { AGENTMEMORY_TOOLS = "all" }
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled = true
```

Restart Codex. You should see the agentmemory MCP tools in Codex.

## 2. Install the Codex hook bridge

Copy `agentmemory-codex-hook.mjs` from this directory to a stable local path.

Examples:

```bash
mkdir -p ~/.codex/hooks
cp integrations/codex/agentmemory-codex-hook.mjs ~/.codex/hooks/
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path $env:USERPROFILE\.codex\hooks
Copy-Item integrations\codex\agentmemory-codex-hook.mjs $env:USERPROFILE\.codex\hooks\
```

## 3. Enable Codex hooks

Add the feature flag to `~/.codex/config.toml`:

```toml
[features]
codex_hooks = true
```

Then add hook registrations. Adjust the `command` path for your machine.

macOS/Linux:

```toml
[[hooks.SessionStart]]
matcher = "startup|resume"

[[hooks.SessionStart.hooks]]
type = "command"
command = 'node "$HOME/.codex/hooks/agentmemory-codex-hook.mjs"'
timeout = 10
statusMessage = "Loading agentmemory context"

[[hooks.UserPromptSubmit]]

[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = 'node "$HOME/.codex/hooks/agentmemory-codex-hook.mjs"'
timeout = 5
statusMessage = "Capturing prompt to agentmemory"

[[hooks.PreToolUse]]
matcher = "*"

[[hooks.PreToolUse.hooks]]
type = "command"
command = 'node "$HOME/.codex/hooks/agentmemory-codex-hook.mjs"'
timeout = 5
statusMessage = "Capturing tool intent"

[[hooks.PostToolUse]]
matcher = "*"

[[hooks.PostToolUse.hooks]]
type = "command"
command = 'node "$HOME/.codex/hooks/agentmemory-codex-hook.mjs"'
timeout = 5
statusMessage = "Capturing tool result"

[[hooks.Stop]]

[[hooks.Stop.hooks]]
type = "command"
command = 'node "$HOME/.codex/hooks/agentmemory-codex-hook.mjs"'
timeout = 8
statusMessage = "Capturing turn summary"
```

Windows:

```toml
[[hooks.SessionStart]]
matcher = "startup|resume"

[[hooks.SessionStart.hooks]]
type = "command"
command = 'node "C:\Users\YOUR_USER\.codex\hooks\agentmemory-codex-hook.mjs"'
timeout = 10
statusMessage = "Loading agentmemory context"

[[hooks.UserPromptSubmit]]

[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = 'node "C:\Users\YOUR_USER\.codex\hooks\agentmemory-codex-hook.mjs"'
timeout = 5
statusMessage = "Capturing prompt to agentmemory"

[[hooks.PreToolUse]]
matcher = "*"

[[hooks.PreToolUse.hooks]]
type = "command"
command = 'node "C:\Users\YOUR_USER\.codex\hooks\agentmemory-codex-hook.mjs"'
timeout = 5
statusMessage = "Capturing tool intent"

[[hooks.PostToolUse]]
matcher = "*"

[[hooks.PostToolUse.hooks]]
type = "command"
command = 'node "C:\Users\YOUR_USER\.codex\hooks\agentmemory-codex-hook.mjs"'
timeout = 5
statusMessage = "Capturing tool result"

[[hooks.Stop]]

[[hooks.Stop.hooks]]
type = "command"
command = 'node "C:\Users\YOUR_USER\.codex\hooks\agentmemory-codex-hook.mjs"'
timeout = 8
statusMessage = "Capturing turn summary"
```

Restart Codex after editing the config.

## What gets captured

The bridge maps Codex hook events to agentmemory observations:

| Codex hook | agentmemory hook type | Captures |
| --- | --- | --- |
| `SessionStart` | session start API | Session id, project, cwd, recalled context |
| `UserPromptSubmit` | `prompt_submit` | User prompt, turn id, model |
| `PreToolUse` | `pre_tool_use` | Tool name and input |
| `PostToolUse` | `post_tool_use` | Tool name, input, and output |
| `Stop` | `stop` | Latest assistant message and turn id |

The bridge truncates large tool outputs before sending them to the REST API.
It never throws or blocks Codex if agentmemory is unavailable.

## Custom server URL and auth

The hook bridge reads the same environment variables as the other agentmemory
integrations:

```bash
AGENTMEMORY_URL=http://localhost:3111
AGENTMEMORY_SECRET=your-secret
```

Set `AGENTMEMORY_URL` when the server is not on `localhost:3111`. Set
`AGENTMEMORY_SECRET` when the agentmemory REST API requires bearer auth; the hook
will send `Authorization: Bearer <secret>` on every request.

For shared or corporate deployments, set these variables in the shell or launch
environment that starts Codex. The script intentionally writes no debug output
to stdout, because Codex hook stdout may become user-visible context.

## Context injection

By default, `SessionStart` writes recalled agentmemory context back to Codex as
additional developer context when the server returns context. Disable this with:

```bash
AGENTMEMORY_CODEX_INJECT_CONTEXT=false
```

You can also tune capture size:

```bash
AGENTMEMORY_CODEX_MAX_TOOL_OUTPUT=8000
AGENTMEMORY_CODEX_MAX_ASSISTANT_MESSAGE=12000
AGENTMEMORY_CODEX_REST_TIMEOUT_MS=4000
```

## Verify

1. Start agentmemory:

   ```bash
   npx -y @agentmemory/agentmemory
   ```

2. Restart Codex and run a short prompt that uses a tool.
3. Open the viewer at `http://localhost:3113`.
4. Check `Sessions`, `Timeline`, or export:

   ```bash
   curl http://localhost:3111/agentmemory/export
   ```

You should see a Codex session with prompt and tool observations.

## Notes and limitations

- Codex hooks are a feature flag and may evolve.
- Codex does not expose every Claude Code lifecycle event, so this is not a
  byte-for-byte replacement for the Claude Code plugin.
- The important loop is covered: automatic capture, session registration,
  startup context recall, and explicit MCP memory tools.
