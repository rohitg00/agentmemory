# Issue 303 Engine Data Directory Review

Task id: `2026-06-15-issue-303-engine-data-dir`

## Scope

Review Issue 303 as the primary unit, compare candidate PRs 314, 892, and 528, and adapt only the minimal fork-safe fix if the current fork still writes iii-engine state under the caller working directory.

## Sprint Contract

Goal: prevent default iii-engine file-backed state and stream stores from being created under a user's project working tree.

Scope:
- CLI engine launch and runtime config path handling.
- User-visible CLI help for the new data directory control if a fix is needed.
- Focused regression coverage for data-directory resolution and runtime config rewriting.
- Neutral local documentation of Issue and PR disposition.

Non-goals:
- Do not import unrelated hook, MCP proxy, prompt, stale-index, Docker, migration, or worker-supervision behavior from candidate PRs.
- Do not push, create pull requests, or update remote issue or label state.
- Do not run credentialed GitHub reads or logged-in browser/API reads.

Acceptance criteria:
- Default launch uses a data directory outside the invocation working directory.
- `--data-dir` overrides `AGENTMEMORY_DATA_DIR`; `AGENTMEMORY_DATA_DIR` overrides the platform default.
- The generated engine runtime config contains absolute file-backed state and stream paths.
- Candidate PR decisions are documented locally with security and scope notes.

Intended verification:
- Targeted red/green regression test for runtime data-dir behavior.
- `npm run build`
- `npm run lint`
- `npm test`
- Scope-driven security checks before commit or final merge-prep.

Known boundaries:
- No externally consumed API, schema, MCP tool count, REST endpoint count, KV scope, audit operation, dependency, or package manager change is intended.
- The CLI adds one flag and one environment variable; this is user-visible CLI behavior but directly requested by the candidate issue and contained to local engine data placement.

Stop conditions:
- Stop before any remote state change, credentialed read, destructive cleanup, migration, dependency change, or broad upstream import.
- Stop if the minimal fix requires changing auth, REST/MCP exposure, persistence schema, or iii-engine service boundaries beyond runtime config paths.

## Progress Notes

- 2026-06-15: Branch `review/issue-303-pr-314-engine-data-dir` created from local main commit `bfde73b`.
- 2026-06-15: Worklist row read from coordinator task. Issue 303 candidates are PR 314, PR 892, and PR 528.
- 2026-06-15: Public unauthenticated reads confirmed Issue 303 is open and describes default `npx @agentmemory/agentmemory` creating `data/state_store.db` and `data/stream_store` under the caller's repository.
- 2026-06-15: RED regression confirmed with `npm test -- test/build-runtime.test.ts`; new tests failed because `resolveDataDir` and `renderRuntimeIiiConfig` were not implemented.
- 2026-06-15: Adapted the PR 314 direction with fork-local defaults: native engine runtime config now rewrites file-backed state paths under `~/.agentmemory/data` by default, with `--data-dir` and `AGENTMEMORY_DATA_DIR` overrides.
- 2026-06-15: Simple-code/security pass kept the default aligned with the existing remove-plan data directory and added private mode for newly created data dirs.

## Candidate Comparison

