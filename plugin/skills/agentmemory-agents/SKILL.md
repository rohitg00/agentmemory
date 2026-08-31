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

After wiring, restart the host or run its MCP reload (for example `/mcp` in Claude Code) so it picks up the server. Then confirm the agent lists agentmemory's tools.

## Workflow

1. Detect the calling agent. If unknown, default to `claude-code`.
2. Run `agentmemory connect <name>` using a name from the table in REFERENCE.md.
3. Verify: the host should show the full tool set with a server running. Only 7 tools means the MCP shim could not reach a server (see ../_shared/TROUBLESHOOTING.md).

## Notes

- The action skills (remember, recall, and the rest) are installed separately with `npx skills add rohitg00/agentmemory`. `connect` makes tools available; skills teach the agent when to use them.
- Windows: use WSL2. Native Windows runs the server but `connect` is not supported there.

## See also

- agentmemory-mcp-tools, agentmemory-rest-api, agentmemory-hooks.

## Reference

The full adapter list with display names and protocol notes lives in REFERENCE.md, generated from `src/cli/connect/`.
