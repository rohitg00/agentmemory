# Obsidian Symlink Export Task State

Task id: `2026-06-13-obsidian-symlink-export`
Scope: current `agentmemory` worktree
Branch: `prep-merge/obsidian-symlink-export-21ac25a`
Status: implemented and verified on the local prep-merge branch; no push, deploy, or remote merge performed

## Sprint Contract

Goal: fix Security Finding 08 so Obsidian export cannot write outside `AGENTMEMORY_EXPORT_ROOT` through pre-existing symlinks under the export root.

Scope:
- `src/functions/obsidian-export.ts` path preparation and file writes.
- Obsidian export tests, including real-filesystem symlink regressions.
- This task record and plan.

Non-goals:
- No push, deploy, merge to main, publishing, dependency additions, API redesign, or broad filesystem sandbox redesign.
- No change to MCP tool count, REST endpoint count, versioning, schemas, auth, or iii-engine architecture.
- No support for symlinked export vaults; symlinked export path components are intentionally rejected.

Acceptance criteria:
- Direct `vaultDir` values outside `AGENTMEMORY_EXPORT_ROOT` still fail before filesystem writes.
- Normal exports into a real directory under `AGENTMEMORY_EXPORT_ROOT` still succeed.
- A symlinked `vaultDir` under the export root that points outside is rejected and does not write outside.
- A symlinked category subdirectory such as `vault/memories` that points outside is rejected and does not write outside.
- A final markdown-file symlink is not followed.
- Focused Obsidian export tests pass.
- Required relevant repo-native checks and security gates either pass or have recorded limitations.

Known boundaries:
- This fix tightens local filesystem behavior for Obsidian export paths only.
- The implementation should be local to `mem::obsidian-export`; REST and MCP wrappers should keep delegating to the function.
- Existing legitimate exports under the export root must remain compatible.
- A local attacker who can mutate directories concurrently may still create narrow TOCTOU races because Node does not expose a portable full `openat` directory-fd walk.

Stop conditions:
- A proposed fix requires new dependencies, API/schema/auth changes, network calls, destructive cleanup, push, deploy, or merge.
- Tests show normal non-symlink exports no longer work and the compatibility break cannot be narrowed.
- Required scanner tooling is missing, reports findings, or needs approval that is unavailable.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---:|---|
| Validate finding with two read-only subagents | Independent subagent reports | Done | `Ptolemy` valid finding report; `Maxwell` secure strategy report |
| Add symlink regression coverage | Focused Obsidian tests fail before fix, pass after fix | Done | RED: `npm test -- test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts` failed 3 symlink tests before implementation. GREEN: same command passed 20 tests after implementation. |
| Harden export path preparation | Code inspection plus focused tests | Done | `src/functions/obsidian-export.ts` now uses `path.relative` containment, realpath-confirmed root/vault handling, segment-by-segment directory creation, and symlink rejection with `lstat`. |
| Harden file writes against final symlinks | Real-filesystem regression test plus code inspection | Done | Final Markdown writes now use `open` with `O_NOFOLLOW`; final-file symlink test preserves the outside target. |
| Verify normal exports still work | Existing mocked tests and new real-filesystem normal export | Done | Normal real-vault export test and existing Obsidian formatting/export tests pass. |

## Subagent Ledger

| Workstream | Agent | Allowed scope | Edits allowed | Result | Residual risk |
|---|---|---|---:|---|---|
| Finding validity and impact | `019ec27a-9258-7603-b5c4-3c21c5b7aaf9` | Obsidian export function, MCP/REST callers, current tests | No | Valid. Lexical root check is bypassable when existing symlinks under the export root redirect `mkdir` or `writeFile` outside the root. | No live PoC was run by the read-only agent. |
| Secure fix strategy and regressions | `019ec27a-a84c-74e1-9164-e677a4e688b4` | Obsidian export function and tests | No | Recommend function-boundary hardening: lexical precheck, realpath-confirmed root, reject symlinked path components, create directories segment by segment, and use no-follow final-file writes. | TOCTOU and hard-link risks remain out of scope without OS-specific directory-fd APIs or private-owned tree policy. |
| Final security review | `019ec2ab-f2b5-7263-9edf-1753af2a8854` | Current diff for Obsidian export fix | No | ACCEPT. No blocking security findings; noted residual TOCTOU and hard-link risks. | Did not run tests or scanners; main agent ran them. |
| Final test coverage review | `019ec2ac-0a65-73b1-9eed-7837ce8adaeb` | Current diff tests and implementation | No | ACCEPT. Real-filesystem tests cover normal export, vault symlink escape, subdir symlink escape, and final-file symlink. | New test file must be included in final patch. |
| Final maintainability review | `019ec2ad-43d3-71f3-a8d6-314bb290cf37` | Current diff and task state | No | Found stale task state. Fixed in this task-state update. | Runtime checks were run by main agent, not reviewer. |
| Prep focused code review | `019ec532-186d-7472-87bd-4de90d83e90e` | Current task-owned prep-merge diff | No | ACCEPT. No critical or important findings. | Did not rerun tests or scanners. |
| Prep Review Implementation - breaker | `019ec53d-9104-76d3-b099-1fe5d201745d` | Current task-owned prep-merge diff | No | NO FINDINGS. | Did not rerun tests or scanners. |
| Prep Review Implementation - test-gap | `019ec541-901f-7270-bcc9-244371a2d939` | Current task-owned prep-merge diff | No | Found important test weakness: outside symlink target tree was not fully asserted untouched. Fixed by asserting empty outside dirs and final-file blocked-write stats/errors. | Requires rerun after fix. |
| Prep Review Implementation - boundary | `019ec545-3c0f-7360-bd8e-8b559a34e291` | Current task-owned prep-merge diff | No | NO FINDINGS on filesystem boundary. | Reviewed pre-test-strengthening diff; production code unchanged by later fix. |
| Prep Review Implementation - test-gap rerun | `019ec55c-f8d2-75f1-8fe9-feec2205ff85` | Updated staged task-owned prep-merge diff | No | NO FINDINGS. Confirmed the previous important test gap is closed. | Did not rerun tests; main agent reran focused tests. |
| Prep Review Implementation - boundary/breaker rerun | `019ec561-159a-7fb1-83f7-38df835c6878` | Updated staged task-owned prep-merge diff | No | No critical or important production findings. One minor plan snapshot ambiguity was fixed by clarifying that plan checkboxes are original-plan snapshot entries. | Did not rerun tests or scanners. |
| Codex Security diff scan | local scan artifacts | Diff-scoped production source row | No | No reportable findings. Discovery reviewed `src/functions/obsidian-export.ts`, closed 1 of 1 worklist rows, and produced validated markdown/HTML reports. | Validation and attack-path phases were skipped because discovery produced no candidates. |

