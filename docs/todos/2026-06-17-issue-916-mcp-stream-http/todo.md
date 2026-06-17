# Issue 916 MCP Streamable HTTP Task State

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/489b/agentmemory`
- Branch: `issue/916-mcp-stream-http`
- Issue: GitHub issue #916, upstream PR #939 tracker
- Source of truth: user-approved re-scope after validity investigation
- Spec path: none; this task record and `plan.md` define the approved scope

## Validity Decision

Issue #916 is partially valid. Local Docker, Docker Compose, deploy, health-check, persistent volume, and secret handling coverage already exists and should not be imported from upstream PR #939. The actionable gap is Streamable HTTP support for MCP clients.

Do not import upstream PR #939 as-is. Its root Dockerfile, npm/package-lock assumptions, secret-log guidance, generated plugin script churn, and standalone listener conflict with local architecture and security policy.

## Sprint Contract

Goal: Add a narrow Streamable HTTP MCP endpoint on the existing agentmemory REST surface.

Scope:
- Register `/agentmemory/mcp` through iii `registerFunction`/`registerTrigger`.
- Support JSON-RPC `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`.
- Support JSON-RPC batch POST bodies for the supported method subset.
- Preserve existing `/agentmemory/mcp/tools` and `/agentmemory/mcp/call` helper routes for the stdio shim.
- Enforce existing bearer auth when `AGENTMEMORY_SECRET` is set.
- Add origin validation for browser-origin requests to reduce DNS rebinding risk.
- Update docs for the supported endpoint and explain why this fork uses the existing REST port rather than upstream's separate `3114` listener.

Non-goals:
- No Docker rewrite or root Dockerfile import.
- No separate `3114` listener.
- No new dependency.
- No resource or prompt Streamable HTTP routing in the first pass unless tests or existing client behavior prove it is required.
- No remote fetch, push, PR creation, deployment, migration, publish, or changes against `rohitg00/agentmemory`.

Acceptance criteria:
- `POST /agentmemory/mcp` handles `initialize` with an MCP-compatible JSON-RPC response.
- JSON-RPC notifications return HTTP 202 with no JSON-RPC response body.
- `tools/list` returns the same default tool surface as the existing helper route.
- `tools/call` routes through the existing MCP tool handler and preserves success/error behavior.
- JSON-RPC batch requests return batched responses, and notification-only batches return HTTP 202.
- Missing or wrong bearer token returns 401 when a secret is configured.
- Suspicious non-loopback `Origin` headers are rejected.
- Existing MCP helper routes and stdio transport tests remain passing.

Intended verification:
- Red/green targeted Vitest for new Streamable HTTP behavior.
- Existing MCP surface tests.
- Config/consistency tests if endpoint counts or docs change.
- Build/type check via repo-native scripts where feasible.
- Required security gates before commit because this changes auth/network/protocol handling.

Known boundaries:
- This changes a network/protocol surface and auth handling at an existing endpoint family.
- The user approved proceeding with this re-scoped boundary in the current turn.
- GitHub feature-loop local branch prep is authorized; remote fetch/push/PR creation is not.

Stop conditions:
- Need to add a new network listener or separate port.
- Need to change Docker/deploy secret behavior.
- Need to alter persisted state schema or MCP tool contracts.
- Verification reveals compatibility requirements that conflict with the approved narrow scope.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Streamable HTTP initialize, notification, malformed-notification, and batch handling | New focused Vitest in `test/mcp-streamable-http.test.ts` | Green | RED run first failed because `mcp::streamable` was not registered; final focused run passed 13 tests |
| Streamable HTTP tools/list and tools/call routing | New focused Vitest plus existing `test/mcp-server-surface.test.ts` | Green | `corepack pnpm exec vitest run test/mcp-streamable-http.test.ts test/mcp-server-surface.test.ts test/mcp-transport.test.ts test/mcp-standalone.test.ts test/consistency.test.ts` passed 5 files / 210 tests |
| Auth and Origin checks | New focused Vitest | Green | Missing bearer returns 401, loopback/missing Origin allowed, non-loopback/malformed Origin rejected, and GET/DELETE guard before 405 |
| Docs clarify endpoint and port decision | README update and consistency tests | Green | README documents `http://localhost:3111/agentmemory/mcp`, bearer rule, POST-only JSON-RPC, and no `3114` listener; consistency test passed |
| Security gates | Semgrep and Gitleaks | Green with noted historical risk | Pre-merge Semgrep scanned 703 tracked files with 0 findings; post-merge Semgrep scanned 711 tracked files with 0 findings; staged Gitleaks found no leaks; current-tree Gitleaks `--no-git` found no leaks; full-history Gitleaks found 14 historical `.pnpm-store/v10/...` findings from commit `6849579677ce25544b480f1bd4fd9fd3b4df6032`, not introduced by this task |
| GitHub push prep | `github-push-prepare` local branch prep | Complete | Local `origin/main` (`3cee91d1caf7c7ad2910f2f6f4ceb3b1a3ca3674`) merged into branch, producing merge commit `bea6a1c1c7e429c1ee399e0d3b40c8f7c6078957`; post-merge full tests/build/Semgrep/Gitleaks current-tree checks passed |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Validity investigation | Docker/deploy/MCP transport/readme/tests | No | Decide whether issue is actionable and report evidence | Completed before implementation; decision was partial validity/re-scope | Did not run tests |
| Plan review | `docs/todos/2026-06-17-issue-916-mcp-stream-http/plan.md` and approved scope | No | High/Medium plan findings only | Completed; found missing MCP surface registration test update, underspecified JSON-RPC errors, underspecified Origin boundaries, and missing build verification | All findings accepted and folded into plan/tests |
| Implementation | Task-owned files from plan | Yes, bounded by assigned files | Patch plus verification notes | Completed in main agent; no implementation subagent edits used to avoid overlapping central MCP write scope | Main agent responsible for integration |
| Final review | Stable diff | No | Security/test/maintainability findings | Completed; found batch support gap, stale task state, malformed-notification validation gap, and GET/DELETE guard gap | Findings accepted and fixed with tests except task state, which is updated here |

