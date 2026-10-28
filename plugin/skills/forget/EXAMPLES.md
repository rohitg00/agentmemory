# forget worked examples

## Delete a selected durable memory

User: "Forget that note where I pasted the API key."

```json
memory_smart_search { "query": "api key", "targetLayer": "memory", "project": "app", "limit": 20 }
```

Show the returned memory ID and title without displaying the secret value:

> Found memory `abc12345` in project `app`: "Staging API configuration".
> Delete this memory?

After explicit confirmation:

```json
memory_governance_delete { "memoryIds": "abc12345", "reason": "user privacy request" }
```

If the response reports `deleted: 1`, report one deletion. If it reports
`deleted: 0` and `notFound: ["abc12345"]`, report that the memory was not found.
For mixed results, state the actual count and any failed or missing IDs.

## A request to erase a whole session

User: "Delete everything from the throwaway spike session."

Explain that this tool deletes selected durable memories only. A relevance
search limited to 20 results cannot enumerate all session data, and observation
IDs are not accepted as durable-memory IDs. Do not claim complete erasure.
Offer a review of matching durable memories with the scope clearly stated.
Lessons have a separate `memory_lesson_delete` operation.

## User declines

User: "Actually, keep them."

Do not call delete. Report that nothing was deleted.
