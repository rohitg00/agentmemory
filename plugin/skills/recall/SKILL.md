---
name: recall
description: Search agentmemory for past observations, sessions, and learnings about a topic. Use when the user says "recall", "remember", "what did we do", or needs context from past sessions.
argument-hint: "[search query]"
user-invocable: true
---

Search agentmemory for observations matching: $ARGUMENTS

!`QUERY=$(echo "$ARGUMENTS" | sed 's/\\/\\\\/g; s/"/\\"/g') && curl -s -H "Content-Type: application/json" -H "Authorization: Bearer ${AGENTMEMORY_SECRET:-}" -X POST http://${AGENTMEMORY_URL:-localhost:3111}/agentmemory/search -d "{\"query\": \"${QUERY}\", \"limit\": 10}" 2>/dev/null || echo '{"results":[]}'`

Present the search results to the user in a readable format:
- Group by session
- Show observation type, title, and narrative
- Highlight the most important observations (importance >= 7)
- If no results found, suggest alternative search terms

Do NOT make up or hallucinate results. Only present what was returned from the search.