## Progress

- Created local branch `issue/916-mcp-stream-http`.
- Validity investigation completed by main agent and read-only explorer subagent.
- Task record created.
- Added RED tests in `test/mcp-streamable-http.test.ts`.
- Dependency setup note: initial `corepack pnpm exec vitest run test/mcp-streamable-http.test.ts` was blocked by pnpm ignored-build hardening before Vitest started. Ran `corepack pnpm install --frozen-lockfile --ignore-scripts`, then reran the focused test and observed the expected missing-handler failures.
- Plan review completed by read-only subagent. Accepted findings: update `test/mcp-server-surface.test.ts`, add JSON-RPC error tests, add explicit Origin boundary tests, and include `corepack pnpm run build` in final verification.
- Implemented Streamable HTTP on the existing iii REST surface at `/agentmemory/mcp`; no Docker rewrite, no separate listener, and no dependency changes.
- Added batch request handling after final review flagged a mismatch with the advertised `2025-03-26` protocol.
- Added malformed-notification validation before the 202 shortcut and reused auth/Origin guards for GET/DELETE 405 handlers.
- Verification completed so far: focused Streamable HTTP tests passed 13 tests; MCP regression suite passed 5 files / 210 tests; full `corepack pnpm test` passed 172 files / 2238 tests; touched-file ESLint passed; `corepack pnpm run build` passed with existing plugin timing/dynamic-import warnings.
- Security verification completed: Semgrep default registry scan passed with 0 findings before and after local `origin/main` integration; staged Gitleaks scan passed with no leaks found; current-tree Gitleaks `--no-git` passed with no leaks found. Full-history Gitleaks reported 14 historical findings from commit `6849579677ce25544b480f1bd4fd9fd3b4df6032` under `.pnpm-store/v10/...`; they are not introduced by this task branch. OSV was not required because this task did not change dependencies, lockfiles, container images, vendored code, or third-party package surfaces.
- Build/test setup side effects in generated plugin scripts and pnpm hardening placeholders were removed; current dirty paths are task-owned only.
- Local GitHub push-prep completed without fetch, push, PR creation, or any action against `rohitg00/agentmemory`: merged existing local `origin/main` into `issue/916-mcp-stream-http`, reran full tests and build, reran Semgrep and Gitleaks current-tree checks, and left the worktree clean except for this final task-state update before the closeout commit.
