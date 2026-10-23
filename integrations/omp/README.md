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

Install the extension into omp from the repo root:

```bash
omp plugin install ./integrations/omp
```

`omp plugin install` **links, not copies**: it creates a junction (Windows) /
symlink (Unix) at `~/.omp/plugins/node_modules/agentmemory-omp-extension`
pointing at this folder, so the linked folder stays the live source — editing
`index.ts` here takes effect on the next omp restart without reinstalling.
Use `--scope=project` to register it per-project instead of for the user, or
`--dry-run` to preview. Removal is symmetric:

```bash
omp plugin uninstall agentmemory-omp-extension
```

Then restart omp for the extension to load. Verify it was picked up:

```bash
omp plugin doctor
# ✔ plugins_directory: Found at ...
# ✔ plugin:agentmemory-omp-extension: v0.9.30
```

Alternatively, `omp install ./integrations/omp` is an alias for the same command.

> **Note:** Use `omp plugin install` only. Do **not** copy this folder to
> `~/.omp/agent/extensions/agentmemory/` — omp scans that directory too, so
> the extension would load twice and every tool call would be observed twice.

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
| `AGENTMEMORY_SECRET` | (none) | Bearer token for protected instances. When unset, the plugin falls back to `~/.agentmemory/secret` or `AGENTMEMORY_SECRET` in `~/.agentmemory/.env`, but only for loopback URLs (`localhost`/`127.0.0.1`/`::1`). |
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

- Requires omp 18.12 or newer (extension API where `before_agent_start` system prompts are string arrays). Recalled memories are appended as an extra system-prompt line; when there is nothing to recall the host prompt is left untouched.
- This extension uses omp's extension API, not MCP, so it can hook directly into the agent lifecycle with 15 granular hooks covering the full conversation loop.
- One local agentmemory server can be shared across omp, pi, pi2, Hermes, OpenClaw, Claude Code, Codex CLI, and Gemini CLI.

## See also

- [agentmemory main README](../../README.md)
- [pi integration](../pi/README.md)
- [Hermes integration](../hermes/README.md)
- [OpenClaw integration](../openclaw/README.md)
