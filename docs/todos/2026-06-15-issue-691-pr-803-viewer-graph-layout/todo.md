# Issue 691 / PR 803 Viewer Graph Layout Review

Scope: repository worktree `/Users/A1538552/.codex/worktrees/09c6/agentmemory`, branch `review/issue-691-pr-803-viewer-graph-layout`.

## Sprint Contract

Goal: review Issue 691 and PR 803 issue-first, then import only the still-relevant graph viewer layout-stability fix if it fits the current fork.

Scope:
- `src/viewer/index.html`
- `test/viewer-graph-cooldown.test.ts`
- this task record

Non-goals:
- No GitHub writes, no push, no PR creation, no tracker comments or labels.
- No changes to REST/MCP/API contracts, auth, storage, hooks, dependencies, or graph back-end behavior.
- No attempt to reintroduce graph polling if the current fork intentionally avoids it.

Acceptance criteria:
- Issue behavior is evaluated against current local code before PR import.
- PR 803 is treated as untrusted input and only relevant hunks are adapted.
- Velocity cap status is documented.
- Regression coverage fails before the implementation and passes afterward.
- Viewer/security-relevant checks are run or limitations are recorded.
- Local neutral documentation avoids GitHub URLs, hash issue references, and mentions.
- `$prep-merge-to-local-main` is run at the end, or a no-op/blocker is recorded.

Intended verification:
- `npm test -- test/viewer-graph-cooldown.test.ts`
- `git diff --check`
- Security gates as applicable for code changes: Semgrep diff-relevant/default if available; OSV only if dependency surfaces change; Gitleaks before commit if a commit is created.
- `$prep-merge-to-local-main` required final gate.

Known boundaries:
- Public issue/PR reads only; credentialed GitHub reads and all writes are out of scope without current-turn approval.
- PR 803 changes front-end viewer JavaScript and tests only; no service boundary is expected.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first relevance review | Inspect current polling, `loadGraph()`, `initGraph()`, and existing cooldown test | Done | Current poll fallback does not refresh graph tab; `initGraph()` still randomized existing nodes and recentered on reload. |
| Preserve graph node layout on reload | Add failing regression assertions, then adapt minimal viewer code | Done | Red: `npm test -- test/viewer-graph-cooldown.test.ts` failed 3 new tests before implementation. Green: same command passed 1 file / 8 tests after implementation. |
| Preserve graph viewport and avoid duplicate loops/listeners | Add failing regression assertions, then adapt minimal viewer code | Done | `initGraph()` now preserves pan/zoom when previous layout exists, cancels stale rAF, and removes the prior resize listener before adding a new one. |
| Security review | Manual surface review plus required scanners where available | Done | Manual review found no auth/isolation/data-exfiltration/path/protocol/prompt/supply-chain/hook/persistence change. Semgrep default scan on changed tracked files completed with 0 findings. |
| Merge prep | Run `$prep-merge-to-local-main` | In progress | Preflight clean except task-owned files and ignored `node_modules/` verification artifact; local main worktree clean at captured main commit. |

## PR Review Notes

- Issue 691 upstream status: open by public read on 2026-06-15.
- PR 803 upstream status: open by public read on 2026-06-15.
- PR 803 changes only the viewer HTML and viewer cooldown test.
- Current fork already has tick-decayed damping, a velocity cap, and simulation parking coverage.
- Current fork no longer refreshes the graph tab through polling fallback; polling refreshes dashboard, memories, sessions, and activity.
- Current fork still calls `initGraph()` after `loadGraph()` and rebuilds simulation nodes from random positions, resets pan/zoom, stacks resize listeners, and can leave a previous animation frame alive when graph initialization is repeated.

Decision: adapted import.

Imported/adapted:
- Preserve matching graph node `x`, `y`, `vx`, and `vy` across graph initialization.
- Preserve pan and zoom when the graph had a prior layout.
- Stop stale graph runtime before replacing the graph DOM so failed graph reloads cannot leave a detached-canvas resize handler or animation frame alive.
- Cancel any in-flight graph animation frame before restarting.
- Remove the previous window resize listener before registering the next one.
- Use a null-prototype lookup map for preserved node positions because node IDs are data.

Rejected/not imported:
- No polling behavior change. The current fork's polling fallback does not reload the graph tab.
- No new velocity cap. The current fork already has tick-decayed damping, velocity cap, quiet parking, and tests for those pieces.

Verification evidence:
- First `npm test -- test/viewer-graph-cooldown.test.ts`: failed 3 new tests before implementation; this is the TDD red evidence.
- Reviewer follow-up red test: after the first review found stale runtime cleanup missed the failed reload path, `npm test -- test/viewer-graph-cooldown.test.ts` failed 2 new tests before the helper fix.
- `npm test -- test/viewer-graph-cooldown.test.ts`: passed 1 file / 9 tests after implementation, cleanup, and reviewer follow-up fix.
- `git diff --check`: passed after implementation, cleanup, and reviewer follow-up fix.
- `semgrep scan --config p/default --error --metrics=off src/viewer/index.html test/viewer-graph-cooldown.test.ts`: completed successfully with 0 findings after implementation, cleanup, and reviewer follow-up fix.
- `npm install --package-lock=false --ignore-scripts`: installed local verification dependencies only; npm audit summary reported 0 vulnerabilities. It created ignored `node_modules/`, which is a verification artifact and must not be staged.

Security notes:
- Auth/isolation: unchanged. Viewer token handling and API request logic untouched.
- Data exfiltration/networking: unchanged. No new fetch, WebSocket, or external URL.
- Path/file access: unchanged. Browser-only graph rendering code.
- Protocol/schema handling: unchanged. Graph query payload and response shape handling are unchanged.
- Prompt/LLM flows: unchanged.
- DoS/performance: positive/neutral. The change avoids duplicate resize listeners and stale animation loops, including failed reloads; lookup is linear over rendered graph nodes, matching existing initialization scale.
- Supply chain: no dependency manifest or lockfile changed.
- Hooks/tooling/persistence: unchanged.

Review notes:
- First read-only implementation review found one important issue: cleanup ran only inside `initGraph()`, so a failed `graph/query` after DOM replacement could leave stale detached-canvas runtime state. Fixed by adding `stopGraphRuntime()` before `loadGraph()` replaces the graph DOM and reusing that helper in `initGraph()`.
- Second read-only implementation review returned ACCEPT. Residual risk: viewer tests are string-regression assertions rather than browser/runtime behavioral tests; no active rAF or resize listener remains after failed reload.
