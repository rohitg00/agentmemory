---
name: forget
description: Delete specific observations or sessions from agentmemory. Use when user says "forget this", "delete memory", or wants to remove specific data for privacy.
argument-hint: "[what to forget - session ID, file path, or search term]"
user-invocable: true
---

The user wants to remove data from agentmemory: $ARGUMENTS

**IMPORTANT**: This is a destructive operation. Always confirm with the user before deleting.

Steps:

1. First search for matching data with the `memory_smart_search` MCP tool (provided by the agentmemory server this plugin wires up via `.mcp.json`). Use the user's input as the `query` with `limit: 20`.
2. Show the user what was found — session IDs, observation IDs, titles — and ask for explicit confirmation before deleting.
3. Once confirmed, pick the tool that matches what is being deleted:
   - **Observations or sessions** (`obs_*` IDs, `ses_*` IDs) → call `memory_forget` with:
     - `sessionId: "<ses_*>"` — the session the observations belong to
     - `observationIds: "<obs_1>,<obs_2>"` — optional; omit it to delete ALL of the session's observations plus the session record and its summary
   - **Saved memories** (`mem_*` IDs) → call `memory_governance_delete` with:
     - `memoryIds: [<id>, ...]` — an array (or comma-separated string) of memory IDs
     - `reason: "<short reason>"` — optional, defaults to `"plugin skill request"`

   Do NOT pass observation IDs to `memory_governance_delete` — it only targets the saved-memories store and will report them back in `notFound` without deleting anything.
4. Confirm the deletion count back to the user from the tool result (`deleted`, `observationsDeleted`, `sessionDeleted`, or `notFound`). If `notFound` is non-empty or `success` is `false`, tell the user which IDs were not deleted instead of reporting success.

**Never delete without explicit user confirmation.** If the MCP tools aren't available, the stdio MCP shim didn't start — tell the user to:
1. Run `/plugin list` in Claude Code and confirm `agentmemory` shows as enabled.
2. Restart Claude Code (the plugin's `.mcp.json` is only read on startup).
3. Check `/mcp` to see whether the `agentmemory` MCP server is connected.
