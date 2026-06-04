---
name: agentmemory-kimi
description: Persistent memory integration for Kimi Code CLI via agentmemory MCP. Auto-save key decisions and recall context across sessions.
---

# agentmemory for Kimi Code CLI

## Purpose

This skill instructs Kimi to use agentmemory's MCP tools for persistent cross-session memory. Since Kimi Code CLI does not support native hooks, memory must be saved manually or via automatic calls triggered by this skill.

## When to save memory automatically

Call `memory_save` (via MCP tool `mcp__agentmemory__memory_save`) after any of the following:

### 1. Architecture & tech decisions
- Framework/library choices (e.g., "use Prisma instead of Drizzle")
- Pattern adoption (e.g., "repository pattern for data access")
- Convention establishment (e.g., "strict TypeScript, no any")

### 2. Setup & configuration
- Environment variables and secrets setup
- Docker/CI/CD configuration
- Dependency installation decisions
- Tooling setup (linting, formatting, testing)

### 3. Bug fixes with context
- Root cause analysis
- Workarounds and their rationale
- Error patterns and solutions

### 4. User preferences
- Language preference (e.g., "Russian for all communication")
- Code style preferences
- Workflow preferences (e.g., "test-first development")
- Tools the user likes/dislikes

### 5. Project discoveries
- Gotchas and caveats
- Performance bottlenecks found
- Security considerations
- API limitations

## Memory format

Use `type: "fact"` for single truths, `type: "workflow"` for processes, `type: "pattern"` for reusable patterns:

```json
{
  "content": "User prefers Russian language. Stack: Node.js, Bun, Python, Rust.",
  "type": "fact",
  "title": "User preferences and stack"
}
```

## Auto-recall on session start

At the beginning of a new session with a known project, call `memory_smart_search` with the project path to retrieve relevant memories:

```json
{
  "query": "project setup conventions preferences",
  "limit": 5
}
```

Inject the returned memories into the conversation context before starting work.

## Tool reference

### memory_save
Store an insight. Call after important decisions.

### memory_smart_search
Hybrid semantic + keyword search. Best for finding relevant context.

### memory_recall
Simple keyword search. Faster but less accurate.

### memory_profile
Get project overview: top concepts, recent activity, conventions.

### memory_sessions
List recent sessions with observation counts.

### memory_timeline
Chronological view of observations around a date.

## Cost awareness

- LLM compression: ~$0.46 per 35h of active use (DeepSeek V4 Pro via OpenRouter)
- Embeddings: $0 (local BGE-small)
- Each `memory_save` triggers background compression — keep saves concise

## Limitations

- **No auto-capture**: Kimi Code CLI does not send session lifecycle events. Manual `memory_save` only.
- **No live session in viewer**: Active sessions appear only with native hook support.
- **Context injection**: Manual via `memory_smart_search` at session start.

## Example flow

```
User: "Set up JWT auth with jose library"
  → Kimi implements auth
  → [AUTO] memory_save: {
      content: "JWT auth uses jose (not jsonwebtoken) for Edge compatibility. Middleware at src/middleware/auth.ts. 30-day expiry.",
      type: "fact",
      title: "JWT auth implementation"
    }

Next session:
  → [AUTO] memory_smart_search: { query: "auth middleware jose" }
  → Kimi knows: auth uses jose, middleware location, expiry — no re-explaining
```
