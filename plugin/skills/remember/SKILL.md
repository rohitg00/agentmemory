---
name: remember
description: Explicitly save an insight, decision, or learning to agentmemory's long-term storage. Use when the user says "remember this", "save this", or wants to preserve knowledge for future sessions.
argument-hint: "[what to remember]"
user-invocable: true
---

The user wants to save this to long-term memory: $ARGUMENTS

To save this, make a POST request using the Bash tool:

```bash
curl -s -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AGENTMEMORY_SECRET:-}" \
  -X POST "http://${AGENTMEMORY_URL:-localhost:3111}/agentmemory/remember" \
  -d '{"content": "<ESCAPED_CONTENT>", "concepts": [<CONCEPTS>], "files": [<FILES>]}'
```

Steps:
1. Analyze what the user wants to remember
2. Extract key concepts (2-5 searchable terms)
3. Extract relevant file paths if any
4. Make the API call with the properly escaped content
5. Confirm to the user that the memory was saved
6. Show what concepts were tagged for future recall
