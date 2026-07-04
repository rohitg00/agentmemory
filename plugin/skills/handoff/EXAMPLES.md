# handoff worked examples

## 1. Resume with an open question

User: "Where were we?"

Project cwd: `/Users/dev/app`. Invocation:

```json
memory_sessions { "limit": 20 }
```

Response:

```json
{
  "sessions": [
    { "id": "7f3a9c21", "cwd": "/Users/dev/app", "title": "Auth refresh rework",
      "status": "completed", "startedAt": "2026-06-07T09:00:00Z",
      "summary": "Reworked refresh rotation. Open: should logout revoke all device tokens?",
      "concepts": ["jwt-refresh-rotation", "logout"] }
  ]
}
```

Pull supporting context:

```json
memory_recall { "query": "jwt-refresh-rotation logout", "limit": 10 }
```

Present:

> Resuming `7f3a9c2` "Auth refresh rework".
> **Open question:** should logout revoke all device tokens or just the current one?
> Touched `auth/refresh.ts`, `auth/logout.ts`. Refresh rotation is done.
> **Next step:** decide the revoke scope, then finish `auth/logout.ts`.

## 2. Sibling-repo guard

Project cwd: `/Users/dev/repo-a`. Sessions include one with `cwd:
/Users/dev/repo-a-staging`.

A raw prefix would match `repo-a-staging`. The boundary check rejects it because
`/Users/dev/repo-a-staging` does not equal `/Users/dev/repo-a` and does not start
with `/Users/dev/repo-a/`. Pick the real `repo-a` session instead, or fall back
to the most recent session overall if none matches.

## 3. Empty session

User: "Resume."

If the matched session has zero observations:

> The most recent session `c98f110` for this project has no recorded
> observations. Nothing to hand off. Want to start fresh from the current state?
