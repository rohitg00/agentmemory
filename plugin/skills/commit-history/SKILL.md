---
name: commit-history
description: List recent git commits linked to agent sessions, optionally filtered by branch or repo. Use when the user asks "show agent commits", "what has the agent shipped", "list linked commits", or wants commits with their session context.
argument-hint: "[branch=... repo=... limit=...]"
user-invocable: true
---

The user wants a list of agent-linked commits. Filter args: $ARGUMENTS

## Quick start

```json
memory_commits { "branch": "main", "limit": 20 }
```

Expected output:

```text
9a1b2c3 main 2026-06-07 "rotate refresh tokens" · session 7f3a9c2 (14 obs)
b21d004 main 2026-06-05 "rate limiter audit"    · session b21d004 (9 obs)
```

## Why

Render only the commits the tool returned, newest first. An empty result means
the filter matched nothing, not that work is missing.

## Workflow

1. Parse `$ARGUMENTS` for `branch=<name>`, `repo=<url-or-fragment>`,
   `limit=<n>`. A bare numeric token is the limit. Defaults: no branch, no repo,
   limit 100, max 500.
2. Call `memory_commits` with the parsed filters.
3. Render reverse-chronologically: short sha, branch, authored timestamp, first
   line of the message, linked session id(s) (first 8) with observation counts,
   and file count when `files` is present.
4. Empty result: tell the user the filter matched nothing and suggest dropping
   the branch or repo filter.

## Anti-patterns

WRONG (REST fallback): concatenate `?branch=` + raw branch name, so a name with
`?`, `&`, or `#` corrupts the query string.

RIGHT: URL-encode every value with `URLSearchParams`/`encodeURIComponent` before
appending to `GET /agentmemory/commits`.

## Checklist

- Filters parsed; bare number treated as limit; limit capped at 500.
- Output is reverse-chronological.
- Session ids and observation counts come straight from the response.
- REST fallback URL-encodes branch, repo, and limit.

## See also

- `commit-context`: drill into one commit's session.
- `recall`: search the observations behind a linked session.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if `memory_commits` is not available.
