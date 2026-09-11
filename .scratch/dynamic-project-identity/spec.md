# Dynamic Project Identity and Scoping Specification

**Status:** ready-for-agent

## Problem Statement

When an engineer works across multiple codebases that happen to share identical folder names (such as `/Volumes/DB/Work/TCC/Monolith` and `/Volumes/DB/Work/Personal/Monolith`), AgentMemory currently resolves the project identity solely from `basename(dir)`. As a result, both repositories resolve to `"Monolith"`, causing cross-project memory collisions: memories, architecture decisions, lessons learned, and session histories from one codebase bleed into another.

Requiring manual environment variables such as `export AGENTMEMORY_PROJECT_NAME=...` violates the zero-configuration promise of modern agent tooling and fails silently whenever an engineer forgets to set or export it.

## Solution

AgentMemory dynamically resolves an autonomous **Workspace Identity** for every workspace without requiring manual environment variables.

1. **Dual Identity Separation**: Clearly decouples the internal **Project Key** (used for partitioning SQLite state, KV scopes, and vector indexes) from the **Project Display Name** (used on the Web Dashboard and terminal logs).
2. **Deterministic Remote & Path Hierarchy**:
   - For repositories with Git remotes, prioritizes `upstream` over `origin` and produces a canonical `host-owner-repo` slug (e.g. `github.com-myorg-monolith`).
   - For local repositories or directories without remotes, falls back to a deterministic canonical `realpath`-derived path slug (e.g. `Volumes-DB-Work-Monolith`).
   - Git worktrees and clones of the same remote share their Project Key, allowing architectural lessons to persist seamlessly across branches.
3. **Monorepo Subpackage Tagging**: Monorepos share a single Project Key at the repository root while attaching a `subpackage` metadata tag to episodic observations.
4. **Dynamic Aliasing & Gradual Self-Healing**:
   - Queries using the new Project Key fall back to check legacy un-scoped project names, guaranteeing that existing stored memories remain accessible.
   - Background consolidation and reflection routines opportunistically re-tag legacy memories with the canonical Project Key without locking or cold batch downtime.
5. **In-Process Caching**: CWD-to-identity mappings are cached in memory to eliminate repeated Git subshell execution overhead during high-frequency hook cycles.

## User Stories

1. As an engineer working on multiple client repositories with identical root folder names (`Monolith`), I want AgentMemory to isolate their memories automatically so that code patterns and conventions from one client never leak into another.
2. As an engineer, I want to switch between Git worktrees or branches of the same repository without losing recalled lessons or architectural decisions so that my workflow remains continuous.
3. As an engineer working in a fork of an open-source project, I want AgentMemory to resolve to the `upstream` remote repository identity so that my session shares knowledge with the canonical project.
4. As an engineer working on a purely local repository without any Git remote, I want AgentMemory to derive a deterministic project key from its canonical path so that multiple local test repos do not collide.
5. As an engineer using symlinks or directory aliases, I want the project key resolution to canonicalize paths via `realpath` so that navigating via different aliases maps to the exact same memory partition.
6. As an engineer working inside a nested subpackage of a monorepo, I want AgentMemory to bind to the root repository's project key while tagging my observations with the relative subpackage path so that repository-wide architectural context is preserved.
7. As an engineer with existing memories stored under legacy folder basenames, I want my past observations to remain searchable and recalled without running manual database migration scripts.
8. As an engineer using high-frequency client hooks, I want identity resolution to be cached in memory per directory so that my editor and terminal run with zero lag.
9. As an engineer viewing the AgentMemory Dashboard (`http://localhost:3113/#dashboard`), I want to see a friendly repository display name alongside distinct project badges so that I can easily distinguish between similarly named projects.
10. As a tool or plugin author, I want backward-compatible hook payloads where the `project` field transparently carries the canonical Project Key so that existing daemon endpoints continue working without breaking changes.

## Implementation Decisions

- **Domain Glossary Alignment**: Strictly conforms to `CONTEXT.md` terminology: `Project Key`, `Project Display Name`, `Workspace Identity`, `Canonical Remote Slug`, `Local Repository Slug`, `Subpackage Tag`, `Dynamic Aliasing`, and `Gradual Self-Healing`.
- **ADR Conformance**: Implements all decisions codified in `docs/adr/0001-dynamic-project-identity.md`.
- **Resolver Core Module**: Encapsulates `resolveWorkspaceIdentity(dir?: string): WorkspaceIdentity` providing:
  - Memoization map: `Map<string, WorkspaceIdentity>`
  - Git remote parsing: matching SSH (`git@host:owner/repo.git`), HTTPS (`https://host/owner/repo.git`), and custom SSH alias formats into `host-owner-repo`.
  - Canonical path slugification: `realpath` resolution with non-alphanumeric character normalization.
- **Hook & Capture Layer**: Updates hook dispatchers to populate `project: identity.projectKey`, `project_display_name: identity.displayName`, and `subpackage` metadata.
- **Daemon Retrieval & Consolidation**:
  - `mem::context` performs dual-lookup: primary query by `projectKey`, secondary fallback query by `displayName` when empty.
  - `mem::consolidate` updates legacy un-scoped project records matching `displayName` to the canonical `projectKey`.
- **Web Dashboard**: Displays `project_display_name` prominently on session cards while presenting the `project_key` in a subtle monospace metadata pill.

## Testing Decisions

- Only test external behavior across boundaries; never assert on private implementation details.
- **Client Hook Dispatch Seam**: Verify that hook calls output the expected JSON payloads (canonical remote slug, local slug, subpackage metadata) across varied test directory topologies.
- **Daemon Retrieval & Dynamic Aliasing Seam**: Verify that queries for a new Project Key retrieve memories previously saved under legacy un-scoped names.
- **Prior Art**: Follow patterns established in `test/hook-project.test.ts`, `test/opencode-dynamic-project.test.ts`, and `test/context-injection.test.ts`.

## Out of Scope

- Cloud-synchronized multi-tenant user authentication.
- Automatic creation or mutation of remote Git repositories or remotes.
- Destructive cold batch rewrites of existing SQLite databases.

## Further Notes

- Maintains complete backward compatibility with `process.env.AGENTMEMORY_PROJECT_NAME` for manual overrides if explicitly desired.