| Candidate | Scope | Diffstat | Decision | Notes |
| --- | --- | --- | --- | --- |
| PR 314 | CLI data-dir flag, env var, runtime config rewrite, README, Docker compose | 5 files, 269 insertions, 9 deletions | adapt | Smallest Issue-303-specific direction. Direct patch does not apply to current fork and Docker compose change is not needed for this task. |
| PR 892 | Engine cwd anchoring, bundled config rewrite, legacy data copy, remove-plan runtime config cleanup | 4 files, 254 insertions, 3 deletions | adapt partially / reject broad import | Relevant to Issue 303, but also claims Issue 700 and Issue 844. Legacy migration and worker-supervision behavior are broader than this task. |
| PR 528 | Hook quoting, non-TTY prompt skips, foreground/background engine lifecycle, stale-index env loading, MCP recall proxy | 9 files, 164 insertions, 31 deletions | reject | Does not directly resolve the data-directory pollution behavior and bundles unrelated surfaces. |

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue relevance | Source inspection | Done | Current `iii-config.yaml` uses `./data/state_store.db` and `./data/stream_store`; `spawnEngineBackground` does not set a data-safe cwd. |
| Candidate comparison | Public PR diffs and diffstat | Done | Direct apply failed for all candidates; PR 314 is the narrowest Issue-303-specific source. |
| Regression test | Targeted Vitest | Done | RED: `npm test -- test/build-runtime.test.ts` failed on missing helper exports. GREEN: same command passed with 8 tests. |
| Minimal implementation | CLI/build-runtime patch | Done | `src/cli/build-runtime.ts` resolves data dir precedence and renders absolute runtime config paths; `src/cli.ts` writes runtime config before native engine spawn. |
| Documentation and generated references | README and skill reference inspection | Done | README documents the default data directory and overrides; `npm run skills:gen` updated `AGENTMEMORY_DATA_DIR` in generated config reference. |
| Verification | Build, lint, tests, security gates | Done | Build, lint, skills check, full tests, diff check, Semgrep, and focused implementation review passed; staged Gitleaks remains the final pre-commit gate. |

## Security Notes

- Primary risk is filesystem placement of persisted memory content and session identifiers.
- Fix keeps default storage under a user-owned application data directory and avoids writing secrets or memory data to project repos.
- No auth, bearer, REST exposure, MCP exposure, schema, dependency, CI, package, or Docker changes are intended.
- Filesystem behavior is changed intentionally: native engine state defaults to `~/.agentmemory/data`, and newly created data directories request private directory permissions.
- Semgrep default rules reported no findings. No dependency, lockfile, container, vendored, or package-surface files changed, so OSV was not required by repo policy.

## Verification Notes

- `npm test -- test/build-runtime.test.ts`: failed before implementation with missing `resolveDataDir` and `renderRuntimeIiiConfig`; passed after implementation with 8 tests.
- `npm run build`: passed. Output included existing tsdown/Rolldown warnings about deprecated `external`/`inlineOnly`, plugin timing, and ineffective dynamic imports.
- `npm run lint`: passed.
- `npm run skills:check`: passed after regenerating `plugin/skills/agentmemory-config/REFERENCE.md`.
- `npm test`: passed with 157 test files and 1975 tests.
- `git diff --check`: passed.
- `semgrep scan --config p/default --error --metrics=off .`: passed with 0 findings across 555 tracked files.
- Local verification used a temporary `node_modules` symlink to the saved project checkout's existing dependencies; the symlink was removed after verification.

## Review Notes

- Passive security-best-practices review: TypeScript/Node CLI and filesystem boundary. No critical or major issue found. The data directory is outside the project repo by default and new directories request private mode.
- Simple-code pass: kept existing `~/.agentmemory/data` remove-plan alignment instead of adding platform-specific default paths; removed unused test/type surface.
- Focused implementation review: no blocking findings. Scope is limited to CLI data placement, generated config reference, README, and tests. No dependency, schema, REST/MCP count, auth, network, or Docker behavior changed.
- Independent subagent review was not run because the available subagent tool is restricted to explicit user requests for subagents; this was recorded as a workflow limitation, and a separate adversarial self-review pass was performed instead.

## Residual Risk

- Existing ignored build artifacts were produced by `npm run build` and left untracked/unstaged.
- The local main worktree contains unrelated dirty files. User confirmed continuing with commit and merge-prep anyway; merge-prep must preserve that worktree untouched and compare against captured local main commit `bfde73b`.
- Full runtime launch against the native bundled engine was not performed; coverage is helper-level regression tests plus build, lint, full test suite, generated skill check, diff check, Semgrep, and staged Gitleaks.
