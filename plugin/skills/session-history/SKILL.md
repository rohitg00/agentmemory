---
name: session-history
description: Show what happened in recent past sessions on this project. Use when user asks "what did we do last time", "session history", "past sessions", or wants an overview of previous work.
user-invocable: true
---

Fetch recent session history from agentmemory:

!`curl -s -H "Authorization: Bearer ${AGENTMEMORY_SECRET:-}" "http://${AGENTMEMORY_URL:-localhost:3111}/agentmemory/sessions" 2>/dev/null || echo '{"sessions":[]}'`

Present the sessions in reverse chronological order:
- Show session ID (first 8 chars), project, start time, status
- For each session with observations, show the key highlights
- Note total observation count per session
- If summaries exist, show the session title and key decisions

Format as a clean timeline. Do NOT make up sessions -- only show what was returned.
