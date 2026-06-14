# Compress File Root Boundary Task State

Task id: `2026-06-13-compress-file-roots`
Scope: current agentmemory worktree
Branch: `prep-merge/compress-file-roots-21ac25a`
Status: implemented and committed; prep-merge reviews found additional bypass/oracle, parent-swap, and compatibility/doc gaps, all fixed and retested; local `main` was merged into the prep branch and post-merge checks passed; full repo checks blocked by missing local dependencies

## Sprint Contract

Goal: prevent `memory_compress_file` from reading arbitrary Markdown files and sending them to the configured LLM provider by enforcing a trusted root boundary before any file read or provider call.

Scope:
- `mem::compress-file` path validation, read/write safety, and backup handling in `src/functions/compress-file.ts`.
- MCP and REST wrapper validation only where needed to prove unsafe paths are rejected through the external interfaces.
- Focused tests for allowed project-local compression, out-of-root denial, sensitive paths, symlink and TOCTOU safety, backup safety, and MCP/REST delegation behavior.
- Minimal documentation for the explicit root opt-in environment variable if introduced.

Non-goals:
- No push, deploy, merge to main, package publish, dependency installation, or broad API redesign.
- No change to MCP tool count, REST endpoint count, iii-engine architecture, provider selection, auth model, or persisted data schema.
- No attempt to detect secret content inside otherwise allowed Markdown files.

Acceptance criteria:
- Files are compressed only when their canonical path is inside an allowed root.
- The default allowlist preserves project-local compression from a safe project cwd, while broader paths require explicit `AGENTMEMORY_COMPRESS_FILE_ROOTS` opt-in.
- Rejected paths fail before `provider.summarize()` and before backup or overwrite side effects.
- Existing sensitive-path and symlink protections remain, and read/write TOCTOU and backup-symlink cases are covered.
- REST and MCP surfaces still validate shape and expose the function-level denial without widening inputs.
- Targeted tests pass and required security gates are run or blockers are recorded.

Known boundaries:
- Tightening accepted paths is an externally visible security behavior change. The delegated user request explicitly authorizes task-owned fixes for this finding, but does not authorize push, deploy, merge, or new dependencies.
- Explicit root configuration is local operator opt-in. Per-call bypass flags are out of scope because MCP/tool arguments can be model-controlled.
- The root boundary is a filesystem containment control, not a data-loss-prevention scanner for Markdown content.

Stop conditions:
- The fix requires a dependency, migration, auth change, remote state change, or provider behavior change without current-turn approval.
- Required checks report findings that cannot be fixed inside this task-owned scope.
- The policy cannot preserve project-local compression without a broader product decision.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---:|---|
| Validate finding and policy | Two read-only subagents plus local source inspection | Done | Validity subagent `019ec276-2d8c-7240-bf15-2556d45dd6de`; strategy subagent `019ec276-5dfd-7bd0-99a6-ebe0c4350ac2` |
| Add root allowlist before LLM call | Failing tests in `test/compress-file.test.ts` for allowed and out-of-root paths | Done | Red run failed 6 tests on current behavior; green run passes after function-level root policy |
| Preserve sensitive and symlink safety | Existing tests plus new sensitive, parent-symlink, parent-swap, read-time swap, backup-symlink tests | Done | `test/compress-file.test.ts` covers sensitive names, input symlink, parent realpath escape, parent-swap denial after open, read identity swap, backup symlink, and final write identity swap |
| Prove MCP/REST behavior | Focused wrapper tests for forwarding function-level denial and missing path validation | Done | `test/compress-file-interfaces.test.ts` covers REST and MCP missing `filePath` plus unchanged function-level root denial |
| Document opt-in root config | README or config reference search confirms no stale guidance | Done | `README.md`, `.env.example`, `src/mcp/tools-registry.ts`, and generated MCP reference line mention allowed-root behavior |
| Run verification and gates | Targeted vitest, relevant broader tests, Semgrep if required, Gitleaks before commit if staging occurs | Done with caveats | Targeted tests, Semgrep, Gitleaks, and diff check passed after the opened-FD follow-up fix; full `npm test`, build, and typecheck blocked by missing local dependency tools |

## Subagent Ledger

