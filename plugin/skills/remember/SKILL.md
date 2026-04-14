---
name: remember
description: Explicitly save an insight, decision, or learning to agentmemory's long-term storage. Use when the user says "remember this", "save this", or wants to preserve knowledge for future sessions.
argument-hint: "[what to remember]"
user-invocable: true
---

The user wants to save this to long-term memory: $ARGUMENTS

Use the `memory_save` MCP tool (provided by the agentmemory server that this plugin wires up automatically via `.mcp.json`) to persist it.

Steps:
1. Analyze what the user wants to remember — pull out the core insight, decision, or fact.
2. Extract 2-5 searchable `concepts` (lowercased keyword phrases) that capture what the memory is about. Prefer specific terms over generic ones (`"jwt-refresh-rotation"` beats `"auth"`).
3. Extract any relevant `files` — absolute or repo-relative paths the memory references.
4. Call `memory_save` with the fields:
   - `content` — the full text to remember (preserve the user's phrasing as much as possible)
   - `concepts` — the extracted concept list
   - `files` — the extracted file list (empty array if none apply)
5. Confirm to the user that the memory was saved and show the concepts you tagged so they know what terms will retrieve it later.

If `memory_save` isn't available, the stdio MCP shim didn't start — tell the user to:
1. Run `/plugin list` in Claude Code and confirm `agentmemory` shows as enabled.
2. Restart Claude Code (the plugin's `.mcp.json` is only read on startup).
3. Check `/mcp` to see whether the `agentmemory` MCP server is connected.
