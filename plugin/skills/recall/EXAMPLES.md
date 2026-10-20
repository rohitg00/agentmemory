# recall worked examples

## 1. Hit on a past decision

User: "Did we ever decide how to cache sessions?"

Invocation:

```json
memory_smart_search { "query": "session caching decision", "limit": 10 }
```

Response:

```json
{
  "results": [
    { "sessionId": "7f3a9c21", "type": "decision", "title": "Drop Redis for iii state store",
      "narrative": "We decided to drop Redis and use the iii-engine state store for session caching.",
      "importance": 8 }
  ]
}
```

Present:

> Yes. In session `7f3a9c21` you decided to drop Redis and use the iii-engine
> state store for session caching (importance 8).

## 2. Multiple results across sessions

User: "Recall anything about the rate limiter."

Invocation:

```json
memory_smart_search { "query": "rate limiter", "limit": 10 }
```

Response:

```json
{
  "results": [
    { "sessionId": "b21d004e", "type": "code", "title": "limit.ts counts per-IP",
      "narrative": "Rate limiter counts per-IP, not per-user.", "importance": 6 },
    { "sessionId": "c98f1100", "type": "conversation", "title": "Discussed sliding window",
      "narrative": "Considered a sliding-window limiter, deferred.", "importance": 4 }
  ]
}
```

Present them grouped by session, leading with the per-IP code note.

## 3. No results

User: "Recall the GraphQL schema migration."

Invocation:

```json
memory_smart_search { "query": "graphql schema migration", "limit": 10 }
```

Response:

```json
{ "results": [] }
```

Present:

> No memories matched that. Try `schema change`, `graphql`, or `migration` as
> narrower terms, or `recap this week` to scan recent sessions.
