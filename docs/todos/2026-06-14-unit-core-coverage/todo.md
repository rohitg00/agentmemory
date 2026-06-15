# Unit/Core Coverage Task

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/e905/agentmemory`
- Branch: `coverage/unit-core-functions`
- Start commit: `ec446b7`
- Owning scope: unit/core source surface in `src/functions/**`, `src/state/**`, `src/prompts/**`, and `src/utils/**`
- Test scope: existing `test/*.test.ts` unit/core tests near functions, state, search, context, graph, retention, observe, export/import, replay, and coverage-adjacent behavior

## Sprint Contract

- Goal: raise V8 coverage for the scoped source surface above 80% for lines, statements, and functions, with branches above 80% where practical and documented otherwise.
- Scope: add behavior-first unit tests for existing implementation behavior in the scoped source surface.
- Non-goals: no API, schema, auth, persistence, MCP, REST, dependency, fetch, pull, push, deploy, or system-boundary changes.
- Acceptance criteria:
  - Scoped source surface coverage is measured before and after the task.
  - Lines, statements, and functions for scoped source files are above 80%.
  - Branch coverage is above 80% or the remaining concrete gap is documented with final numbers.
  - `npm run lint`, targeted tests, `npm test`, `npm run coverage`, and `gitleaks protect --staged --redact` pass before commit.
  - Semgrep is run if code/config changes require it.
  - Only scoped changes are committed with a factual message.
- Intended verification:
  - Baseline and final `npm run coverage` with scoped coverage computed from `coverage/coverage-summary.json`.
  - Targeted `vitest run ...` commands for added or modified tests.
  - Full `npm test` and `npm run lint`.
  - Staged Gitleaks before commit; Semgrep when required by touched scope.
- Known boundaries:
  - Preserve existing public contracts and state schemas.
  - Avoid dependency changes.
  - Do not fetch, pull, push, or deploy.
- Stop conditions:
  - Required checks fail for reasons outside the task and cannot be isolated.
  - Coverage cannot reach required thresholds without changing production behavior or broadening externally visible contracts.
  - A required security or coverage gate produces findings that cannot be fixed within scoped changes.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Establish scoped coverage baseline | `npm run coverage`; compute scoped totals from `coverage/coverage-summary.json` | Complete | Baseline scoped totals: lines 81.65%, statements 79.26%, functions 78.28%, branches 68.97% |
| Add unit/core behavior coverage | Targeted `vitest run` commands for changed tests | Complete | `npx vitest run test/unit-core-functions-coverage.test.ts test/image-quota-cleanup.test.ts`: 2 files, 14 tests passed |
| Prove scoped coverage target | Final `npm run coverage`; compute scoped totals | Complete | Final scoped totals: lines 84.16%, statements 81.68%, functions 80.96%, branches 70.61% |
| Run repo quality gates | `npm run lint`, `npm test`, security scans required for changed scope | Complete | `npm run lint` passed; `npm test` passed with 146 files and 1699 tests; `npm run coverage` passed with 146 files and 1699 tests; Semgrep passed with 0 findings; staged Gitleaks passed with no leaks |
| Commit scoped changes | `git status`, staged diff review, commit hash | Complete | Committed scoped changes as `79d345d32dc694350da353829097db5654702fa3` (`test: raise unit core coverage`) |

## Progress Notes

- 2026-06-14: Created task record before edits. Current branch is `coverage/unit-core-functions` at `ec446b7`.
- 2026-06-14: Installed declared npm dependencies with `npm install --package-lock=false --ignore-scripts` from a sanitized environment because the worktree had no `node_modules` and no lockfile. No dependency metadata was changed.
- 2026-06-14: Baseline coverage passed with 144 files and 1685 tests. Scoped surface baseline from `coverage/coverage-summary.json`: lines 81.65%, statements 79.26%, functions 78.28%, branches 68.97%.
- 2026-06-14: Added behavior tests for `DedupMap`, branch-aware worktree/session helpers, pattern detection/rule generation, file-context extraction, and image quota cleanup.
- 2026-06-14: Targeted verification passed for new tests: `npx vitest run test/unit-core-functions-coverage.test.ts test/image-quota-cleanup.test.ts` reported 2 files and 14 tests passed.
- 2026-06-14: Final coverage pass before quality gates reported 146 files and 1699 tests passed. Scoped surface final coverage: lines 84.16%, statements 81.68%, functions 80.96%, branches 70.61%.
- 2026-06-14: Branch coverage remains below 80%. Remaining branch gap is 1,593 uncovered branches across the scoped surface. The largest concrete contributors are broad existing paths in `src/functions/export-import.ts` (136 uncovered branches), `src/functions/diagnostics.ts` (83), `src/functions/replay.ts` (75), `src/functions/temporal-graph.ts` (69), `src/functions/evict.ts` (68), `src/functions/graph.ts` (64), `src/functions/migrate.ts` (59), `src/functions/slots.ts` (57), `src/functions/mesh.ts` (50), and `src/functions/observe.ts` (46). Raising branches above 80 would require a much wider campaign across import/replay/migration/diagnostic and graph paths rather than the focused unit/core coverage lift requested here.
- 2026-06-14: Quality gates passed before commit: `npm run lint`; `npm test` (146 files, 1699 tests); fresh `npm run coverage` (146 files, 1699 tests); `semgrep scan --config p/default --error --metrics=off .` (514 tracked files scanned, 0 findings); `gitleaks protect --staged --redact` (25.46 KB scanned, no leaks found).
- 2026-06-14: Committed the scoped task changes as `79d345d32dc694350da353829097db5654702fa3` (`test: raise unit core coverage`).

## Delegation

- No subagents planned initially. Work is one tightly coupled coverage improvement loop and deterministic repo checks are available.
