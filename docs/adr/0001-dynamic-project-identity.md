# 0001 Dynamic Project Identity and Scoping

## Status
Accepted

## Context
When multiple repositories or workspaces share the same folder name (e.g. `/path/A/Monolith` and `/path/B/Monolith`), agentmemory previously used `basename(dir)`, causing cross-project memory collisions. Requiring manual environment variables like `export AGENTMEMORY_PROJECT` is error-prone and violates zero-configuration requirements.

## Decision
We establish a canonical `ProjectIdentity` with a `project_key` (partition key) and `project_display_name` (UI presentation label) resolved dynamically using a hybrid hierarchy:
1. Prioritize Git remotes (`upstream` first, then `origin`), parsed into a host-qualified slug: `host-owner-repo` (e.g. `github.com-acme-monolith`).
2. If no Git remote exists, fallback to a canonical `realpath`-normalized filesystem path slug (e.g. `Volumes-DB-Work-Monolith`).
3. Maintain `project_display_name` (human-readable repository basename) alongside `project_key` for user interfaces, terminal logs, and dashboards.
4. Git worktrees and clones pointing to the same remote origin or upstream share project memory intentionally to preserve architectural decisions and lessons across branches. Monorepos share a single `project_key` at the Git root while tagging episodic observations with `subpackage` metadata.
5. Implement dynamic aliasing on retrieval: queries using `project_key` fall back to check legacy un-scoped project basenames to maintain access to historical memories without destructive batch migrations.
6. Writes and new observations target `project_key` immediately. Legacy memories are migrated incrementally to `project_key` during consolidation, reflection, and compression (gradual self-healing).
7. Preserve backward compatibility across hook protocols by sending `project_key` in the existing `project` payload field and augmenting with optional `project_display_name`.
8. Memoize resolved workspace identities in an in-process LRU/Map cache by directory to ensure zero Git subprocess overhead during high-frequency hook invocations.

## Consequences
- Guarantees zero namespace collisions between identical directory names without requiring manual environment variables.
- Preserves context sharing across branch switches, forks, and git worktrees.
- Local-only repositories remain cleanly isolated through deterministic canonical path slugs.
- Legacy memories remain accessible via non-destructive dynamic aliasing.
- Minimizes subshell execution overhead via in-process caching.
