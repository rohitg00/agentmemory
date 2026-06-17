# Issue 926 MCP Project Scope

## Scope

- Repository: `agentmemory`
- Worktree: `/Users/A1538552/.codex/worktrees/7d3c/agentmemory`
- Branch: `issue/926-mcp-project-scope`
- Base commit at start: `f6f9e3cb`
- GitHub issue: #926, `memory_save` and read tools dropping the MCP `project` argument.
- Owner scope: MCP standalone shim, MCP tool registry, MCP server handler, and focused tests.

## Active Instructions And Boundaries

- Repo instructions: `AGENTS.md` read.
- Global/delegation instructions: no fetch, pull, push, PR creation, merge, deployment, credentialed browser/API action, destructive cleanup, or remote state change without separate current-turn approval.
- The full GitHub feature-loop invocation authorizes only local PR-prep work on task-owned surfaces; remote operations remain withheld.
- `github-push-prepare` is referenced by `github-feature-loop` but is not available as a skill in this session; this is a loop-completion blocker to record in handoff.
- Detached HEAD was converted to local branch `issue/926-mcp-project-scope` before source edits.
- Preserve unrelated changes. Initial status was clean: `git status -sb --untracked-files=all` returned `## HEAD (no branch)`.

## Validation Evidence

- `src/mcp/tools-registry.ts` advertised `project` for `memory_save`, but not for `memory_recall` or `memory_smart_search`.
- `src/mcp/standalone.ts` `Validated` did not include `project`; `validate()` did not extract it for save/search tools.
- `src/mcp/standalone.ts` proxy paths for `/agentmemory/remember`, `/agentmemory/search`, and `/agentmemory/smart-search` built bodies without `project`.
- `src/mcp/standalone.ts` local fallback saved memories without `project` and searched all local memories without project filtering.
- `src/mcp/server.ts` already forwarded `project` for `memory_save`, but not for `memory_recall` or `memory_smart_search`.
- `src/triggers/api.ts` and `src/functions/remember.ts` already whitelist/normalize/save `project` for REST remember.
- `src/functions/search.ts` already supports `project` filtering for observations and saved memories.
- `src/functions/smart-search.ts` already accepts `project` and forwards it to lesson recall; this task forwards the MCP argument into that function.

## Sprint Contract

**Goal:** Preserve the MCP `project` argument from `memory_save`, `memory_recall`, and `memory_smart_search` through standalone proxy mode, standalone local mode, and full server MCP handlers.

**Scope:**
- Add `project` to core MCP schemas for recall and smart search.
- Extract/normalize optional `project` in `src/mcp/standalone.ts`.
- Forward `project` in standalone proxy request bodies.
- Store `project` on local fallback memories and filter local fallback recall/smart-search by project when provided.
- Forward `project` in `src/mcp/server.ts` handlers for `memory_recall` and `memory_smart_search`.
- Add focused regression tests.

**Non-goals:**
- No REST endpoint count or MCP tool count changes.
- No new tools, endpoints, dependencies, migrations, auth changes, storage model changes, or remote operations.
- No broad docs updates unless tests reveal advertised counts or public behavior text is stale.
- No changes to `memory_sessions` or `memory_export` behavior unless validation finds a project-specific drop with an advertised schema.

**Acceptance Criteria:**
- `memory_save` with `project` persists that project in standalone local fallback.
- Local fallback `memory_recall` and `memory_smart_search` with `project` return matching scoped and legacy unscoped memories, and exclude differently scoped memories.
- Standalone proxy mode forwards `project` to `/agentmemory/remember`, `/agentmemory/search`, and `/agentmemory/smart-search`.
- Full MCP server `memory_recall` and `memory_smart_search` forward non-blank trimmed `project` to `mem::search` and `mem::smart-search`.
- Tool schemas expose `project` for `memory_recall`, `memory_save`, and `memory_smart_search`.
- Focused tests pass; broader project-native checks are run or blocked with evidence.

**Intended Verification:**
- Red tests before source edits:
  - `npx vitest run test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server.test.ts --runInBand` or nearest existing filenames if the server test path differs.
- Green focused tests after implementation:
  - `npx vitest run test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server.test.ts --runInBand`
- Type/build check:
  - `npm run build`
- Repo-native full test if dependencies are available:
  - `npm test`
- Security gates for non-trivial code changes:
  - `semgrep scan --config p/default --error --metrics=off .`
  - `gitleaks protect --staged --redact` before any commit, after staging intended files.
  - OSV skipped unless dependency/lock/container/vendored surfaces change.

