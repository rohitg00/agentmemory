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

## What the hooks record

The Claude Code plugin registers 12 hooks. They send what they record to the
local agentmemory server, which stores it on this machine.

- SessionStart and SessionEnd frame each unit of work and let `handoff` resume it. SessionEnd also reads the host transcript file to recover user prompts that a hook missed.
- UserPromptSubmit records each prompt you type.
- PostToolUse and PostToolUseFailure record the tool name, its input, and its output or error. This includes results returned by other connectors and MCP servers. Long output is truncated and `<private>` blocks and common secret formats are redacted before storage.
- PreToolUse does nothing by default. With `AGENTMEMORY_INJECT_CONTEXT=true` it sends the file paths and search patterns from a tool's input to look up related memory and prints what it finds.
- Stop and SubagentStop record the final assistant reply (up to 4,000 characters). SubagentStart, Notification and TaskCompleted record those events.
- PreCompact syncs memory before the host trims context.

If the server is unreachable, events wait in a local capture spool (at most 5 MiB, kept up to 7 days) and are sent when it comes back.

The plugin does not register a git post-commit hook, so commits are linked to sessions only when another integration records them.

## Important

- The plugin hooks capture without an LLM. Nothing they record goes to an outside AI provider unless `AGENTMEMORY_LLM_PROVIDER` or a cloud `EMBEDDING_PROVIDER` is set on the server. Per-observation LLM compression also needs `AGENTMEMORY_AUTO_COMPRESS=true`.
- Hook context injection is off by default. SessionStart, PreToolUse and PreCompact print stored memory into the conversation only with `AGENTMEMORY_INJECT_CONTEXT=true`.
- Hooks send the server secret only to a loopback URL or an `https://` URL. Native integrations have their own recall/capture settings; inspect the host configuration instead of assuming these flags control every plugin.
- If observations are missing, confirm the plugin is enabled and the server is running. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## See also

- agentmemory-config for the capture and injection flags.
- The handoff, recap, and session-history skills consume what these hooks record.

## Reference

The exact registered hook events live in REFERENCE.md, generated from `plugin/hooks/hooks.json`.
