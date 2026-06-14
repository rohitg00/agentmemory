# Compress File Root Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent `memory_compress_file` from reading or sending Markdown outside trusted local roots while preserving normal project-local compression.

**Architecture:** Enforce the security invariant in `mem::compress-file`, because every MCP and REST call funnels through that function. Resolve the requested file and allowed roots to canonical paths before any provider call, read through a no-follow file descriptor with identity checks, and write backups/original files through no-follow handles. Keep MCP and REST as shape-validation wrappers.

**Tech Stack:** TypeScript ESM, Node `fs/promises` file handles, Vitest with existing `iii-sdk` style mocks, no new dependencies.

---

## Source Of Truth

Spec path: none. The source of truth is the delegated user request plus the task record in `docs/todos/2026-06-13-compress-file-roots/todo.md`.

## File Structure

- Modify `src/functions/compress-file.ts`: root policy, safe open/read/write helpers, optional test/config options, and audit path behavior.
- Modify `test/compress-file.test.ts`: TDD regression tests for allowlist, denial, sensitive paths, symlink and TOCTOU safety, backup safety, and interface delegation helpers.
- Modify `src/mcp/server.ts` only if wrapper validation must be tightened beyond current non-empty-string checks.
- Modify `src/triggers/api.ts` only if wrapper validation must be tightened beyond current non-empty-string checks.
- Modify `README.md` or `.env.example` only to document `AGENTMEMORY_COMPRESS_FILE_ROOTS` if the implementation introduces it.

## Implementation Tasks

### Task 1: Add failing function-level root-boundary tests

**Files:**
- Modify: `test/compress-file.test.ts`

- [x] Add a helper in the test file to register `mem::compress-file` with an explicit allowed root such as `/workspace/project`.
- [x] Convert current success/symlink tests from `/tmp/*.md` to allowed-root paths.
- [x] Add a failing test: `/outside/notes.md` is rejected, `provider.summarize()` is not called, and no backup or overwrite occurs.
- [x] Add a failing prefix-trap test: `/workspace/project-evil/notes.md` is rejected when `/workspace/project` is the only allowed root.
- [x] Add a failing in-root sensitive-path test: `/workspace/project/token-notes.md` is rejected before provider use.
- [x] Run `npx --no-install vitest run test/compress-file.test.ts --exclude test/integration.test.ts` and confirm the new root-boundary tests fail for the expected missing policy.

### Task 2: Implement minimal root allowlist policy

**Files:**
- Modify: `src/functions/compress-file.ts`
- Modify: `test/compress-file.test.ts`

- [x] Add `AGENTMEMORY_COMPRESS_FILE_ROOTS` parsing as a comma-separated list.
- [x] Add an optional `CompressFileOptions` parameter to `registerCompressFileFunction` so tests can inject `allowedRoots` and `cwd` without relying on the developer machine environment.
- [x] Resolve relative `filePath` values from the effective cwd.
- [x] Build allowed roots from explicit options/env roots or from the safe default cwd.
- [x] Reject `/` and default home-directory cwd as unsafe roots; instruct users to set `AGENTMEMORY_COMPRESS_FILE_ROOTS` to narrower directories.
- [x] Canonicalize file path and roots with `realpath`, then require equality with or containment under one allowed root using `relative()`.
- [x] Return an actionable generic error such as `filePath must be inside an allowed compress-file root; set AGENTMEMORY_COMPRESS_FILE_ROOTS to opt in additional directories`.
- [x] Rerun `npx --no-install vitest run test/compress-file.test.ts --exclude test/integration.test.ts` and confirm Task 1 tests pass.

### Task 3: Add and fix read/write/backup safety regressions

**Files:**
- Modify: `src/functions/compress-file.ts`
- Modify: `test/compress-file.test.ts`

- [x] Add failing tests for parent-symlink escape by mocking `realpath("/workspace/project/link/notes.md")` to `/outside/notes.md`.
- [x] Add failing tests for read-time file swap by making the `lstat` identity differ from the read handle `stat()` identity; assert provider is not called.
- [x] Add failing tests for parent-directory swaps after root validation but before source read, backup write, and final compressed write; assert provider/content writes are blocked before outside-root content is used.
- [x] Add failing tests for backup-path symlink rejection; assert the original file is not overwritten after backup open fails.
- [x] Add failing tests for write-time file swap by making the final write handle identity differ from the original read identity; assert the wrong file is not truncated.
- [x] Replace `readFile(absolutePath)` with `open(absolutePath, O_RDONLY | O_NOFOLLOW)`, `handle.stat()`, identity comparison, and `handle.readFile("utf-8")`.
- [x] Replace backup `writeFile()` with a no-follow open/write helper that returns a symlink error on `ELOOP` or unsupported `O_NOFOLLOW`.
- [x] Replace final write `O_TRUNC` open with no-follow open, identity check before truncation, `truncate(0)`, then `writeFile(compressed, "utf-8")`.
- [x] Revalidate every opened handle against a fresh canonical path/root check and same-file identity before reading or writing content.
- [x] Rerun `npx --no-install vitest run test/compress-file.test.ts --exclude test/integration.test.ts`.

