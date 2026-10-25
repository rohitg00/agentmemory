---
name: agentmemory-hooks
description: The agentmemory plugin hooks that capture observations automatically across the agent session lifecycle. Use when explaining how memory gets captured without manual saves, when debugging missing observations, or when tuning what gets recorded.
user-invocable: false
---

The agentmemory plugin registers lifecycle hooks so memory is captured automatically. You do not have to call `memory_save` for routine work; the hooks observe tool use, prompts, and session boundaries and write observations for you.

## Quick start

For Claude Code, install its plugin:

```bash
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

For Devin CLI and Devin Desktop, install the plugin and start a new session:

```bash
devin plugins install rohitg00/agentmemory#plugin
```

Run `/hooks` inside Devin to confirm the agentmemory hooks are loaded. Plugin hooks run only in local Devin sessions, not in cloud sessions.

Pi and OMP install native recall and capture with `agentmemory connect pi --with-mcp` or `agentmemory connect omp --with-mcp`. Reload Pi or restart OMP, then inspect `/agentmemory-status`. DSH requires `agentmemory connect dsh --with-hooks` and a restart. Cursor lifecycle hooks come from its enabled plugin, separately from `connect cursor`'s MCP setup.

Hermes and OpenClaw use their native integrations and lifecycle contracts. Follow the matching integration setup instructions and verify a real turn creates an observation. Installing shared skills or connecting MCP alone does not enable automatic capture. Watch recorded observations in the viewer at `http://localhost:3113` when using the default port. A pending capture queue is not proof that the daemon stored the event.

## What the hooks do

- Session start and end frame each unit of work and let `handoff` resume it.
- Tool-use hooks capture what changed and why, the raw material for `recall` and `recap`.
- Prompt-submit captures intent. Pre-compact preserves context before the host trims it.
- A post-commit hook links commits to sessions, which powers `commit-context` and `commit-history`.

## Important

- The plugin hooks capture by default without an LLM. Per-observation LLM compression (`AGENTMEMORY_AUTO_COMPRESS`) and hook context injection (`AGENTMEMORY_INJECT_CONTEXT`) are separate options. Session summaries can use a configured LLM provider independently of automatic observation compression. Native integrations have their own recall/capture settings; inspect the host configuration instead of assuming these flags control every plugin.
- If observations are missing, confirm the plugin is enabled and the server is running. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## See also

- agentmemory-config for the capture and injection flags.
- The handoff, recap, and session-history skills consume what these hooks record.

## Reference

The exact registered hook events live in REFERENCE.md, generated from `plugin/hooks/hooks.json`.
