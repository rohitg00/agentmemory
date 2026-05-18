---
name: recap
description: Summarize the last N agent sessions for the current project, grouped by date. Use when the user asks "recap", "what have we been doing", "this week", "today", or wants a rollup of recent work.
argument-hint: "[last N | today | this week]"
user-invocable: true
---

The user wants a recap. Time window args: $ARGUMENTS

Parse `$ARGUMENTS` to determine the window:
- `today` -> sessions started on the current local date
- `this week` -> sessions started in the last 7 days
- `last <n>` -> the most recent N sessions
- bare numeric -> treat as `last <n>`
- empty -> default to `last 10`

Call the `memory_sessions` MCP tool, then filter to the current project (match by `cwd` against the working directory). Apply the time window. Sort by `startedAt` descending.

Group the surviving sessions by their local calendar date (YYYY-MM-DD). For each date:
- List each session: id (first 8 chars), title or first prompt, observation count, status
- Indent two or three highlight observations per session (importance >= 7) drawn from `memory_recall` with a per-session query, limit 3

End with a one-line total: "N sessions across M days, K observations."

If MCP tools are unavailable, fall back to HTTP: `GET $AGENTMEMORY_URL/agentmemory/sessions` and `POST $AGENTMEMORY_URL/agentmemory/recall` with `Authorization: Bearer $AGENTMEMORY_SECRET` when set. Do not invent sessions; if the window is empty, say so.
