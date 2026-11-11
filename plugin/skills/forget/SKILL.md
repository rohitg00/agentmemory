---
name: forget
description: Delete selected durable memories from agentmemory after showing them and getting explicit confirmation. Use when the user says "forget this", "delete memory", "remove that note", or wants to scrub specific data for privacy.
argument-hint: "[what to forget - session ID, file path, or search term]"
user-invocable: true
---

The user wants to remove data from agentmemory: $ARGUMENTS

## Quick start

```json
memory_smart_search { "query": "old api key in config", "targetLayer": "memory", "limit": 20 }
```

Show the matches, get a yes, then:

```json
memory_governance_delete { "memoryIds": "abc12345,def67890", "reason": "user privacy request" }
```

Expected output:

```text
Found 2 matching memories. Confirmed. Deleted 2 memories.
```

## Why

This is destructive and irreversible. Show exactly what will be deleted and get
an explicit yes before calling delete. Delete by memory ID, never a bare session.

## Workflow

1. Search with `memory_smart_search`, the user's text as `query`,
   `targetLayer: "memory"`, `limit: 20`, and the requested project/agent scope.
   These are selected relevance matches, not an exhaustive inventory.
2. Show what matched: memory ids, titles, and scope. Redact secret values. Ask for explicit
   confirmation. Do not proceed on silence or a vague "sure, whatever".
3. On confirmation, call `memory_governance_delete` with `memoryIds` as a
   comma-separated string and optional `reason` (default `plugin skill request`).
4. Observation or whole-session erasure is not supported by this operation.
   Explain that limit before proceeding; never label selected memory deletion
   as a complete session wipe. Do not pass observation IDs or a `sessionId`.
5. Lessons are separate: delete one with `memory_lesson_delete` and its
   `lessonId`; `memory_governance_delete` does not touch lessons.
6. Check `deleted`, `notFound`, and `failed` in the response. Report actual
   deletions and unresolved IDs separately. Recheck the selected IDs before
   retrying a failed request; an interrupted response may hide a completed write.

## Anti-patterns

WRONG: search returns matches, you immediately call `memory_governance_delete`
without showing them or waiting for a yes.

RIGHT: list the matches, ask "Delete these 2? (yes/no)", and only delete after
an explicit yes.

## Checklist

- Matches were shown to the user before any delete.
- An explicit yes was received, not assumed.
- `memoryIds` holds real ids from the search, never a bare `sessionId`.
- Final message states the actual count deleted.

## See also

- `remember`: the write side; forget is its undo.
- `recall`: find the exact memory id before deleting.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if `memory_smart_search` or `memory_governance_delete` is not available.
