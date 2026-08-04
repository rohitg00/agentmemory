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

Install the extension into omp (links this folder into omp's plugin directory):

```bash
omp plugin install ./integrations/omp
```

Then restart omp for the extension to load. Verify it was picked up:

```bash
omp plugin doctor
# ✔ plugins_directory: Found at ...
# ✔ plugin:agentmemory-omp-extension: v0.9.28
```

Alternatively, `omp install ./integrations/omp` is an alias for the same command.

> **Note:** omp's plugin system loads extensions from `~/.omp/plugins/` (via
> `node_modules` + the `omp` manifest in `package.json`). The old
> `~/.omp/agent/extensions/agentmemory/` copy approach is **not** supported by
> omp — it is not auto-discovered. The link created by `omp plugin install`
> points at this folder, so edits to `integrations/omp/` take effect on the
> next omp restart.

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
| `AGENTMEMORY_PROJECT_NAME` | (unset) | Overrides the project name used in session/observation payloads. Defaults to the git repo basename (or cwd basename if not a git repo). |
| `AGENTMEMORY_REQUIRE_HTTPS` | (off) | When set to `1`, refuse to send a bearer token over plaintext HTTP to a non-loopback host. Sends the token only when `AGENTMEMORY_URL` is `https://...` or points at `localhost`/`127.0.0.1`/`::1`. With this off, the plugin warns once but still sends. |
| `AGENTMEMORY_INJECT_CONTEXT` | (off) | When set to `1`, injects file enrichment context (via `/enrich`) into the conversation for files touched by tools. |
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