### Task 4: Add MCP and REST boundary coverage

**Files:**
- Modify: `test/compress-file.test.ts` or add focused tests next to existing MCP/API tests if local harnesses are more suitable.
- Modify: `src/mcp/server.ts` and `src/triggers/api.ts` only if tests expose missing wrapper validation beyond shape checks.

- [x] Add a REST endpoint test by registering `registerApiTriggers()` and a stub `mem::compress-file`; verify empty `filePath` returns 400 and denied paths are returned in the response body without wrapper mutation.
- [x] Add an MCP handler test if a direct harness exists; otherwise document in the task notes that wrapper-level code only trims and forwards and function-level tests cover the security invariant.
- [x] Run the targeted API/MCP test file selected in this task.

### Task 5: Document the opt-in boundary

**Files:**
- Modify: `README.md` and `.env.example` only if `AGENTMEMORY_COMPRESS_FILE_ROOTS` is not already discoverable elsewhere.

- [x] Add one concise config entry explaining that `memory_compress_file` defaults to the daemon cwd when safe and additional roots require `AGENTMEMORY_COMPRESS_FILE_ROOTS=/path/one,/path/two`.
- [x] State that roots should be narrow project or notes directories, not home or `/`.
- [x] Search for `memory_compress_file` and `AGENTMEMORY_COMPRESS_FILE_ROOTS` to ensure guidance is not conflicting.

### Task 6: Simplification pass and final verification

**Files:**
- Review all touched files.

- [x] Remove duplicated test setup or helper branching introduced during the fix.
- [x] Run `npx --no-install vitest run test/compress-file.test.ts test/api-memories-project.test.ts test/mcp-standalone.test.ts --exclude test/integration.test.ts` if the selected wrapper tests live there.
- [x] Run `npm test` if targeted tests pass and runtime cost is acceptable in this worktree.
- [x] Run `semgrep scan --config p/default --error --metrics=off .` because this is a non-trivial security-boundary change.
- [x] If files are staged or a commit is created, run `gitleaks protect --staged --redact` before committing.
- [x] Update `docs/todos/2026-06-13-compress-file-roots/todo.md` with final evidence, caveats, and any residual risk.

## Review Notes

- The two read-only subagents reached consensus that the finding is valid and should be fixed.
- The user explicitly withheld push, deploy, merge, and new dependency authorization.
- No implementation subagent is planned for the first code edits because the immediate blocking step is TDD in a small, tightly coupled file. Final read-only review may be delegated if verification exposes a meaningful risk.

## Final Verification Notes

- Targeted command actually run after prep-merge fixes: `npx --no-install vitest run test/compress-file.test.ts test/compress-file-interfaces.test.ts test/mcp-standalone.test.ts --exclude test/integration.test.ts` -> passed, 55 tests.
- Final review found canonical sensitive-name and backup-parent TOCTOU gaps; both were fixed with red-green regression coverage.
- Prep-merge security review found canonical-root symlink-to-unsafe-root and outside-root existence/type oracle gaps; both were fixed with regression coverage.
- Prep-merge code review found repeat-backup compatibility and env-root documentation/behavior mismatch gaps; both were fixed with regression coverage.
- Prep-merge Review Implementation found a parent-directory swap gap after initial root validation; it was fixed with post-open path and opened-FD canonical root checks plus identity checks and regression coverage.
- Latest targeted command: `npx --no-install vitest run test/compress-file.test.ts test/compress-file-interfaces.test.ts test/mcp-standalone.test.ts --exclude test/integration.test.ts` -> passed, 58 tests.
- Post-merge targeted command after merging local `main` into the prep branch: `npx --no-install vitest run test/compress-file.test.ts test/compress-file-interfaces.test.ts test/mcp-standalone.test.ts --exclude test/integration.test.ts` -> passed, 58 tests.
- Post-merge `semgrep scan --config p/default --error --metrics=off .`, `gitleaks detect --source . --redact --no-color`, and `git diff --check` all passed.
- `npm test` and `npm run build` were attempted but blocked by missing local npm script binaries (`vitest`, `tsdown`).
- `npx --no-install vitest run --exclude test/integration.test.ts` was attempted as an equivalent full-suite fallback but unrelated suites failed because local packages such as `iii-sdk`, `@clack/prompts`, and `zod` are missing.
- `npx --no-install tsc --noEmit` was attempted but TypeScript is not installed in this worktree.
- `semgrep scan --config p/default --error --metrics=off .` and a direct scan of the new untracked task-owned files both passed with 0 findings after the opened-FD follow-up fix.
- `gitleaks detect --source . --redact --no-color` passed with no leaks after the opened-FD follow-up fix. Staged Gitleaks remains required immediately before any commit.
