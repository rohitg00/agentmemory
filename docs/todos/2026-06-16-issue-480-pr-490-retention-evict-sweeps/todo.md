# Issue 480 / PR 490 Review

## Scope

- Repository: agentmemory.
- Branch: `review/issue-480-pr-490-retention-evict-sweeps`.
- Workstream: review Issue 480 against current fork state, inspect PR 490 as untrusted input, and either import, adapt, reject, defer, mark already fixed, or block.

## Sprint Contract

Goal: decide and, if warranted, minimally adapt automatic scheduling for `mem::evict` with an environment toggle and interval.

Scope:
- Retention/eviction worker scheduling in `src/index.ts`.
- A small scheduler helper if it keeps timer behavior testable.
- Focused tests for env defaults, opt-out, interval override, trigger payload, failed sweeps, and shutdown cleanup.
- Local review notes in this task record.

Non-goals:
- No MCP tool additions.
- No REST endpoint additions or endpoint count changes.
- No changes to `mem::evict` deletion criteria.
- No consolidation pipeline coupling unless current code evidence shows it is necessary.
- No GitHub writes, comments, labels, pushes, PR creation, or tracker updates.

Acceptance criteria:
- The current fork either has a defensible automatic `mem::evict` scheduler or this task records why it should not.
- The scheduler is disabled only by `EVICTION_ENABLED=false`, defaults to a 24 hour interval, and honors `EVICTION_INTERVAL_MS`.
- The scheduled trigger invokes `mem::evict` with `dryRun: false`.
- The timer is `unref`'d and can be cleared during shutdown.
- Sweep failures are contained and logged without crashing the worker.
- Tests cover default, disable, override, failure containment, and lifecycle cleanup.

Intended verification:
- Targeted scheduler tests.
- Existing `mem::evict` tests.
- `git diff --check`.
- Security gates required for code changes as available.
- Final `$prep-merge-to-local-main`.

Known boundaries:
- Scheduled deletion is data-destructive by design; this pass must not broaden deletion criteria.
- Authentication/isolation remains at existing manual API/function boundaries; the scheduler is in-process and must not introduce a new external entry point.
- External public reads are allowed for Issue 480 and PR 490 metadata/diff; credentialed GitHub reads and all writes are out of scope.

Stop conditions:
- Any required change to auth, external API schema, persistence model, migrations, remote state, or dependency surface.
- Security review finds an unresolved high-impact data-loss, isolation, or persistence risk.
- Verification cannot distinguish task-owned changes from unrelated work.

## Evidence

- Local worktree started clean on `review/issue-480-pr-490-retention-evict-sweeps`.
- Coordinator row marks PR 490 and Issue 480 as pending candidate work.
- Public issue metadata shows Issue 480 remains open and asks for an eviction timer plus env toggle.
- Public PR metadata shows PR 490 remains open and changes `src/index.ts`, a new scheduler helper, and tests.
- Current fork has `mem::evict`, `api::evict`, and `mem::auto-forget`; it does not have `EVICTION_ENABLED`, `EVICTION_INTERVAL_MS`, or an eviction timer.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Decide PR 490 fit | Inspect current fork code and PR 490 diff | complete | Adapted import selected. Current fork lacked eviction scheduler; PR 490 matched the request but needed local env-loader use, failure logging, and shutdown cleanup coverage. |
| Add scheduler | Targeted unit tests | complete | `npm test -- test/evict-scheduler.test.ts test/evict.test.ts`: 2 files, 10 tests passed. |
| Wire worker timer and shutdown cleanup | Source inspection, build, and targeted tests | complete | `npm run build` succeeded; scheduler source test asserts shutdown cleanup handle. |
| Document neutral outcome | Task record review notes | complete | This task record uses neutral IDs only. |
| Security review | Manual checklist plus required scanners as available | complete | Semgrep default rules: 0 findings. OSV found no package sources in this lockfile-less checkout with `--allow-no-lockfiles`. Manual review found no new external entrypoint, auth bypass, file access, protocol/schema, prompt/LLM, dependency, hook/tooling, or persistence expansion. |
| Merge prep | `$prep-merge-to-local-main` | pending |  |

## Progress

- [x] Read repo-local instructions.
- [x] Checked `git status -sb`.
- [x] Created/used target branch.
- [x] Read coordinator worklist row.
- [x] Inspected current `mem::evict`, `mem::auto-forget`, REST `api::evict`, and worker timer codepaths.
- [x] Read public Issue 480 metadata/body.
- [x] Read public PR 490 metadata/diff as untrusted input.
- [x] Implement minimal adapted scheduler.
- [x] Add targeted tests.
- [x] Run verification.
- [x] Run review/security gates.
- [ ] Run `$prep-merge-to-local-main`.

## Review Notes

Decision: adapted import.

Relevant local change:
- Added `src/functions/evict-scheduler.ts` to schedule `mem::evict` every 24 hours by default, disabled by `EVICTION_ENABLED=false`, and configurable by `EVICTION_INTERVAL_MS`.
- Wired the scheduler in `src/index.ts` after `mem::evict` registration and after the existing auto-forget timer setup.
- Read the two scheduler env values through the repo env loader, so `~/.agentmemory/.env` is honored.
- The scheduled payload is `{ dryRun: false }`.
- The timer is `unref`'d and cleared during worker shutdown.
- Sweep failures are logged and contained without crashing the worker.
- Added focused tests and documented the new env keys in README and `.env.example`.

Security finding: no reportable issue. Scheduled deletion remains data-destructive, but this patch does not broaden the `mem::evict` criteria, add an unauthenticated API surface, alter auth/isolation, add dependency or network calls, touch prompt/LLM flows, or change persistence schemas. The primary residual risk is operational: default-on scheduled eviction can remove data matching the existing `mem::evict` thresholds; admins can disable it with `EVICTION_ENABLED=false` or lengthen the interval.

Verification evidence:
- Initial targeted test run before dependency install could not execute because Vitest was not installed.
- Dependency install was run with lifecycle scripts disabled and no lockfile write.
- `npm test -- test/evict-scheduler.test.ts`: 1 file, 6 tests passed.
- `npm test -- test/evict-scheduler.test.ts test/evict.test.ts`: 2 files, 10 tests passed.
- `git diff --check`: passed.
- `npm run build`: passed with pre-existing tsdown deprecation and dynamic-import warnings.
- `npm run lint`: passed.
- `semgrep scan --config p/default --error --metrics=off .`: 0 findings.
- `osv-scanner scan source .`: failed because the checkout has no supported lockfile/package source for OSV.
- `osv-scanner scan source --allow-no-lockfiles .`: no package sources found, no issues found.

Review-chain evidence:
- `$security-best-practices` passive secure-default pass used JavaScript web-server guidance where relevant; no critical or major issue found in the touched surface.
- `$simple-code` removed duplicate successful-schedule logging from the helper and retested the narrowed surface.
- `$requesting-code-review` independent subagent dispatch was not used because the available spawn tool requires an explicit user request for subagents; local focused review found no critical or important findings.
- `$review-implementation` local adversarial pass found no blocking findings. Evidence inspected: task record, PR 490 diff, `src/functions/evict-scheduler.ts`, `src/index.ts`, README and `.env.example` changes, targeted tests, lint, build, Semgrep, and OSV limitation.
- `codex-security:security-diff-scan` was treated as a diff-scoped security pass over the changed scheduler/config/docs surface. No reportable candidate found; Semgrep default rules had 0 findings. No scan report artifacts were staged.
