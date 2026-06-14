# Mesh Project Filter Leak Fix

## Scope

Owning scope: repository `agentmemory`, mesh sync/export boundary.

Task id: `2026-06-13-mesh-project-filter`

Current worktree: `/Users/A1538552/.codex/worktrees/e6ed/agentmemory`

Current HEAD at task start: `21ac25ad367aca55886d2afb920383ff8ab5f1d1`

Initial git state: `git status -sb --untracked-files=all` showed detached `HEAD` with no dirty paths.

## Sprint Contract

Goal: prevent project-scoped mesh push, pull, and export from sharing memories outside the requested project.

Scope:
- Filter `Memory` rows by exact normalized `project` for project-scoped mesh sync/export.
- Keep scoped mesh behavior that omits semantic, procedural, relation, and graph payloads because those rows do not carry a project field.
- Preserve unscoped mesh behavior.
- Add focused regression tests for function-level mesh sync and REST mesh-export behavior.

Non-goals:
- No push or deploy. No remote merge. Local task-owned commit/local-main prep is allowed only by the later prep-merge request.
- No new dependencies.
- No schema migration.
- No inbound peer identity or per-peer receive authorization redesign.
- No broad refactor of mesh protocol or storage boundaries.

Acceptance criteria:
- A peer with `syncFilter.project` pushes only matching memories and actions.
- Scoped push excludes unscoped legacy memories/actions and omits semantic/procedural/relations/graph payloads.
- A project-scoped pull requests remote export with `project=<encoded>` and locally drops nonmatching or unscoped rows before applying data.
- `GET /agentmemory/mesh/export?project=...` filters memories and actions consistently.
- Unscoped mesh sync/export still includes full eligible payloads.
- Targeted mesh/API tests pass.

Intended verification:
- Red tests before production edits:
  - `npm test -- test/mesh.test.ts`
  - `npm test -- test/api-mesh-export-project.test.ts`
- Green targeted tests after fix.
- Relevant existing project-scope tests:
  - `npm test -- test/mesh.test.ts test/api-mesh-export-project.test.ts test/api-memories-project.test.ts test/cross-project-isolation.test.ts test/remember-project-scope.test.ts`
- Type/build or full test suite as feasible:
  - `npm run build`
  - `npm test`

Known boundaries:
- Mesh endpoints are secret-protected; this task changes data selection, not authentication.
- `Memory.project` and `Action.project` exist; `SemanticMemory` and `ProceduralMemory` do not.
- Scoped exports should fail closed and exclude rows with missing `project`.

Stop conditions:
- A fix requires schema changes, new external services, new dependencies, or auth/protocol redesign.
- Existing tests imply a conflicting documented product contract.
- Required verification cannot run after bounded setup/debugging.

## Subagent Ledger

| Workstream | Scope | Edits | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Validity and impact | `src/functions/mesh.ts`, `src/triggers/api.ts`, project-scope tests | No | Verdict, source-to-sink, impact | Valid finding; scoped push/export leaks memories; pull also omits project query | No runtime PoC in read-only phase |
| Scope semantics and fix strategy | Mesh sync/export, types, tests | No | Correct filtering semantics and test plan | Filter memories/actions by project; exclude unscoped rows; keep semantic/procedural omitted for scoped mesh | Inbound receive remains peer-auth only |
| Final security review | Current diff | No | Security findings or accept | Found path-prefixed pull URL regression; fixed with regression test and URL append semantics | Direct mesh-receive remains bearer-token-only and not peer/project-bound |
| Final test coverage review | Current diff | No | Coverage findings or accept | Found missing scoped-pull payload-family and unscoped relation/graph coverage; fixed with expanded tests | None identified after fix |
| Final maintainability/integration review | Current diff | No | Maintainability findings or accept | Request-code-review maintainability/integration lane accepted the diff with no critical or important findings; main-agent simple-code pass found no further safe simplification | Small duplicated project-filter helpers remain intentional across function/API boundaries |
| Prep final implementation review | Current diff | No | Review-implementation gate before staging | Replacement implementation review reported no findings after blank-project fix | Tests were not rerun in that read-only gate |

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Scoped mesh push filters memories and actions | `npm test -- test/mesh.test.ts test/api-mesh-export-project.test.ts` | Done | Initial red: scoped push included `mem_other` and `mem_legacy`; final focused green after prep fixes: 40 tests passed |
| Scoped mesh pull uses project query and local post-filter | `npm test -- test/mesh.test.ts test/api-mesh-export-project.test.ts` | Done | Initial red: scoped pull applied 6 rows; final focused green after prep fixes: 40 tests passed |
| Scoped REST mesh-export filters memories and actions | `npm test -- test/api-mesh-export-project.test.ts` | Done | Initial red: scoped export included other/unscoped memories; final green in focused run |
| Scoped mesh omits semantic/procedural/relations/graph | Mesh/API targeted tests | Done | Expanded final tests cover scoped push, pull, and REST export omission; 40 focused tests passed |
| Unscoped mesh remains unchanged | Mesh/API targeted tests | Done | Expanded final tests cover memories/actions/semantic/procedural/relations/graph for unscoped push/export; 40 focused tests passed |
| Blank project filters do not fall back to unscoped | Mesh/API targeted tests | Done | Prep review important finding fixed; focused run now covers blank `syncFilter.project` and blank `?project=` with 40 focused tests passed |

