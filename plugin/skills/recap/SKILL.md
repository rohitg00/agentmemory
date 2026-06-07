---
name: recap
description: Summarize the last N agent sessions for the current project, grouped by date, with highlight observations per session. Use when the user asks "recap", "what have we been doing", "today", "this week", or wants a rollup of recent work.
argument-hint: "[last N | today | this week]"
user-invocable: true
---

The user wants a recap. Time window args: $ARGUMENTS

## Quick start

```json
memory_sessions { "limit": 30 }
```

Then per surviving session: `memory_recall { "query": "<top concepts>", "limit": 3 }`.

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
2. Call `memory_sessions`, filter to the current project (match `cwd` against the
   working directory), apply the window, sort by `startedAt` descending.
3. Group survivors by local calendar date (YYYY-MM-DD).
4. Per session list id (first 8), title or first prompt, observation count,
   status. Indent 2-3 highlights (importance >= 7) from `memory_recall`.
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

See ../_shared/TROUBLESHOOTING.md if `memory_sessions` or `memory_recall` is not available.
