---
name: session-history
description: Show what happened in recent past sessions on this project as a clean timeline. Use when the user asks "what did we do last time", "session history", "past sessions", or wants an overview of previous work.
user-invocable: true
---

The user wants an overview of recent sessions on this project.

## Quick start

```json
memory_sessions { "limit": 20 }
```

Expected output:

```text
7f3a9c2 · app · 2026-06-07 09:00 · completed · 14 obs
  - decision: Rotate refresh tokens on every use
b21d004 · app · 2026-06-05 14:00 · completed · 9 obs
  - code: limit.ts counts per-IP
```

## Why

Only show sessions and observations the tool returned. An empty history is a
real answer, never a cue to invent past work.

## Workflow

1. Call `memory_sessions` with `limit: 20` for a meaningful window.
2. Present in reverse chronological order: session id (first 8), project, start
   time, status.
3. For sessions with observations, show the key highlights (type plus title).
4. Note the total observation count per session.
5. When a session summary exists, surface its title and the key decisions.

## Anti-patterns

WRONG: the tool returns two sessions, you describe "several sessions of steady
progress" and add ones you remember from the conversation.

RIGHT: show exactly the two sessions returned, each with its real id, status, and
observation count.

## Checklist

- Every session shown came from the tool response.
- Order is reverse-chronological.
- Per-session observation counts match the response.
- No session or highlight was invented or merged.

## See also

- `recap`: same data grouped by date with highlights.
- `handoff`: jump straight into the most recent session.
- `recall`: search across all sessions by topic.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if `memory_sessions` is not available.
