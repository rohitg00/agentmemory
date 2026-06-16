---
name: forget
description: Delete specific observations from agentmemory after showing them and getting explicit confirmation. Use when the user says "forget this", "delete memory", "remove that note", or wants to scrub specific data for privacy.
argument-hint: "[what to forget - session ID, file path, or search term]"
user-invocable: true
---

The user wants to remove data from agentmemory: $ARGUMENTS

## Quick start

```json
memory_smart_search { "query": "old api key in config", "limit": 20 }
```

Show the matches, get a yes, then delete with the tool that matches the ID type:

```json
memory_forget { "sessionId": "ses_123", "observationIds": "obs_1,obs_2" }
```

or:

```json
memory_governance_delete { "memoryIds": ["mem_123"], "reason": "user privacy request" }
```

Expected output:

```text
Found 2 matching observations. Confirmed. Deleted 2 observations.
```

## Why

This is destructive and irreversible. Show exactly what will be deleted and get
an explicit yes before calling delete. Use `memory_forget` for observations and
sessions, and `memory_governance_delete` only for saved memories.

## Workflow

1. Search with `memory_smart_search`, the user's text as `query`, `limit: 20`.
2. Show what matched: session ids, observation ids, memory ids, titles. Ask for explicit
   confirmation. Do not proceed on silence or a vague "sure, whatever".
3. On confirmation, choose the deletion tool:
   - Observations: call `memory_forget` with `sessionId` and comma-separated
     `observationIds`.
   - Whole session: call `memory_forget` with only `sessionId`; this deletes the
     session's observations, session record, and summary.
   - Saved memories: call `memory_governance_delete` with `memoryIds` and optional
     `reason` (default `plugin skill request`).
4. Do not pass observation IDs to `memory_governance_delete`; it only targets saved memories.
5. Report the actual deletion count and any failed or missing IDs back.

## Anti-patterns

WRONG: search returns matches, you immediately call a delete tool
without showing them or waiting for a yes.

RIGHT: list the matches, ask "Delete these 2? (yes/no)", and only delete after
an explicit yes.

## Checklist

- Matches were shown to the user before any delete.
- An explicit yes was received, not assumed.
- The selected delete tool matches the ID type being deleted.
- `memory_forget` includes the correct `sessionId` for observation deletes.
- Final message states the actual count deleted.

## See also

- `remember`: the write side; forget is its undo.
- `recall`: find the exact memory id before deleting.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if `memory_smart_search`, `memory_forget`, or `memory_governance_delete` is not available.
