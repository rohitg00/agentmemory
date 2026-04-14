---
name: session-history
description: Show what happened in recent past sessions on this project. Use when user asks "what did we do last time", "session history", "past sessions", or wants an overview of previous work.
user-invocable: true
---

Fetch recent session history using the `memory_sessions` MCP tool (provided by the agentmemory server that this plugin wires up automatically via `.mcp.json`). Pass `limit: 20` to get a meaningful window.

Present the returned sessions in reverse chronological order:
- Show the session ID (first 8 chars), project, start time, and status
- For each session with observations, show the key highlights (type + title)
- Note the total observation count per session
- If a session summary exists, surface the title and the key decisions

Format as a clean timeline. **Do NOT make up sessions** — only show what the MCP tool actually returned. If the tool isn't available, tell the user to verify the agentmemory engine is running on `localhost:3111` and that this plugin was enabled after install.
