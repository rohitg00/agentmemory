# Issue 222 Memory Lesson Save Docs

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/dad1/agentmemory`
- Branch: `github-pr/issue-222-memory-lesson-save-docs-ce60bba`
- Target issue: `wbugitlab1/agentmemory#222`, mirroring upstream `rohitg00/agentmemory#552`
- Task type: documentation fix for an already implemented MCP/REST lesson lifecycle surface

## Evidence Before Edits

- `git status -sb --untracked-files=all`: clean detached `HEAD` before branch creation.
- Local branch created from `ce60bba0682e7e8fdfcc62250a2491d1e6a20e5c`.
- Public issue evidence:
  - `wbugitlab1/agentmemory#222` is open and asks to document `memory_lesson_save`.
  - `rohitg00/agentmemory#552` is open with the same title/body.
  - `rohitg00/agentmemory#222` is a closed unrelated PR, so it is not the target issue.
- Implementation evidence:
  - `src/mcp/tools-registry.ts` defines `memory_lesson_save`, `memory_lesson_recall`, `memory_lesson_list`, and `memory_lesson_strengthen`.
  - `src/mcp/server.ts` routes the MCP tools to `mem::lesson-*`.
  - `src/functions/lessons.ts` implements confidence defaults, duplicate reinforcement, explicit strengthening, recall/list filtering, and decay sweep behavior.
  - `src/triggers/api.ts` exposes REST endpoints under `/agentmemory/lessons`.
  - `test/lessons.test.ts`, `test/mcp-server-surface.test.ts`, `test/mcp-standalone.test.ts`, and `test/api-boundary-coverage.test.ts` cover the implemented surface.
- Current documentation evidence:
  - `plugin/skills/agentmemory-mcp-tools/REFERENCE.md` already lists `memory_lesson_save`; generated skill docs are not the main gap.
  - `README.md` does not include the lesson tools in its MCP tool inventory and lacks `memory_lesson_save` versus `memory_save` guidance.
  - `AGENTS.md` documents project engineering rules, not user-facing tool usage; no AGENTS template in the repo currently tells agents how to save lessons.

## Sprint Contract

Goal: Close the documentation gap for `memory_lesson_save` by documenting the existing lesson lifecycle without changing runtime behavior.

Scope:
- Update the README MCP/tool documentation so `memory_lesson_save` is visible and its confidence, duplicate reinforcement, explicit strengthening, decay, recall/list, and REST equivalents are described.
- Update any repo-local agent/user-facing instruction surface only if it currently misdirects lesson saving.
- Keep task state current.

Non-goals:
- No MCP, REST, function, schema, auth, persistence, dependency, generated-doc, translated README, or plugin metadata changes.
- No generated broad rewrites unless a drift check proves they are necessary for this issue.
- No fetch, pull, push, PR creation, PR merge, publish, deploy, destructive cleanup, or remote state change.

Acceptance criteria:
- README lists `memory_lesson_save` in the MCP tool inventory.
- README explains when to use `memory_lesson_save` versus `memory_save`.
- README documents the implemented lesson lifecycle accurately: default/explicit confidence, duplicate save reinforcement, `memory_lesson_strengthen`, recall/list confidence filters, weekly decay behavior, and low-confidence unreinforced soft-delete.
- README references the REST endpoints only as implemented.
- Verification proves docs match registry, MCP handler, REST endpoint behavior, and tests.

Known boundaries:
- Documentation-only task; runtime behavior is externally visible but must not change.
- Public issue lookups are read-only and non-credentialed.
- `origin/main` freshness requires explicit approval for `git fetch`; absent that, local `origin/main` only may be used during PR prep.