**Known Boundaries:**
- Public MCP schemas change by adding optional schema fields; this matches advertised/implemented project scoping and does not add a new tool or endpoint.
- No migration needed because legacy unscoped local memories remain visible to project-scoped reads.
- `memory_sessions` and `memory_export` local/proxy paths remain unchanged unless evidence shows they advertise and drop `project`.

**Stop Conditions:**
- A required fix would change persistence schema, auth, routing, endpoint counts, tool counts, or remote state.
- Subagent validation contradicts the local evidence in a way that changes acceptance criteria.
- Verification fails twice for the same unexplained reason.
- Dependency setup or security gates require credentials, private registry access, or tool installation without approval.

## Feature / Verification Matrix

| Change | Verification Method | Status | Evidence |
| --- | --- | --- | --- |
| Validate issue on current code | Main inspection plus read-only Explorer | In progress | Main evidence recorded above; Explorer pending |
| Standalone local save/search preserve project | TDD regression in `test/mcp-standalone.test.ts` | Pending | Not implemented |
| Standalone proxy forwards project | TDD regression in `test/mcp-standalone-proxy.test.ts` | Pending | Not implemented |
| Full MCP server forwards project for recall/smart-search | TDD regression in MCP server tests | Pending | Not implemented |
| Schemas expose project for read tools | Registry assertions | Pending | Not implemented |
| Focused verification | Targeted vitest command | Pending | Not run |
| Build/full test/security gates | `npm run build`, `npm test`, Semgrep/Gitleaks as applicable | Pending | Not run |

## Subagent Ledger

| Workstream | Scope | Edits Allowed | Expected Output | Result | Residual Risk |
| --- | --- | --- | --- | --- | --- |
| Issue validity evaluator | `src/mcp`, `src/triggers`, `src/functions`, `test` read-only | No | Valid/invalid finding, files/commands/evidence/risks | Valid; evidence aligned with main inspection | Backend smart-search project filtering remains broader residual risk |

## Progress

- [x] Read repo instructions and user delegation.
- [x] Checked initial git status.
- [x] Read README excerpt, package scripts, CI, MCP source, search/remember functions, and focused tests.
- [x] Spawned read-only Explorer for independent validation.
- [x] Created local branch from detached HEAD.
- [x] Write plan.
- [x] Add failing regression tests.
- [x] Implement minimal fix.
- [x] Run targeted and repo-native verification.
- [x] Run required security gates or record blockers.
- [x] Update task record with final evidence and handoff.

## Implementation Summary

- Added optional `project` schema fields to `memory_recall` and `memory_smart_search`.
- Regenerated `plugin/skills/agentmemory-mcp-tools/REFERENCE.md` after schema drift.
- `src/mcp/standalone.ts` now normalizes optional `project` for `memory_save`, `memory_recall`, and `memory_smart_search`.
- Standalone proxy mode now forwards `project` to `/agentmemory/remember`, `/agentmemory/search`, and `/agentmemory/smart-search`.
- Standalone local fallback now stores `project` on saved memories and, when a read project is provided, returns matching project memories plus legacy unscoped memories while excluding other project scopes.
- Full MCP server handlers now forward trimmed `project` for `memory_recall` and `memory_smart_search`.

## Subagent Result

Explorer `019ed657-f2e8-7f92-b937-9816a2529308` independently found the issue valid:

- Standalone validation did not carry `project`.
- Standalone proxy bodies for remember/search/smart-search omitted `project`.
- Standalone local save/search ignored project.
- Full MCP `memory_save` already forwarded `project`.
- Full MCP `memory_recall` and `memory_smart_search` omitted `project`.
- REST/backend remember/search were already project-aware.
- `memory_sessions` and `memory_export` do not advertise project and were left unchanged.
- Residual risk noted: backend `mem::smart-search` accepts `project` but currently applies it to lesson recall, not hybrid observation/memory results. This task intentionally fixed MCP schema/forwarding/local fallback only.

## Feature / Verification Matrix Final

