---
name: handoff
description: Resume the most recent agent session for the current working directory, leading with any unanswered question. Use when the user says "where were we", "resume", "handoff", "pick up where I left off", or starts a session with no fresh context.
argument-hint: "[optional cwd override]"
user-invocable: true
---

The user wants to resume work. Optional cwd override: $ARGUMENTS

## Quick start

```json
memory_sessions { "limit": 20 }
```

Pick the most recent session whose `cwd` matches this project, then:
`memory_recall { "query": "<session top concepts>", "limit": 10 }`.

Expected output:

```text
Resuming 7f3a9c2 "Auth refresh rework".
Open question: should logout revoke all device tokens or just the current one?
Next step: decide revoke scope, then update auth/logout.ts.
```

## Why

Match the session by directory boundary, not raw prefix, so a sibling repo never
gets mistaken for this one. Never invent observations for an empty session.

## Workflow

1. Resolve the project path: if `$ARGUMENTS` is given, normalize it to absolute
   (`path.resolve(process.cwd(), $ARGUMENTS)`); else use the cwd.
2. Call `memory_sessions`. Pick the most recent session whose normalized `cwd`
   matches by directory boundary: equality, OR `cwd.startsWith(projectPath + sep)`,
   OR `projectPath.startsWith(cwd + sep)`. Prefer `completed` over `abandoned`.
   No match: fall back to the single most recent session overall.
3. If the session ended on an unanswered user-facing question, surface it FIRST.
   Look in `summary` or recent `conversation` observations whose `narrative`
   ends in `?`.
4. Summarize: title/summary, key files, key decisions or errors, using
   `memory_recall` on the top concepts, limit 10.
5. End with one concrete "next step?" pointer.

## Anti-patterns

WRONG: `session.cwd.startsWith(projectPath)` matches `/repo-a-staging` when the
project is `/repo-a`, resuming the wrong repo's session.

RIGHT: `session.cwd === projectPath || session.cwd.startsWith(projectPath + sep)`,
a directory-boundary check that cannot cross sibling repos.

## Checklist

- cwd override resolved to an absolute, normalized path.
- Match used a directory-boundary check, not a raw prefix.
- Unanswered question (if any) leads the response.
- Empty session is reported plainly, with an offer to start fresh.

## See also

- `recap`, `session-history`, `recall`: same session data, broader views.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if `memory_sessions` or `memory_recall` is not available.
