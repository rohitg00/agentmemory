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
3. Once confirmed, call `memory_governance_delete` with either:
   - `memoryIds: [<observationId>, ...]` to delete specific observations, or
   - the session ID(s) in the same argument if the user wants to drop whole sessions
4. Confirm the deletion count back to the user.

**Never delete without explicit user confirmation.** If the MCP tools aren't available, tell the user to verify the agentmemory engine is running on `localhost:3111` and that this plugin was enabled after install.
