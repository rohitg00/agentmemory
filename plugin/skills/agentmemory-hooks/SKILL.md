---
name: agentmemory-hooks
description: The agentmemory plugin hooks that capture observations automatically across the agent session lifecycle. Use when explaining how memory gets captured without manual saves, when debugging missing observations, or when tuning what gets recorded.
user-invocable: false
---

The Claude Code plugin registers lifecycle hooks so memory is captured automatically. You do not have to call `memory_save` for routine work; the hooks observe tool use, prompts, and session boundaries and write observations for you.

## Quick start

Install the plugin and the hooks register themselves:

```bash
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

Watch observations land live at `http://localhost:3113`.

## What the hooks do

- Session start and end frame each unit of work and let `handoff` resume it.
- Tool-use hooks capture what changed and why, the raw material for `recall` and `recap`.
- Prompt-submit captures intent. Pre-compact preserves context before the host trims it.
- A post-commit hook links commits to sessions, which powers `commit-context` and `commit-history`.

## Important

- Capture is on by default and is zero-LLM. Turning observations into LLM summaries (`AGENTMEMORY_AUTO_COMPRESS`) and injecting them back into context (`AGENTMEMORY_INJECT_CONTEXT`) are separate opt-ins because they spend tokens.
- If observations are missing, confirm the plugin is enabled and the server is running. See ../_shared/TROUBLESHOOTING.md.

## See also

- agentmemory-config for the capture and injection flags.
- The handoff, recap, and session-history skills consume what these hooks record.

## Reference

The exact registered hook events live in REFERENCE.md, generated from `plugin/hooks/hooks.json`.
