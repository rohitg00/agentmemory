---
name: forget
description: Delete specific observations or sessions from agentmemory. Use when user says "forget this", "delete memory", or wants to remove specific data for privacy.
argument-hint: "[what to forget - session ID, file path, or search term]"
user-invocable: true
---

The user wants to remove data from agentmemory: $ARGUMENTS

**IMPORTANT**: This is a destructive operation. Always confirm with the user before deleting.

Steps:

1. First search for matching observations with the `memory_smart_search` MCP tool (provided by the agentmemory server this plugin wires up via `.mcp.json`). Use the user's input as the `query` with `limit: 20`.
2. Show the user what was found — session IDs, observation IDs, titles — and ask for explicit confirmation before deleting.
3. Once confirmed, call `memory_governance_delete` with:
   - `memoryIds: [<id>, ...]` — an array (or comma-separated string) of the memory IDs returned by the search in step 1
   - `reason: "<short reason>"` — optional, defaults to `"plugin skill request"`

   If the user wants to drop an entire session's observations, collect every memory ID in that session from the search results and pass them all via `memoryIds`. The standalone MCP doesn't accept a bare `sessionId` argument — it deletes by memory ID only.
4. Confirm the deletion count back to the user.

**Never delete without explicit user confirmation.** If the MCP tools aren't available, the stdio MCP shim didn't start — tell the user to:
1. Run `/plugin list` in Claude Code and confirm `agentmemory` shows as enabled.
2. Restart Claude Code (the plugin's `.mcp.json` is only read on startup).
3. Check `/mcp` to see whether the `agentmemory` MCP server is connected.