| Workstream | Agent | Allowed scope | Edits allowed | Result | Residual risk |
|---|---|---|---:|---|---|
| Validity and impact review | `019ec276-2d8c-7240-bf15-2556d45dd6de` | compress-file function, MCP/REST path, providers, tests | No | Finding valid. Source-to-sink exists from MCP/REST `filePath` to `provider.summarize()`, with arbitrary readable `.md` accepted outside any root. Also identified read-time TOCTOU and backup symlink gaps. | Runtime exploitability depends on service exposure, auth secret, provider type, and filesystem permissions. |
| Fix strategy and UX review | `019ec276-5dfd-7bd0-99a6-ebe0c4350ac2` | compress-file policy, config, MCP/REST wrappers, docs/tests | No | Recommended canonical root allowlist in `mem::compress-file`, default safe cwd root, explicit `AGENTMEMORY_COMPRESS_FILE_ROOTS`, no per-call bypass, and focused tests. | Compatibility break for users compressing arbitrary absolute Markdown paths; explicit root opt-in is the intended migration path. |
| Final security review | `019ec283-2d04-7903-8f44-684fcb690057` | current diff, security invariant, bypass risk | No | Found two valid P2 gaps: sensitive terms needed canonical-path checking, and backup writes needed parent/root revalidation before writing content. Both were fixed with regression tests. Re-check returned ACCEPT. | No unresolved security findings from final re-check. |
| Final test/compatibility review | `019ec283-48aa-7541-b86f-0c8c944c32f8` | current diff, coverage, UX compatibility, docs | No | Found valid backup-parent TOCTOU coverage/fix gap. Fixed with parent revalidation and a regression test. Re-check returned ACCEPT. | No unresolved compatibility/test findings from final re-check. |
| Prep security diff shard | `019ec405-85d3-7320-9ff5-ecbc4b6ff058` | MCP/REST boundary and supporting root-policy code | No | Found valid candidate: configured root symlink could canonicalize to `/` or home because canonical roots were not rechecked after `realpath`. Fixed by filtering canonical roots and adding a regression test. | Residual: operator can still opt into narrow real roots; allowed-root Markdown content still intentionally goes to provider. |
| Prep test shard | `019ec405-9f78-7881-81e8-7fb5919767d9` | compress-file tests and supporting source | No | Found valid candidate: outside-root paths reached `lstat()` before root denial, creating an existence/type oracle. Fixed by checking requested root containment before file `realpath()` or `lstat()`, with missing and symlink outside-root regression tests. | Deferred coverage hardening noted for exact open flags and backup post-open TOCTOU assertions; current source still uses `O_NOFOLLOW`/identity checks. |
| Prep general code review | `019ec404-2d00-7102-b391-ec40d84e5430` | current task-owned diff, compatibility, docs, targeted gates | No | Found two valid compatibility/doc issues: repeat compression failed when `.original.md` already existed, and docs described env roots as extra while implementation replaced the safe cwd root. Fixed repeat backup overwrite with no-follow identity checks and made env roots additive to safe cwd, with regression tests. | Full-suite/build/typecheck remain blocked by missing local binaries. |
| Prep Review Implementation | `019ec51c-2cb5-7ea1-8a67-d778f6260380` plus local read-only re-review | current task-owned diff before staging | No | Found a valid parent-directory swap gap: `realpath()` containment was proven before `open()`, but `O_NOFOLLOW` does not protect swapped parent directories. Fixed by revalidating source, backup, and final-write handles against current canonical root membership, opened-FD canonical targets when exposed by the runtime, and same-file identity before reading or writing content. Local re-review after the fix found no further blocking issue. | No unresolved review finding. Runtime can only use opened-FD target hardening where the OS exposes a usable fd path; the path and identity re-check remains the fallback. |

## Initial Evidence

- `git status -sb --untracked-files=all` -> clean detached worktree.
- `git worktree list --porcelain` -> current isolated worktree is detached at `21ac25ad367aca55886d2afb920383ff8ab5f1d1`.
- `src/functions/compress-file.ts` currently resolves arbitrary paths, checks only `.md` and sensitive-looking path fragments, reads via `readFile`, then sends original content to `provider.summarize()`.
- `src/mcp/server.ts` and `src/triggers/api.ts` currently only validate that `filePath` is a non-empty string before forwarding to `mem::compress-file`.

## Implementation Notes