## Progress

- [x] Confirmed worktree and initial git state.
- [x] Read repo instructions, package scripts, CI workflow, affected mesh/API code, types, and neighboring tests.
- [x] Completed two read-only subagent reviews before edits.
- [x] Consensus: finding is valid and should be fixed.
- [x] Add failing regression tests.
- [x] Implement minimal filtering fix.
- [x] Run targeted and relevant verification.
- [x] Record final evidence and residual risks.

## Final Review Notes

Implemented behavior:
- `mem::mesh-sync` push filters `Memory` and `Action` rows by normalized exact `peer.syncFilter.project`.
- `mem::mesh-sync` pull appends `project` to the remote mesh-export request when scoped, preserves path-prefixed peer URLs, and post-filters pulled memory/action rows before applying them.
- `api::mesh-export` filters memories and actions consistently when `project` is supplied.
- Scoped mesh continues to omit semantic, procedural, relation, and graph payload families because those rows have no project field.
- Explicitly blank project filters are scoped-to-none instead of falling back to unscoped payloads.
- Unscoped mesh behavior remains covered for memory/action and expanded payload families.

Review findings:
- Final test coverage review P2 was valid; fixed by expanding scoped pull and unscoped preservation tests.
- Final security review Medium was valid; fixed by preserving path-prefixed peer URLs and adding a regression test.
- Prep implementation review important finding was valid; fixed by distinguishing absent project filters from explicitly blank project filters and adding Mesh/API regressions.
- Request-code-review maintainability/integration lane accepted the diff with no critical or important findings; main-agent simple-code pass inspected the active diff and found no safe simplification to apply.
- Replacement final implementation review after the blank-project fix reported no findings.

Verification evidence:
- Red: `npm test -- test/mesh.test.ts` failed before implementation because scoped push included `mem_other`/`mem_legacy` and scoped pull applied 6 rows instead of 2.
- Red: `npm test -- test/api-mesh-export-project.test.ts` failed before implementation because scoped export included `mem_other`/`mem_legacy`.
- Red: `npm test -- test/mesh.test.ts -t "preserves path-prefixed peer URLs"` failed before URL fix because `/team-a` was dropped.
- Green: `npm test -- test/mesh.test.ts -t "preserves path-prefixed peer URLs"` passed, 1 passed.
- Green before prep review fix: `npm test -- test/mesh.test.ts test/api-mesh-export-project.test.ts` passed, 38 tests.
- Green after prep review fix: `npm test -- test/mesh.test.ts test/api-mesh-export-project.test.ts` passed, 40 tests.
- Green: `npm test -- test/mesh.test.ts test/api-mesh-export-project.test.ts test/api-memories-project.test.ts test/cross-project-isolation.test.ts test/remember-project-scope.test.ts` passed, 60 tests.
- Green: `npm run build` passed; existing tsdown/Rolldown warnings only.
- First full `npm test` run failed in `test/fs-watcher.test.ts` debounce timing; the isolated debounce test then passed and the full suite passed on retry.
- Green: `npm test` passed on retry, 135 files and 1453 tests.
- Green: `semgrep scan --config p/default --error --metrics=off .` passed, 0 findings.
- Green: `semgrep scan --config p/default --error --metrics=off src/functions/mesh.ts src/triggers/api.ts test/mesh.test.ts test/api-mesh-export-project.test.ts` passed, 0 findings.
- Green: `gitleaks detect --source . --redact` passed, no leaks.
- Green: `gitleaks protect --staged --redact` passed, no leaks.
- Green: `git diff --check` passed.

Residual risks:
- `mem::mesh-receive` remains bearer-token-only and not bound to a peer-specific project. That is out of scope for this surgical export/sync leak fix and would require a protocol/auth design change.
- Staged secret scanning passed before commit.
