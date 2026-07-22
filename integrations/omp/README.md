<p align="center">
  <img src="../../assets/banner.png" alt="agentmemory" width="640" />
</p>

<h1 align="center">
  &nbsp;agentmemory for Oh My Pi (omp)
</h1>

<p align="center">
  <strong>Your omp sessions remember everything. No more re-explaining.</strong><br/>
  <sub>Persistent cross-session memory via <a href="https://github.com/rohitg00/agentmemory">agentmemory</a> — shared with Claude Code, Codex CLI, Gemini CLI, Hermes, OpenClaw, pi, and more.</sub>
</p>

---

## Quick setup

Start the agentmemory server in a separate terminal:

```bash
npx @agentmemory/agentmemory
```

Copy this folder into omp's global extensions directory:

```bash
mkdir -p ~/.omp/agent/extensions/agentmemory
cp integrations/omp/index.ts ~/.omp/agent/extensions/agentmemory/index.ts
cp integrations/omp/security.ts ~/.omp/agent/extensions/agentmemory/security.ts
```

Then enable it in `~/.omp/agent/settings.json` if you prefer explicit loading:

```json
{
  "extensions": ["~/.omp/agent/extensions/agentmemory"]
}
```

If you place it under `~/.omp/agent/extensions/agentmemory/`, omp will also auto-discover it and `/reload` can hot-reload it.

## What it adds

- `memory_health` — confirm the shared memory server is reachable
- `memory_search` — search prior decisions, bugs, workflows, and preferences
- `memory_save` — write durable facts back to long-term memory
- `/agentmemory-status` — check health from inside omp
- 15 lifecycle hooks — injects relevant memories at every stage of the agent loop (before/after tool calls, session start/end, context updates, and consolidation events)

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | agentmemory server URL |
| `AGENTMEMORY_SECRET` | (none) | Bearer token for protected instances |
| `AGENTMEMORY_REQUIRE_HTTPS` | (off) | When set to `1`, refuse to send a bearer token over plaintext HTTP to a non-loopback host. Sends the token only when `AGENTMEMORY_URL` is `https://...` or points at `localhost`/`127.0.0.1`/`::1`. With this off, the plugin warns once but still sends. |
| `AGENTMEMORY_INJECT_CONTEXT` | (off) | When set to `1`, injects memory search results into the system prompt context on every turn. |
| `AGENTMEMORY_CONSOLIDATION_ENABLED` | (on) | When set to `0`, disables background memory consolidation jobs. |

## Smoke test

Run omp and ask it to use the `memory_health` tool, or call the command directly:

```text
/agentmemory-status
```

You should see `agentmemory healthy` and a footer status like `🧠 agentmemory`.

## Notes

- This extension uses omp's extension API, not MCP, so it can hook directly into the agent lifecycle with 15 granular hooks covering the full conversation loop.
- One local agentmemory server can be shared across omp, pi, pi2, Hermes, OpenClaw, Claude Code, Codex CLI, and Gemini CLI.

## See also

- [agentmemory main README](../../README.md)
- [pi integration](../pi/README.md)
- [Hermes integration](../hermes/README.md)
- [OpenClaw integration](../openclaw/README.md)