- `mem::compress-file` now resolves relative paths from the daemon cwd, canonicalizes file and roots with `realpath`, and requires the canonical file path to be equal to or inside an allowed root before reading or calling the provider.
- Allowed roots come from `AGENTMEMORY_COMPRESS_FILE_ROOTS` or, when unset, the daemon cwd if it is not home or filesystem root. Explicit `/` and home roots are rejected as too broad.
- The original Markdown is read via `open(..., O_RDONLY | O_NOFOLLOW)`, then the opened file identity is compared with the initial `lstat` identity before provider submission.
- Backup writes now use a no-follow file handle. Final overwrite opens without `O_TRUNC`, verifies identity first, then truncates and writes.
- A post-review fix checks sensitive terms against both requested and canonical paths before reading or calling the provider.
- A post-review fix revalidates the canonical backup parent and opened backup path against allowed roots before backup content is written.
- A prep-merge security scan fix filters canonical allowed roots after `realpath(root)` so a configured root symlink to `/` or the home directory is denied.
- A prep-merge security scan fix performs raw requested-root containment before any file `realpath()` or `lstat()` so outside-root missing, symlink, non-file, and existing paths get uniform root denial.
- A prep-merge code review fix preserves repeat compression compatibility by overwriting an existing regular backup only after no-follow open, identity, and root checks; new backups still use exclusive create.
- A prep-merge code review fix makes `AGENTMEMORY_COMPRESS_FILE_ROOTS` additive to the safe daemon cwd, matching README and `.env.example`.
- A prep-merge Review Implementation fix revalidates every opened source, backup, and final-write handle against both a fresh canonical path/root check and, when available from the runtime, the opened file descriptor's canonical target before reading or writing content. This covers parent-directory swaps after the initial root proof.
- `npm run skills:gen` could not run because the local `tsx` binary is missing, so the single generated MCP reference line was updated mechanically from the registry description.
- Prep branch `prep-merge/compress-file-roots-21ac25a` was created from the detached worktree for local commit/merge preparation.
- Fix commit `8fa4f95b5a81fe978b34301e1bc218f989964dec` was created after `gitleaks protect --staged --redact --no-color` passed.
- Local `main` at `72b6ff1e78afef47f771ccb76253e29426fa317f` was merged into the prep branch with merge commit `36cbefc3e1c9de31da2b15ef98e69f0b03a2882d`. No merge into `main`, push, deploy, dependency install, or remote state change was performed.

## Final Verification Evidence

- `npx --no-install vitest run test/compress-file.test.ts test/compress-file-interfaces.test.ts test/mcp-standalone.test.ts --exclude test/integration.test.ts` -> passed, 3 files / 58 tests after prep-merge compatibility, parent-swap, and security fixes.
- Post-merge `npx --no-install vitest run test/compress-file.test.ts test/compress-file-interfaces.test.ts test/mcp-standalone.test.ts --exclude test/integration.test.ts` -> passed, 3 files / 58 tests after merging local `main` into the prep branch.
- Post-merge `semgrep scan --config p/default --error --metrics=off .` -> passed, 0 findings on tracked files.
- Post-merge `gitleaks detect --source . --redact --no-color` -> passed, no leaks found.
- Post-merge `git diff --check` -> passed.
- `npx --no-install vitest run test/compress-file.test.ts --exclude test/integration.test.ts` -> passed, 28 tests after root-symlink, outside-root oracle, repeat-backup, additive-env-root, parent-swap, and opened-FD target fixes.
- Earlier red run: `npx --no-install vitest run test/compress-file.test.ts --exclude test/integration.test.ts` -> failed 6 tests before production code changes, proving out-of-root, parent-realpath escape, read-swap, backup-symlink, and final-write-swap regressions.
- Post-review red run: `npx --no-install vitest run test/compress-file.test.ts --exclude test/integration.test.ts` -> failed 2 tests before the follow-up fix, proving canonical sensitive-name and backup-parent escape regressions.
- `semgrep scan --config p/default --error --metrics=off .` -> passed, 0 findings on tracked files.
- `semgrep scan --config p/default --error --metrics=off test/compress-file-interfaces.test.ts docs/todos/2026-06-13-compress-file-roots/plan.md docs/todos/2026-06-13-compress-file-roots/todo.md` -> passed, 0 findings on new task-owned files.
- `gitleaks detect --source . --redact --no-color` -> passed, no leaks found after the opened-FD follow-up fix.
- `git diff --check` -> passed.

## Verification Caveats

- `npm test` failed before running through the package script because `vitest` is not available as a local npm script binary.
- Equivalent full `npx --no-install vitest run --exclude test/integration.test.ts` started but the repo-wide suite failed in unrelated areas due missing local packages including `iii-sdk`, `@clack/prompts`, and `zod`, plus one hook test nonzero exit in that degraded environment. The task-owned targeted tests pass.
- `npm run build` failed because `tsdown` is not available as a local npm script binary.
- `npx --no-install tsc --noEmit` failed because the TypeScript compiler is not installed in this worktree.
