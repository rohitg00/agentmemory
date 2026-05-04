<p align="center">
  <img src="../../assets/banner.png" alt="agentmemory" width="640" />
</p>

<h1 align="center">
  &nbsp;agentmemory for pi
</h1>

<p align="center">
  <strong>Your pi sessions remember everything. No more re-explaining.</strong><br/>
  <sub>Persistent cross-session memory via <a href="https://github.com/rohitg00/agentmemory">agentmemory</a> — shared with Claude Code, Codex CLI, Gemini CLI, Hermes, OpenClaw, and more.</sub>
</p>

---

## Quick setup

Start the agentmemory server in a separate terminal:

```bash
npx @agentmemory/agentmemory
```

Copy this folder into pi's global extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions/agentmemory
cp integrations/pi/index.ts ~/.pi/agent/extensions/agentmemory/index.ts
```

Then enable it in `~/.pi/agent/settings.json` if you prefer explicit loading:

```json
{
  "extensions": ["~/.pi/agent/extensions/agentmemory"]
}
```

If you place it under `~/.pi/agent/extensions/agentmemory/`, pi will also auto-discover it and `/reload` can hot-reload it.

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
| `AGENTMEMORY_SECRET` | (none) | Bearer token for protected instances |

## Smoke test

Run pi and ask it to use the `memory_health` tool, or call the command directly:

```text
/agentmemory-status
```

You should see `agentmemory healthy` and a footer status like `🧠 agentmemory`.

## Notes

- This extension uses pi's extension API, not MCP, so it can hook directly into the agent lifecycle.
- One local agentmemory server can be shared across pi, pi2, Hermes, OpenClaw, Claude Code, Codex CLI, and Gemini CLI.

## See also

- [agentmemory main README](../../README.md)
- [Hermes integration](../hermes/README.md)
- [OpenClaw integration](../openclaw/README.md)