## Initial Evidence

- `git status -sb --untracked-files=all` -> clean detached worktree at `21ac25ad367aca55886d2afb920383ff8ab5f1d1`.
- `.github/security-advisories/05-obsidian-export-traversal.md` documents the known limitation: `resolveVaultDir()` performs lexical containment only and does not call `realpath` or `lstat`.
- `src/functions/obsidian-export.ts` imports `mkdir` and `writeFile`, validates `vaultDir` with lexical `startsWith`, creates category directories recursively, then writes exported Markdown files with `writeFile`.
- `test/obsidian-export.test.ts` mocks `node:fs/promises`, so existing tests cannot exercise real symlink behavior.

## Progress Notes

- Consensus gate completed before edits: both read-only subagents agree the finding is valid and the fix should harden the `mem::obsidian-export` boundary.
- TDD RED completed: the new symlink tests failed against the original implementation because symlinked vault and category paths were accepted and a final symlink target was overwritten.
- Implementation keeps REST and MCP wrappers unchanged and enforces the filesystem boundary inside `mem::obsidian-export`.
- Symlinked export vaults and symlinked export subdirectories are intentionally unsupported, including symlinks that point back under the export root.
- Prep-merge `simple-code` pass made no production-code simplification; it only corrected stale task-state text after the branch was created.
- Prep Review Implementation found one important test gap. The symlink tests now assert outside target directories remain empty, and the final markdown-file symlink case asserts the blocked record is not counted as exported and is reported in `errors`.
- Prep Review Implementation rerun found no remaining critical or important issues. A minor plan-tracking ambiguity was resolved by marking `plan.md` as an original implementation-plan snapshot and leaving final progress in this task state.
- Codex Security diff scan artifact directory: `/tmp/codex-security-scans/agentmemory/21ac25ad367a_20260614T091017Z_obsidian_symlink_diff`. Reports: `report.md` and `report.html`.

## Final Verification Evidence

- `npm test -- test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts` before implementation -> failed 3 of 20 tests as expected: symlinked `vaultDir`, symlinked `memories` subdirectory, and final markdown-file symlink.
- `npm test -- test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts` after implementation -> passed, 2 files / 20 tests.
- `npm test` -> passed, 135 files / 1449 tests.
- `npm run build` -> passed with existing tsdown deprecation/plugin-timing and ineffective dynamic import warnings.
- `semgrep scan --config p/default --error --metrics=off .` after staging intended files -> passed, 0 findings. Semgrep still reported the same tracked-file count, so a touched-file scan was also run.
- `semgrep scan --config p/default --error --metrics=off src/functions/obsidian-export.ts test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts` -> passed, 0 findings across the touched source and test files.
- `gitleaks detect --source . --redact` -> passed, no leaks.
- `gitleaks protect --staged --redact` -> passed, no leaks.
- `git diff --check --cached` -> passed, no whitespace errors.
- Prep rerun after test-strengthening fix: `npm test -- test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts` -> passed, 2 files / 20 tests.
- Prep Codex Security diff scan -> passed with no findings. `validate_report_format.py` accepted `report.md`, and `render_report_html.py` generated `report.html`.
- Final pre-commit focused tests: `npm test -- test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts` -> passed, 2 files / 20 tests.
- Final pre-commit suite: `npm test` -> passed, 135 files / 1449 tests.
- Final pre-commit build: `npm run build` -> passed with existing tsdown deprecation/plugin-timing and ineffective dynamic import warnings.
- Final pre-commit Semgrep: `semgrep scan --config p/default --error --metrics=off .` -> passed, 0 findings; `semgrep scan --config p/default --error --metrics=off src/functions/obsidian-export.ts test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts` -> passed, 0 findings.
- Final pre-commit Gitleaks: `gitleaks detect --source . --redact` -> passed, no leaks; `gitleaks protect --staged --redact` -> passed, no leaks.
- Final pre-commit index checks: `git diff --check --cached` -> passed; staged paths remained limited to this task's five files.

## Residual Risks

- A concurrent local attacker who can mutate the export tree during an export may still have narrow TOCTOU opportunities because Node does not expose a portable full `openat` directory-fd walk.
- `O_NOFOLLOW` prevents final symlink following but does not address hard-link policy. Hard-link restrictions would require a broader ownership/private-tree design outside this finding.
- `node_modules/` and an ignored `package-lock.json` were generated locally to run the repo's CI-style test commands in this isolated worktree; they are ignored and were not staged.
- Ignored build artifacts from `npm run build` remain local and unstaged: `dist/`, plugin script `.d.mts`/`.mjs.map` outputs, and `integrations/hermes/__pycache__/`.
