---
name: recap
description: Summarize the last N agent sessions for the current project, grouped by date, with highlight observations per session. Use when the user asks "recap", "what have we been doing", "today", "this week", or wants a rollup of recent work.
argument-hint: "[last N | today | this week]"
user-invocable: true
---

The user wants a recap. Time window args: $ARGUMENTS

## Quick start

```json
memory_sessions { "project": "<current-project-id>", "limit": 30 }
```

Then per surviving session: `memory_recall { "query": "<top concepts>", "project": "<current-project-id>", "limit": 3 }`.
When an agent is requested, pass the same `agentId` to both calls.

Expected output:

```text
2026-06-07
  7f3a9c2 · "Auth refresh rework" · 14 obs · completed
    - [8] Rotate refresh tokens on every use
3 sessions across 2 days, 41 observations.
```

## Why

Only summarize sessions and observations the tools returned. An empty window is
a real answer, not a prompt to invent activity.

## Workflow

1. Parse `$ARGUMENTS`: `today` = current local date; `this week` = last 7 days;
   `last <n>` or bare numeric = most recent N; empty = `last 10`.
2. Call `memory_sessions` with the exact recorded project identifier when known
   and the requested `agentId`. Follow `nextCursor` with the same filters until
   the requested window is covered or pages end. When the project identifier is
   unknown, match normalized `cwd` by directory boundary across pages before
   applying the time/count window. Sort by `startedAt` descending.
3. Group survivors by local calendar date (YYYY-MM-DD).
4. Per session list id (first 8), title or first prompt, observation count,
   status. Obtain highlights with `memory_recall`, retaining project/agent scope,
   and verify each result belongs to that session before including it.
5. End with "N sessions across M days, K observations."

## Anti-patterns

WRONG: window is empty, so you summarize "a productive week of auth work" from
memory of the conversation.

RIGHT: "No sessions in the last 7 days for this project."

## Checklist

- Window parsed correctly from the argument.
- Sessions filtered to the current project's cwd.
- Highlights come from `memory_recall`, not paraphrase.
- Totals line reflects the actual counts shown.

## See also

- `handoff`, `session-history`, `recall`: same session data, different lens.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if `memory_sessions` or `memory_recall` is not available.
