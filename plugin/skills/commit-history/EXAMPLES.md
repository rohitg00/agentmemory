# commit-history worked examples

## 1. Branch filter

User: "Show agent commits on main."

Invocation:

```json
memory_commits { "branch": "main", "limit": 100 }
```

Response:

```json
{
  "commits": [
    { "short": "9a1b2c3", "branch": "main", "authoredAt": "2026-06-07T09:12:00Z",
      "message": "rotate refresh tokens", "sessionIds": ["7f3a9c21"],
      "observationCount": 14, "files": 3 },
    { "short": "b21d004", "branch": "main", "authoredAt": "2026-06-05T14:40:00Z",
      "message": "rate limiter audit", "sessionIds": ["b21d004e"],
      "observationCount": 9, "files": 1 }
  ]
}
```

Present:

> - `9a1b2c3` main 2026-06-07 "rotate refresh tokens", session `7f3a9c2` (14 obs, 3 files)
> - `b21d004` main 2026-06-05 "rate limiter audit", session `b21d004` (9 obs, 1 file)

## 2. Bare number as limit

User: "commit-history 5"

Treat `5` as the limit:

```json
memory_commits { "limit": 5 }
```

Render the five newest linked commits in the same format.

## 3. Empty result

User: "Show agent commits on release-2.0."

```json
memory_commits { "branch": "release-2.0", "limit": 100 }
```

Response:

```json
{ "commits": [] }
```

Present:

> No agent-linked commits on `release-2.0`. Drop the branch filter to see all
> linked commits, or try a different branch.

REST fallback for this same call, with encoding:

```http
GET /agentmemory/commits?branch=release-2.0&limit=100
```

Build it with `URLSearchParams` so a branch like `feat/a&b` becomes
`feat%2Fa%26b` rather than breaking the query.
