---
name: commit-context
description: Trace a file, function, or line back to the agent session that produced its current commit. Use when the user asks "why is this code here", "what was the agent doing when this changed", "who wrote this", or wants context on a specific location in the codebase.
argument-hint: "[file, function, or line]"
user-invocable: true
---

The user wants commit context for: $ARGUMENTS

## Quick start

```bash
git blame -L 40,52 src/auth/refresh.ts   # -> SHA 9a1b2c3d
```

```json
memory_commit_lookup { "sha": "9a1b2c3d4e5f60718293a4b5c6d7e8f901234567" }
```

Expected output:

```text
9a1b2c3 on main by dev: "rotate refresh tokens"
Linked session 7f3a9c2 "Auth refresh rework", 14 obs.
```

## Why

Report only what git and the lookup return. When the lookup gives `commit: null`,
the commit predates session linking; do not invent intent.

## Workflow

1. Find the SHA: `git blame -L <start>,<end> <file>` for a line range;
   `git log -L :<function>:<file>` for a function; `git log -n 1 -- <file>` for a
   bare path.
2. Look it up: `memory_commit_lookup { "sha": "<full-sha>" }`.
3. Present the commit (sha, short sha, branch, author, message), the linked
   session(s) (id, project, started/ended, observation count, summary), and the
   importance >= 7 observations via `memory_recall` when available.

## Anti-patterns

WRONG: lookup returns `{ "commit": null }`, you narrate "the agent was
refactoring auth" from the diff alone.

RIGHT: "This commit predates session linking, so there is no recorded agent
session. From `git show`: it changed token rotation in refresh.ts."

## Checklist

- SHA came from git blame/log, not a guess.
- `commit: null` reported as "predates linking", no fabricated session.
- Session details quote the lookup response verbatim.
- No intent claimed beyond what observations state.

## See also

- `commit-history`: list many agent-linked commits at once.
- `recall`: dig deeper into the linked session's observations.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if `memory_commit_lookup` is not available.
