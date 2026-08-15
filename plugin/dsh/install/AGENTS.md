## Agent memory (agentmemory)

You have persistent long-term memory via the agentmemory MCP server. Tools: `mcp__agentmemory__memory_recall`, `memory_smart_search`, `memory_save`, `memory_sessions`.

- At the START of a task, call `memory_recall` (or `memory_smart_search`) to load relevant past decisions, fixes, and user preferences; do not re-ask.
- When you learn something durable (a decision, a fix, a gotcha, a preference, a project convention), call `memory_save` to persist it.
- Prefer recall over re-deriving; save concise reusable facts, not transcripts.
