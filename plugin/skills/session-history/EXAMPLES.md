# session-history worked examples

## 1. Standard timeline

User: "Show me the session history."

Invocation:

```json
memory_sessions { "limit": 20 }
```

Response:

```json
{
  "sessions": [
    { "id": "7f3a9c21", "project": "app", "startedAt": "2026-06-07T09:00:00Z",
      "status": "completed", "observationCount": 14,
      "summary": "Reworked refresh rotation",
      "highlights": [ { "type": "decision", "title": "Rotate refresh tokens on every use" } ] },
    { "id": "b21d004e", "project": "app", "startedAt": "2026-06-05T14:00:00Z",
      "status": "completed", "observationCount": 9,
      "highlights": [ { "type": "code", "title": "limit.ts counts per-IP" } ] }
  ]
}
```

Present:

> - `7f3a9c2` app, 2026-06-07 09:00, completed, 14 obs
>   - decision: Rotate refresh tokens on every use (summary: Reworked refresh rotation)
> - `b21d004` app, 2026-06-05 14:00, completed, 9 obs
>   - code: limit.ts counts per-IP

## 2. Session with no observations

If a returned session has `observationCount: 0`, list it but say so:

> - `c98f110` app, 2026-06-04 11:00, abandoned, 0 obs (no recorded work)

## 3. Empty history

User: "What did we do last time?"

```json
memory_sessions { "limit": 20 }
```

Response:

```json
{ "sessions": [] }
```

Present:

> No recorded sessions yet for this project. Once you work with memory capture
> on, they will show here. Use `remember` to save a note now.