Stop conditions:
- A required fix would change runtime behavior, public APIs, auth/security, schema, persistence, dependencies, generated documentation across broad surfaces, or remote state.
- Verification shows the documented lifecycle is not actually implemented.
- Existing generated-doc drift would require broad non-task-owned rewrites.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Confirm issue still needs a fix | Public GitHub API + repo docs search | Done | `wbugitlab1/agentmemory#222` and `rohitg00/agentmemory#552` open; README lacks lesson-tool inventory/guidance. |
| Document MCP lesson tools in README | Search README and compare with `src/mcp/tools-registry.ts` | Done | README MCP section now lists `memory_lesson_save`, `memory_lesson_recall`, `memory_lesson_list`, and `memory_lesson_strengthen`; `rg` confirms matching source/test tool names. |
| Document lifecycle and `memory_save` distinction | Compare README text with `src/functions/lessons.ts` and tests | Done | README now documents `memory_lesson_save` versus `memory_save`, confidence defaults, duplicate reinforcement, explicit strengthen, recall/list behavior, decay, soft-delete, and REST endpoint equivalents. |
| Avoid generated-doc drift | Run `corepack pnpm run skills:check` or document blocker | Done | Initial run was blocked by pnpm ignored-build hardening; after `corepack pnpm install --frozen-lockfile --ignore-scripts`, `skills:check` reported only `plugin/skills/agentmemory-config/REFERENCE.md` env drift, unrelated to `memory_lesson_save`. |
| Verify docs/tests | Run targeted tests/searches covering docs, tool counts, MCP/REST lesson behavior, and server-core/fallback boundaries | Done | `rg` confirmed README/source/test evidence. Expanded targeted Vitest passed 6 files / 213 tests, including `test/mcp-surface-default.test.ts` and `test/mcp-standalone-proxy.test.ts`. |
| Local branch/commit prepared | `github-push-prepare` local branch prep | Done | Created commit `9152051a`; merged local `origin/main` commit `b5e02429` into the branch with merge commit `53abaa11`; PR diff remains README plus task-state files. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Pre-implementation plan review | `docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/plan.md`, README/tool evidence | No | High/Medium findings or ACCEPT | Completed: two Medium findings triaged as fixed in the plan/task record. | Residual fallback/REST wording risk addressed before README edits. |
| Implementation/review | README/task docs only unless plan review changes scope | Yes, scoped | Patch summary, files changed, verification evidence | Completed: README and task docs changed; final Accuracy and Boundary/Security reviewers returned ACCEPT. Verification reviewer found one Medium test-gap, fixed by expanding targeted test command and rerunning. | No unresolved High/Medium findings. |

## Progress

- Created task state and plan.
- Ran pre-implementation review. Finding 1: plan risked implying `memory_lesson_save` is always available; fixed by requiring README language that distinguishes full server/proxy and server core from the 7-tool local fallback. Finding 2: plan overstated REST whitelist verification; fixed by narrowing claims to endpoint paths and observed payload behavior.
- Ran generated-doc drift baseline. `corepack pnpm run skills:check` first materialized dependencies but failed with `ERR_PNPM_IGNORED_BUILDS`; followed repo instruction with `corepack pnpm install --frozen-lockfile --ignore-scripts`, then reran `skills:check`. Result: exit 1 only for unrelated `plugin/skills/agentmemory-config/REFERENCE.md` env drift.
- Updated README MCP documentation with server-core/fallback wording, lesson tool inventory rows, `memory_lesson_save` versus `memory_save` guidance, lifecycle mechanics, and REST endpoint equivalents.
- Final verification reviewer found the planned Vitest command did not include tests for the new server-core/fallback wording. Triage: valid Medium, fixed by adding `test/mcp-surface-default.test.ts` and `test/mcp-standalone-proxy.test.ts` to the targeted test command.
- Expanded targeted Vitest verification passed: `corepack pnpm exec vitest run test/tool-count-consistency.test.ts test/lessons.test.ts test/mcp-server-surface.test.ts test/api-boundary-coverage.test.ts test/mcp-surface-default.test.ts test/mcp-standalone-proxy.test.ts --exclude test/integration.test.ts` reported 6 files / 213 tests passed.
- Final read-only documentation accuracy review: ACCEPT.
- Final read-only boundary/security review: ACCEPT.
- Security gates: `gitleaks detect --source . --redact` passed with no leaks; `semgrep scan --config p/default --error --metrics=off .` scanned 670 tracked files with 0 findings.
- Generated docs check remains blocked by unrelated existing drift: `corepack pnpm run skills:check` exits 1 for `plugin/skills/agentmemory-config/REFERENCE.md` AUTOGEN env drift. The MCP tools reference is not reported stale.
- Local commit created: `9152051a docs: document memory lesson save lifecycle`.
- `github-push-prepare` local base integration used existing local `refs/remotes/origin/main` at `b5e02429e85792ef1565acb816fd890eaba00fe4`; no fetch was run, so freshness is unverified. The initial sandboxed merge was blocked by Git metadata permissions; the same local merge command succeeded with escalation and created merge commit `53abaa11`.
- Post-merge PR diff from `origin/main` contains only `README.md`, `docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/plan.md`, and `docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/todo.md`.
- Post-merge targeted Vitest passed 6 files / 213 tests. Post-merge `gitleaks detect --source . --redact` passed with no leaks. Post-merge `semgrep scan --config p/default --error --metrics=off .` scanned 670 tracked files with 0 findings.
- Final `corepack pnpm run skills:check` still exits 1 only for unrelated `plugin/skills/agentmemory-config/REFERENCE.md` AUTOGEN env drift.

## Final Review Notes

- Sprint Contract status: acceptance criteria met for README inventory, `memory_lesson_save` versus `memory_save` guidance, lifecycle documentation, full-server REST endpoint references, and verification against the implemented MCP/REST/function/test surface.
- Caveat: full `skills:check` is not green because of unrelated `agentmemory-config` generated env-reference drift. No generator run was performed because it would be a broad non-task-owned rewrite.
- Final branch status before handoff: local branch prepared against local `origin/main`; remote freshness unverified because fetch was not approved.
- Push/PR creation not performed; no current-turn approval for remote writes.
