# agentmemory for pi

Persistent cross-session memory via [agentmemory](https://github.com/rohitg00/agentmemory), shared with Claude Code, Codex CLI, Gemini CLI, Hermes, OpenClaw, and more.

## Quick setup

Start the agentmemory server in a separate terminal:

```bash
npx -y @agentmemory/agentmemory@latest
```

Install the package from an agentmemory checkout:

```bash
pi install ./integrations/pi
```

After the first npm publication, install without a checkout:

```bash
pi install npm:@agentmemory/pi
```

Run `/reload` in pi, then `/agentmemory-status`. Keep the agentmemory server running while using the extension.

Alternatively, `npx -y @agentmemory/agentmemory@latest connect pi` copies the bundled extension into `~/.pi/agent/extensions/agentmemory/`. Use one installation method. Before switching to a pi package, move any existing copied extension outside pi's extensions directory and remove explicit settings entries for that copy to avoid loading it twice.

## What it adds

- `memory_health` — confirm the shared memory server is reachable
- `memory_search` — search prior decisions, bugs, workflows, and preferences
- `memory_save` — write durable facts back to long-term memory
- `/agentmemory-status` — check health from inside pi
- `before_agent_start` recall — injects relevant memories into the prompt
- `agent_end` capture — saves completed conversation turns back to agentmemory

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | agentmemory server URL |
| `AGENTMEMORY_SECRET` | Local server credential | Explicit bearer token for protected instances. For loopback URLs, falls back to `~/.agentmemory/.env`, then `~/.agentmemory/secret`. Set it when connecting to a remote server. |
| `AGENTMEMORY_REQUIRE_HTTPS` | (off) | When set to `1`, refuse to send a bearer token over plaintext HTTP to a non-loopback host. Sends the token only when `AGENTMEMORY_URL` is `https://...` or points at `localhost`/`127.0.0.1`/`::1`. With this off, the plugin warns once but still sends. |

## Smoke test

Run pi and ask it to use the `memory_health` tool, or call the command directly:

```text
/agentmemory-status
```

You should see `agentmemory healthy`.

## Package archive

From an agentmemory checkout, build an archive containing the extension and its local helper:

```bash
npm run plugin:pack:pi
```

The archive is written to `dist/plugins/`. No build or repository dependencies are needed to pack this TypeScript extension; pi provides its runtime dependencies.

## Notes

- This extension uses pi's extension API, not MCP, so it can hook directly into the agent lifecycle.
- One local agentmemory server can be shared across pi, pi2, Hermes, OpenClaw, Claude Code, Codex CLI, and Gemini CLI.

## See also

- [agentmemory main README](https://github.com/rohitg00/agentmemory#readme)
- [Hermes integration](https://github.com/rohitg00/agentmemory/tree/main/integrations/hermes)
- [OpenClaw integration](https://github.com/rohitg00/agentmemory/tree/main/integrations/openclaw)