| Change | Verification Method | Status | Evidence |
| --- | --- | --- | --- |
| Validate issue on current code | Main inspection plus read-only Explorer | Pass | Main + Explorer agreed issue is valid with full-MCP-save nuance |
| Standalone local save/search preserve project | TDD regression in `test/mcp-standalone.test.ts` | Pass | Red failure, then green focused Vitest |
| Standalone proxy forwards project | TDD regression in `test/mcp-standalone-proxy.test.ts` | Pass | Red failure, then green focused Vitest |
| Full MCP server forwards project for recall/smart-search | TDD regression in `test/mcp-server-tools.test.ts` | Pass | Red failure, then green focused Vitest |
| Schemas expose project for read tools | Registry assertion + generated reference | Pass | `skills:check` passes after `skills:gen` |
| Focused verification | `npx vitest run test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server-tools.test.ts` | Pass | 3 files, 46 tests passed |
| Build and skill docs | `npm run build`, `npm run skills:check` | Pass with existing warnings | Build exit 0; skills lint passed, 15 skills checked |
| Full test suite | `npm test` | Blocked by unrelated existing/local failures | 127 files passed, 2 failed; `test/fs-watcher.test.ts` 3 watcher event failures, `test/retention.test.ts` timeout in full run. Isolated rerun: retention passed, fs-watcher still 3 failures |
| Security gates | Semgrep + Gitleaks | Patch-clean, full-repo blocked | Targeted Semgrep on changed files: 0 findings. `gitleaks protect --staged --redact`: no leaks. Full Semgrep: 19 pre-existing findings outside touched files. Full/worktree Gitleaks: historical findings and one pre-existing JWT fixture in `test/fs-watcher.test.ts:287` |

## Verification Evidence

- Red test run before source edits:
  - `npm exec -- vitest run test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server-tools.test.ts`
  - Expected failures observed: 7 project/schema forwarding failures.
- Focused green runs:
  - `npm exec -- vitest run test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server-tools.test.ts` -> 3 files passed, 46 tests passed.
  - `npx vitest run test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server-tools.test.ts` -> 3 files passed, 46 tests passed.
- Dependency setup for verification:
  - `.npmrc` absent.
  - `package-lock.json` and `node_modules/` are gitignored.
  - `npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund` -> exit 0, npm warned about pending install-script approvals.
  - `npm ci --legacy-peer-deps --no-audit --no-fund` -> exit 0, npm warned about pending install-script approvals.
- Build/docs:
  - Initial `npm run build` failed because `tsdown` was not installed before dependency setup.
  - After dependency setup, `npm run build` -> exit 0 with existing tsdown deprecation/plugin timing warnings.
  - `npm run skills:check` initially failed with generated reference drift.
  - `npm run skills:gen` regenerated `plugin/skills/agentmemory-mcp-tools/REFERENCE.md`.
  - `npm run skills:check` rerun -> exit 0, 15 skills checked.
- Full suite:
  - `npm test` -> exit 1, 1416 passed / 4 failed.
  - `npx vitest run test/fs-watcher.test.ts test/retention.test.ts` -> exit 1; retention passed, fs-watcher retained 3 event-capture failures.

## Security Evidence

- `semgrep scan --config p/default --error --metrics=off .` completed and returned 19 blocking findings in pre-existing unrelated files: deploy Dockerfiles, `integrations/filesystem-watcher/watcher.mjs`, `integrations/hermes/__init__.py`, `plugin/opencode/agentmemory-capture.ts`, `src/cli.ts`, `src/functions/compress-synthetic.ts`, `src/functions/flow-compress.ts`, `src/functions/sentinels.ts`, `src/prompts/xml.ts`, and `src/viewer/server.ts`.
- `semgrep scan --config p/default --error --metrics=off src/mcp/standalone.ts src/mcp/server.ts src/mcp/tools-registry.ts test/mcp-standalone.test.ts test/mcp-standalone-proxy.test.ts test/mcp-server-tools.test.ts plugin/skills/agentmemory-mcp-tools/REFERENCE.md` -> 0 findings.
- `gitleaks detect --source . --redact` scanned 794 commits and found 15 historical leaks.
- `gitleaks detect --source . --redact --no-git --verbose` found one pre-existing redacted JWT fixture in `test/fs-watcher.test.ts:287`, outside task files.
- `gitleaks protect --staged --redact` after staging only task-owned files -> no leaks found.
- OSV skipped: no dependency, lockfile, container, vendored, or third-party package surface is part of the intended patch. A gitignored `package-lock.json` and `node_modules/` were created only for local verification and are not staged.

## Handoff Notes

- Issue status: valid and fixed in intended MCP scope.
- No commit created. Commit is blocked by required security/full-test gates unless the user explicitly accepts the pre-existing full-repo Semgrep/Gitleaks findings and local fs-watcher failures for this turn.
- `github-push-prepare` is not available as a skill in this session, so the mandatory GitHub feature-loop final phase cannot be fully executed.
- No fetch, pull, push, PR creation, merge, deployment, migration, or remote write was performed.
- Current branch: `issue/926-mcp-project-scope`.
- Task-owned files are staged for review and staged Gitleaks evidence.
