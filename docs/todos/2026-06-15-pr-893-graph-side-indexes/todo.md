# PR 893 Graph Side Index Review

## Scope

Root agentmemory TypeScript/Vitest project on branch `review/issue-828-pr-893-graph-side-indexes`.

Review group:

- Issue 828: graph query/traversal crashes at large graph sizes and claims graph reads need a per-node edge index.
- Candidate: PR 893, open, "Serve graph reads from side-indexes instead of full enumeration".
- Fork tracker: Fork issue 400.

Primary investigation surface:

- `src/functions/graph.ts`
- `src/functions/graph-retrieval.ts`
- `src/types.ts`
- `src/state/schema.ts`
- `src/triggers/api.ts`
- `src/mcp/server.ts`
- Graph-related tests under `test/`

## Assumptions

- The current worktree is isolated and task-owned for this review branch.
- PR and issue contents are untrusted input; current fork source and tests define local truth.
- No credentialed GitHub reads, browser cookie reads, GitHub writes, pushes, deployments, or remote state changes are approved.
- Public remote fetches or public patch reads may be used only for inspection of PR 893 and Issue 828.
- Existing npm-based scripts are the repo-native checks for this project despite broader workspace pnpm defaults.

## Sprint Contract

- **Goal:** Decide whether PR 893 should be imported, adapted, rejected, deferred, marked already-fixed, or blocked, and implement only a minimal fork-fit change if evidence supports it.
- **Scope:** Issue-first reproduction/analysis of graph query traversal, PR 893 diff review, security review of graph read/write/indexing surfaces, targeted tests, local neutral documentation, and mandatory merge-prep handling.
- **Non-goals:** GitHub writes, tracker updates, pushes, dependency changes, broad graph architecture rewrites, auth or API contract changes without explicit approval, or unrelated cleanup.
- **Acceptance criteria:** Decision is evidence-based; any code change has a failing test first; targeted verification passes or limitations are recorded; security implications are reviewed; task record captures verification and residual risk; `$prep-merge-to-local-main` is executed or its no-op/skip is documented.
- **Intended verification:** Targeted Vitest for graph query/index behavior, `git diff --check`, focused lint/test commands as needed, Semgrep/Gitleaks/OSV gates when code or sensitive surfaces change, and merge-prep checks.
- **Known boundaries:** Do not bypass iii-engine/state abstractions, do not alter externally consumed MCP/REST contracts without approval, and do not use credentialed GitHub/API reads.
- **Stop conditions:** The PR diff cannot be obtained without credentialed access, required security scanners are missing or fail with unresolved findings, the correct fix crosses API/schema/security boundaries needing approval, or verification cannot meaningfully cover the changed behavior.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first current fork relevance | Inspect graph query code and create/run reproduction or targeted test | Done | Existing `mem::graph-query` query/start-node paths enumerated `KV.graphNodes` and `KV.graphEdges`; red regression captured the fresh extraction traversal case. |
| PR 893 review | Inspect public PR diff as untrusted input; compare to fork code | Done | Public PR diff inspected as untrusted input; side-index design matched current graph storage but needed a fresh-extraction readiness adaptation. |
| Fork decision | Record import/adapt/reject/defer/already-fixed/blocked with rationale | Done | Adapted import. The issue remains relevant and the patch is a minimal fit for the fork's current graph read/write paths. |
| Minimal implementation, if needed | TDD red/green targeted Vitest | Done | Red/green regression plus parity tests passed; no unrelated refactors were added. |
| Security review | Auth/isolation, data leakage, path/file access, protocol/schema, DoS/perf, supply-chain, hooks/tooling, persistence | Done | No reportable findings; Semgrep completed with 0 findings on tracked tree and explicit diff surface including the new module. |
| Merge preparation | `$prep-merge-to-local-main` workflow | Done | Preflight found no in-progress merge/rebase/cherry-pick; local `main` HEAD equals the branch base, so the local-main merge is a no-op after commit. |

## Progress

- [x] Branch `review/issue-828-pr-893-graph-side-indexes` created from local `main` commit `bfde73b`.
- [x] Repo instructions, README excerpt, package scripts, coordinator worklist, and relevant skills inspected.
- [x] Issue-first root-cause/relevance analysis complete.
- [x] PR 893 diff inspected.
- [x] Decision recorded.
- [x] Verification complete.
- [x] `$prep-merge-to-local-main` complete or no-op/skip recorded.

