# 01 — Workspace Identity Resolver

**What to build:** An autonomous resolver module that inspects a directory or current working directory and returns its `WorkspaceIdentity` containing a globally unique `project_key` and a human-friendly `project_display_name` without requiring manual environment variables.

When a repository has Git remotes, it extracts a host-qualified slug (`host-owner-repo`) preferring `upstream` over `origin`. When working in a local-only folder without remotes, it computes a deterministic canonical path slug using `realpath`. In-memory memoization ensures repeated resolutions for the same directory cost 0ms.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Resolves `upstream` Git remote over `origin` into `host-owner-repo` format across SSH (`git@...`), HTTPS, and SSH alias URL variants.
- [x] Resolves `origin` Git remote into `host-owner-repo` when `upstream` is absent.
- [x] Derives deterministic, non-conflicting Local Repository Slugs from `realpath` when no Git remote exists or when outside a Git repository.
- [x] Resolves identical `project_key` across different Git worktrees belonging to the same repository.
- [x] Memoizes resolution results in an in-memory Map by directory path to eliminate repeated Git process spawning.
- [x] Respects explicit `AGENTMEMORY_PROJECT_NAME` override if provided.
