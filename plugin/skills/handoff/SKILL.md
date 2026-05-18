---
name: handoff
description: Resume the most recent agent session for the current working directory. Use when the user says "where were we", "resume", "handoff", "pick up where I left off", or starts a session with no fresh context.
argument-hint: "[optional cwd override]"
user-invocable: true
---

The user wants to resume work. Optional cwd override: $ARGUMENTS

Determine the current project path: if `$ARGUMENTS` is provided, resolve it to an absolute, normalized path (accept relative inputs, e.g. `path.resolve(process.cwd(), $ARGUMENTS)`); otherwise use the current working directory.

Call the `memory_sessions` MCP tool. From the result, pick the most recent session whose normalized `cwd` matches the project path with a directory-boundary check — equality OR `session.cwd.startsWith(projectPath + path.sep)` OR `projectPath.startsWith(session.cwd + path.sep)`. Do NOT use a raw string prefix match: it produces false positives across unrelated repos that share a path prefix (e.g. `/repo-a` vs `/repo-a-staging`). Prefer sessions with status `completed` over `abandoned`. If nothing matches, fall back to the single most recent session overall.

Once a session is selected:
1. If the session ended on an unanswered user-facing question, surface that question FIRST as the lead. Look for it in `summary` or in the last few observations (type `conversation` with `narrative` ending in `?`).
2. Then summarize the session: title/summary, key files touched, key decisions or errors. Use `memory_recall` with a query derived from the session's top concepts to fetch supporting observations, limit 10.
3. End with a short "next step?" pointer the user can act on.

If neither MCP tool is available, fall back to HTTP: `GET $AGENTMEMORY_URL/agentmemory/sessions` and `POST $AGENTMEMORY_URL/agentmemory/recall` with `Authorization: Bearer $AGENTMEMORY_SECRET` when set.

Do not invent observations. If the most recent session has zero observations, say so and offer to start fresh.