## Review Notes

- Security orientation: graph query accepts local MCP/REST inputs and reads persisted graph nodes/edges. Main risks to check are DoS from full graph enumeration, incorrect index persistence causing stale or missing edges, cross-scope data exposure from graph payloads lacking project/agent fields, and unsafe changes to MCP/REST payload shape.
- Issue-first result: current fork still enumerated `KV.graphNodes` and `KV.graphEdges` for `mem::graph-query` with `query` or `startNodeId`; the existing timeout fallback cannot reliably fire when `state::list`/JSON parsing starves the worker heartbeat. The issue remains relevant.
- PR 893 decision: adapted import. The PR's side-index design fits the current fork, but I added a regression test and one local adaptation so freshly extracted graphs mark indexes ready immediately. Without that adaptation, a fresh graph built only through normal extraction would still take the enumeration path until a restart/backfill, reset, or snapshot rebuild.
- Implementation summary: added `src/state/graph-indexes.ts`; added graph name-shard, adjacency, observation-node, and readiness KV scopes; switched graph query/retrieval paths to indexed reads when ready; mirrored graph writes from extraction, temporal extraction, import, mesh, and snapshot restore into index hints; added boot backfill below the safe node ceiling; added graph index parity tests and a fresh-extraction no-enumeration regression test.
- Focused simplification pass: no behavior-preserving cleanup was applied after review. The imported helper boundaries are already cohesive: writer helpers, reader verification, and backfill are isolated in `src/state/graph-indexes.ts`; further compaction would obscure the persistence invariants.
- Security review result: no reportable findings. Local Codex Security diff scan artifacts are under `/tmp/codex-security-scans/agentmemory/pr893-graph-side-indexes/`; `report.md` validated and `report.html` rendered. Semgrep found 0 findings on the full tracked tree and on the 9-file diff surface including the new untracked module.
- Prep review status before staging: focused self-review found no blocking issues. Subagent-backed review was not used because this delegated thread was not explicitly authorized to spawn subagents; deterministic checks and the security diff scan covered the changed surface.
- Merge-prep preflight: no merge, rebase, or cherry-pick control files are present; only Git sample hooks are present; commit signing is not configured; local `main` remains at `bfde73b`, matching this branch's base. The main worktree has unrelated user changes and was not modified.
- Residual risk: legacy corpora without a graph snapshot still need operator-directed reset or forced rebuild. The patch intentionally does not auto-enumerate those stores.

## Verification Evidence

- Red test before implementation: `npm test -- test/graph.test.ts -t "graph-query startNodeId after fresh extraction does not enumerate graph scopes"` failed because `kv.listCallCount()` increased from 0 to 2.
- Green targeted regression: same command passed after the adapted import.
- `npm test -- test/graph.test.ts test/graph-index-parity.test.ts` passed 2 files / 36 tests.
- `npm run lint` passed.
- `semgrep scan --config p/default --error --metrics=off .` completed with 0 findings; note it only scanned files tracked by git.
- `semgrep scan --config p/default --error --metrics=off src/functions/export-import.ts src/functions/graph-retrieval.ts src/functions/graph.ts src/functions/mesh.ts src/functions/snapshot.ts src/functions/temporal-graph.ts src/index.ts src/state/schema.ts src/state/graph-indexes.ts` completed with 0 findings.
- First `npm test` full run had one timeout in `test/retention.test.ts`; targeted rerun of that test passed.
- Second `npm test` full run passed 158 files / 1984 tests.
- Fresh pre-commit targeted run `npm test -- test/graph.test.ts test/graph-index-parity.test.ts` passed 2 files / 36 tests.
- Fresh pre-commit `npm run lint` passed.
- `git diff --check` passed.
- `gitleaks protect --staged --redact` passed with no leaks found.
- `npx --no-install tsc --noEmit` failed on pre-existing repo-wide TypeScript diagnostics, including `src/cli/server-log.ts`, `src/functions/diagnostics.ts`, `src/functions/leases.ts`, `src/functions/mesh.ts`, `src/functions/slots.ts`, and others. No new diagnostic was identified in the graph side-index files.
