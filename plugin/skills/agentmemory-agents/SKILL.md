---
name: agentmemory-agents
description: How agentmemory wires into host coding agents via the connect command. Use when installing agentmemory into a specific agent, when asked which agents are supported, or when a connect adapter writes the wrong config path.
user-invocable: false
---

`agentmemory connect <agent>` merges the memory server into a host agent's config and preserves any existing servers. REST is the underlying protocol; for MCP-only hosts the adapter wires the stdio MCP bridge.

## Quick start

```bash
agentmemory connect claude-code   # or cursor, codex, gemini-cli, ...
```

After wiring, restart the host or run its MCP reload (for example `/mcp` in Claude Code, or a new session after `devin mcp list` in Devin CLI) so it picks up the server. Then confirm the agent lists agentmemory's tools.

Devin CLI and Devin Desktop can also install the whole plugin with `devin plugins install rohitg00/agentmemory#plugin`, which adds the skills, the MCP server, and the capture hooks in one step. Cloud Devin sessions cannot reach a local agentmemory server, so the plugin is for local sessions only.

## Workflow

1. Detect the calling agent. If unknown, ask which host to configure before changing files.
2. Run `agentmemory connect <name>` using a name from the table in REFERENCE.md.
3. Read the command result: an adapter that prints manual setup instructions has not completed installation. Restart the configured host, inspect its actual tool inventory, and perform an authorized save/recall check. A native memory provider and an MCP connection are separate surfaces (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)).

## Notes

- Skills install separately: `npx skills@1.7.1 add rohitg00/agentmemory --agent hermes-agent --skill '*'` or use `--agent openclaw`. Choose the intended host; add `--global` only for a user-wide installation. Verify skill discovery and read a skill's local support file in that host.
- Windows: use WSL2. Native Windows runs the server but `connect` is not supported there.

## See also

- agentmemory-mcp-tools, agentmemory-rest-api, agentmemory-hooks.

## Reference

The full adapter list with display names and protocol notes lives in REFERENCE.md, generated from `src/cli/connect/`.
