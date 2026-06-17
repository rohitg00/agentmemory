# Issue 912 README v0.3.0 Docs Drift

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/92f3/agentmemory`
- Branch/worktree: `github-pr/issue-912-readme-v030-docs-0cd8711` in Codex worktree `92f3`
- Issue: GitHub issue #912, upstream-pr-managed tracker for merged upstream PR #3
- Spec: none; source of truth is the user's request plus current repo evidence
- Task-owned files: `README.md`, `scripts/skills/generate.ts`, `test/plugin-surface-contract.test.ts`, `plugin/skills/agentmemory-rest-api/REFERENCE.md`, `website/lib/generated-meta.json`, `integrations/hermes/README.md`, `docs/todos/2026-06-17-issue-912-readme-v030-docs/todo.md`, `docs/todos/2026-06-17-issue-912-readme-v030-docs/plan.md`

## Assumptions

- No remote fetch, pull, push, PR creation, or upstream repository action is approved in this turn.
- Existing `origin/main` local remote-tracking state is usable for local PR-base comparison, with freshness unverified.
- The old upstream PR #3 v0.3.0 README content is not the current target text; current source/docs drift is the actionable criterion.
- The README architecture snapshot should reflect straightforward local counts from current source.

## Sprint Contract

- Goal: Resolve actionable current docs drift left by issue #912 by updating stale README/generated/reference documentation to match current source evidence.
- Scope: Inspect README/source count surfaces, update current documentation that is demonstrably stale, fix the existing skill-reference generator endpoint-count behavior, and record verification evidence.
- Non-goals: No runtime feature changes, no endpoint/tool/hook additions, no dependency changes, no remote state changes, no PR against `rohitg00/agentmemory`.
- Acceptance criteria:
  - README architecture snapshot no longer claims stale source file, LOC, registered function, or KV scope counts.
  - README MCP tool, REST endpoint, hook, and skill counts are checked against local source/config evidence.
  - REST API skill reference documents registered method/path endpoints and is enforced by a targeted contract test.
  - Website generated metadata is refreshed and its `testsPassing` value is reconciled with README test-count claims.
  - Task record and plan capture validity decision, subagent ledger, verification, and local GitHub push-prep boundary.
- Intended verification:
  - `rg`/`node`/`find`/`jq` count checks for README/source count surfaces.
  - Targeted generator contract test in `test/plugin-surface-contract.test.ts`.
  - `corepack pnpm run skills:check`.
  - `corepack pnpm exec prettier --check README.md integrations/hermes/README.md plugin/skills/agentmemory-rest-api/REFERENCE.md docs/todos/2026-06-17-issue-912-readme-v030-docs/todo.md docs/todos/2026-06-17-issue-912-readme-v030-docs/plan.md` if dependencies are available.
  - Required security gates for the generator/tooling diff: Semgrep and staged Gitleaks before commit.
- Known boundaries:
  - Full GitHub feature-loop authorizes local branch prep only: task-owned cleanup, staging, commit, and base comparison/merge inside `github-push-prepare` limits.
  - Fetch, push, PR creation, destructive cleanup, credentialed/session actions, and remote state changes still require explicit current-turn approval.
- Stop conditions:
  - Source counts are ambiguous or require changing externally consumed behavior.
  - Required local verification is blocked by missing dependencies and no targeted substitute covers the changed surface.
  - Review finds drift that would require code/API/schema/tooling changes.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---|---|
| Determine issue #912 validity | Local README/source inspections plus read-only explorer subagent | Complete | Actionable residual exists: current docs/generated references drift from source |
| Update stale README architecture counts | Compare README line against local `find`, `wc`, `rg`, and KV parser counts | Complete | README now says 195 source files, ~44,300 LOC, 2,000+ tests, 284 functions, 54 KV scopes; local counts: 195, 44,271, 284, 54 |
| Update README MCP/resource/skill tables | Compare README table rows against `src/mcp/tools-registry.ts` and `src/mcp/server.ts` | Complete | Node checks found 56/56 MCP tools and 6/6 resources mentioned in README; skills heading now says 15 |
| Fix REST API skill reference generation | Red/green test plus `corepack pnpm run skills:gen` / `skills:check` | Complete | Red test failed on 117 vs 129; generator now de-dupes by method+path; generated reference says 129; green test and `skills:check` passed |
| Refresh website generated metadata | Run `node website/scripts/gen-meta.mjs` and record full generated fields | Complete | Metadata now says version 0.9.27, 56 MCP tools, 12 hooks, 129 REST endpoints, 2010 tests, fresh `generatedAt` |
| Update Hermes health example | Compare example against `api::health` response in `src/triggers/api.ts` | Complete | Hermes README now promises the stable `"status":"healthy"` field plus expanded payload fields, not an exact object |
| Confirm nearby README counts | Check MCP tools, REST endpoints, hooks, skills against source/config | Complete | Local counts: 56 MCP tools, 129 REST endpoints, 12 hook events, 15 skills |
| Verify docs formatting / source count evidence | Run targeted repo-native or closest available checks | Complete with blocker | Prettier check blocked because `prettier` is not installed; substituted `git diff --check`, ESLint on touched TS files, source count checks, README coverage checks, Vitest, and `skills:check` |
| Run security gates for tooling change | Semgrep for script/test/tooling surface and Gitleaks before commit | Complete | Semgrep completed with 0 findings; staged Gitleaks found no leaks |
| Prepare local PR branch | `github-push-prepare` local branch-prep phase, no remote writes | Complete | Branch created locally; existing local `origin/main` base `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`; no fetch/push approved or performed; base merge no-op |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
|---|---|---:|---|---|---|
| Read-only validity investigation | README and source/config count surfaces for issue #912 | No | Validity decision, files inspected, commands, exact mismatches, uncertainty | Complete | Residual risk: source-file/LOC counting methodology is partly convention-based; function/KV/tool/endpoint drift is concrete |
| Pre-implementation plan review | Plan/task state scope and verification review | No | High/Medium findings only | Complete | Valid findings fixed: generator method+path behavior and website metadata test-count side effects |
| Final implementation review | Task-owned working-tree diff | No | General correctness/scope/verification findings | Complete | One minor finding fixed by updating task-state status/evidence |
| Security/boundary review | Task-owned working-tree diff | No | Security/boundary findings only | Complete | ACCEPT; no findings |

## Progress

- Confirmed working directory with `pwd`.
- Confirmed clean initial worktree with `git status -sb --untracked-files=all`.
- Confirmed detached HEAD at `0cd87113`, matching local `origin/main`.
- Created local branch `github-pr/issue-912-readme-v030-docs-0cd8711` for task-owned edits.
- Inspected README, `package.json`, `src/mcp/tools-registry.ts`, `src/triggers/api.ts`, `src/index.ts`, `src/state/schema.ts`, `plugin/hooks/hooks.json`, `test/mcp-standalone.test.ts`, and docs task conventions.
- Found actionable README drift in the architecture snapshot:
  - README says `174 source files`; local `find src ... | wc -l` says `195`.
  - README says `~37,800 LOC`; local `find src ... | xargs wc -l` says `44,271`.
  - README says `258 functions`; local `rg -o "sdk\\.registerFunction\\(" src | wc -l` says `284`.
  - README says `44 KV scopes`; local parser over `src/state/schema.ts` says `54`.
- Explorer subagent confirmed actionable residual drift and additionally identified:
  - `plugin/skills/agentmemory-rest-api/REFERENCE.md` autogenerated block says `117 registered endpoints`; `src/triggers/api.ts` registers `129`.
  - README `56 Tools` section lists only 45 `memory_*` rows/mentions; missing current tools include vision search, commit lookup/list, Obsidian export, insight list, and slot tools.
  - README MCP resources/skills section says `6 Resources · 3 Prompts · 4 Skills` but lists only 4 resources and 4 skills; source has 6 resources and repo has 15 skills.
  - `website/lib/generated-meta.json` says version `0.9.26`, `mcpTools: 53`, `restEndpoints: 126`; current package/source counts are `0.9.27`, `56`, and `129`.
  - `integrations/hermes/README.md` says `/agentmemory/health` returns exactly `{"status":"healthy"}`; source returns an expanded health payload.
- Pre-implementation reviewer findings:
  - Valid High: generator plan was wrong because `scripts/skills/generate.ts` de-dupes REST rows by path only. Accepted and addressed by adding a test-first generator fix.
  - Valid Medium: website metadata generation also changes `testsPassing` and `generatedAt`. Accepted and addressed by adding test-count acceptance coverage.
- Implemented:
  - Added a failing then passing contract test for REST method/path endpoint documentation.
  - Updated `scripts/skills/generate.ts` to de-dupe REST reference rows by method plus path.
  - Regenerated `plugin/skills/agentmemory-rest-api/REFERENCE.md`.
  - Regenerated `website/lib/generated-meta.json`.
  - Updated README stats, MCP tool/resource/skill tables, and test-count references.
  - Updated Hermes health verification wording.
- Verification evidence:
  - Initial `corepack pnpm exec vitest run test/plugin-surface-contract.test.ts -t "documents each registered REST method/path endpoint"` failed as expected on `117` vs `129`.
  - `corepack pnpm install --frozen-lockfile --ignore-scripts` completed dependency setup after pnpm ignored-build hardening blocked the first test run.
  - `corepack pnpm run skills:gen` regenerated the REST reference.
  - `node website/scripts/gen-meta.mjs` wrote v0.9.27 / 56 tools / 12 hooks / 129 endpoints / 2010 tests.
  - Targeted green test passed.
  - `corepack pnpm run skills:check` passed.
  - Source count checks returned 195 source files, 44,271 LOC, 284 `registerFunction` calls, 54 KV scopes, 129 API triggers, 56 MCP tools, 12 hook events, and 15 skills.
  - README coverage checks found no missing MCP tools or MCP resources.
  - Stale-string search found no matches for old counts/examples.
  - `corepack pnpm exec vitest run test/plugin-surface-contract.test.ts` passed 9/9 tests.
  - `corepack pnpm exec eslint scripts/skills/generate.ts test/plugin-surface-contract.test.ts` passed.
  - `git diff --check` passed.
  - `semgrep scan --config p/default --error --metrics=off scripts/skills/generate.ts test/plugin-surface-contract.test.ts README.md integrations/hermes/README.md` completed with 0 findings.
  - `gitleaks protect --staged --redact` scanned staged content and found no leaks.
  - Final post-commit verification: `corepack pnpm exec vitest run test/plugin-surface-contract.test.ts` passed 9/9 tests; `corepack pnpm run skills:check` passed; `corepack pnpm exec eslint scripts/skills/generate.ts test/plugin-surface-contract.test.ts` passed; `git diff --check HEAD~1..HEAD` passed.
  - Local PR base capture used existing `refs/remotes/origin/main` at `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`; freshness is unverified because fetch was not approved.
- Commits:
  - `e4308453` docs: update README source stats
- Formatting caveat:
  - `corepack pnpm exec prettier --check ...` failed because `prettier` is not installed in this repo.

## Review Notes

- No unrelated dirty paths were present before branch creation.
- No remote operations were run.
- Pnpm auto-inserted an `allowBuilds` block into `pnpm-workspace.yaml` during dependency setup; this was not task-owned and was removed.
- No base merge was needed because the captured local `origin/main` base is already an ancestor of the working branch.
