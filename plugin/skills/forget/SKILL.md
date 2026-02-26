---
name: forget
description: Delete specific observations or sessions from agentmemory. Use when user says "forget this", "delete memory", or wants to remove specific data for privacy.
argument-hint: "[what to forget - session ID, file path, or search term]"
user-invocable: true
---

The user wants to remove data from agentmemory: $ARGUMENTS

**IMPORTANT**: This is a destructive operation. Always confirm with the user before deleting.

Steps:
1. First, search for matching observations:
   ```bash
   curl -s -H "Content-Type: application/json" \
     -H "Authorization: Bearer ${AGENTMEMORY_SECRET:-}" \
     -X POST "http://${AGENTMEMORY_URL:-localhost:3111}/agentmemory/search" \
     -d '{"query": "<SEARCH_TERM>", "limit": 20}'
   ```

2. Show the user what was found and ask for confirmation
3. If confirmed, delete via:
   ```bash
   curl -s -H "Content-Type: application/json" \
     -H "Authorization: Bearer ${AGENTMEMORY_SECRET:-}" \
     -X POST "http://${AGENTMEMORY_URL:-localhost:3111}/agentmemory/forget" \
     -d '{"sessionId": "<ID>"}' # or {"observationIds": ["id1", "id2"]}
   ```

4. Confirm deletion to the user

Never delete without explicit user confirmation.
