# recap worked examples

## 1. This week

User: "Recap this week."

Window: last 7 days. Invocation:

```json
memory_sessions { "limit": 30 }
```

Response (after filtering to cwd and the 7-day window):

```json
{
  "sessions": [
    { "id": "7f3a9c21", "cwd": "/Users/dev/app", "title": "Auth refresh rework",
      "startedAt": "2026-06-07T09:00:00Z", "observationCount": 14, "status": "completed",
      "concepts": ["jwt-refresh-rotation", "auth-flow"] },
    { "id": "b21d004e", "cwd": "/Users/dev/app", "title": "Rate limiter audit",
      "startedAt": "2026-06-05T14:00:00Z", "observationCount": 9, "status": "completed",
      "concepts": ["rate-limiter", "per-ip-bug"] }
  ]
}
```

Per session, pull highlights:

```json
memory_recall { "query": "jwt-refresh-rotation auth-flow", "limit": 3 }
```

Present:

> **2026-06-07**
> - `7f3a9c2` Auth refresh rework, 14 obs, completed
>   - [8] Rotate refresh tokens on every use
>
> **2026-06-05**
> - `b21d004e` Rate limiter audit, 9 obs, completed
>   - [7] limit.ts counts per-IP, not per-user
>
> 2 sessions across 2 days, 23 observations.

## 2. Bare number

User: "recap 3"

Treat as `last 3`. Call `memory_sessions { "limit": 3 }`, group by date, same format.

## 3. Empty window

User: "Recap today."

If `memory_sessions` returns no session whose `startedAt` is today and whose
`cwd` matches:

> No sessions today for this project. The most recent was yesterday, `7f3a9c2`
> Auth refresh rework. Want a recap of that instead?
