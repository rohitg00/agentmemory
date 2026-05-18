---
name: commit-context
description: Trace a file, function, or line back to the agent session that produced its current commit. Use when the user asks "why is this code here", "what was the agent doing when this changed", or wants context on a specific location in the codebase.
argument-hint: "[file, function, or line]"
user-invocable: true
---

The user wants commit context for: $ARGUMENTS

Run `git blame` (or `git log -L`) on the target file, function, or line in $ARGUMENTS to extract the most recent commit SHA that touched it. Use `git blame -L <start>,<end> <file>` when a line range is given, `git log -L :<function>:<file>` when a function name is given, and `git log -n 1 -- <file>` when only a path is given.

With the SHA in hand, look up the linked agent session via the `memory_commit_lookup` MCP tool with `sha: "<full-sha>"`. If the MCP tool is unavailable, fall back to HTTP: `GET $AGENTMEMORY_URL/agentmemory/session/by-commit?sha=<sha>` with `Authorization: Bearer $AGENTMEMORY_SECRET` when the secret is set.

Present the result as:
- The commit SHA, short SHA, branch, author, message
- The linked session(s): id, project, started/ended timestamps, observation count, summary if any
- A short list of the most important observations from that session (importance >= 7) when available via `memory_recall`

Do not fabricate intent. If the commit has no linked session, say so plainly and surface only what `git show` reveals. If `memory_commit_lookup` returns an empty `commit: null` body, that means the commit predates session linking — do not invent a session.
