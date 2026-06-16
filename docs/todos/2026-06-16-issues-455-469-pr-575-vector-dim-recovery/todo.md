# Vector Dimension Recovery Review Todo

Scope: Issue 455, Issue 469, PR 575, Fork issue 577.

Working branch: `review/issues-455-469-pr-575-vector-dim-recovery`

## Sprint Contract

Goal: Decide whether the current fork needs PR 575's vector-index dimension recovery behavior for stale persisted vectors after embedding provider changes, and import only a minimal adapted fix if needed.

Scope:
- Review Issue 455 and Issue 469 behavior first.
- Inspect local vector, embedding, boot, and index persistence paths.
- Inspect PR 575 as untrusted input through public read-only evidence.
- Add or update focused tests only if the issue is still locally relevant.
- Document the neutral decision locally with identifiers `Issue 455`, `Issue 469`, `PR 575`, and `Fork issue 577`.

Non-goals:
- No GitHub writes, pushes, PR creation, labels, tracker comments, or logged-in browser reads.
- No dependency, schema, API, auth, route, or storage-boundary changes unless current repo evidence proves they are required and the user explicitly approves any boundary expansion.
- No broad vector-index rewrite or data migration.

Acceptance criteria:
- Both issues have a documented relevance decision for current fork/main.
- PR 575 has an import/adapt/reject/defer/already-fixed/blocked decision with reasoning.
- Persistence-sensitive risks are checked: data loss, automatic deletion or rebuilds, dimension validation, malformed data, one-shot flags, and startup failure modes.
- Targeted verification is run or limitations are recorded.
- `prep-merge-to-local-main` is executed at the end, or a no-op/skip is documented according to that skill.

Intended verification:
- Targeted Vitest around vector index dimension restore/boot behavior when code changes are made.
- `git diff --check`.
- Security gates required by touched surface where available.
- Final merge-prep verification from `prep-merge-to-local-main`.

Known boundaries:
- Public GitHub reads are allowed; credentialed `gh api`, logged-in browser/cookie reads, and all GitHub writes are not approved.
- Vector-index recovery is persistence-sensitive; do not delete persisted index data automatically without explicit, narrow proof and tests.
- Preserve unrelated worktrees and unrelated dirty paths.

Stop conditions:
- A proposed fix requires destructive storage cleanup, schema migration, dependency change, remote write, or broader system-boundary behavior.
- Review Implementation or security scan reports unresolved high-impact findings.
- Required local security gates are unavailable or fail and cannot be resolved without user acceptance.

## Feature / Verification Matrix

| Change or decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue 455 relevance | Public issue evidence plus local vector/boot path inspection | Passed | Still relevant: current startup refuses mismatched persisted vectors without the drop-stale flag, and before this task the flag did not persist a cleared vector snapshot immediately. |
| Issue 469 relevance | Public issue evidence plus local vector/boot path inspection | Passed | Partially already fixed locally: `isDropStaleIndexEnabled()` reads merged env, so `.env` is honored. Remaining one-shot recovery and clearer path guidance were still relevant. |
| PR 575 decision | Public PR diff inspection and local fit review | Passed | Adapted import. Kept resolved path guidance and one-shot empty-vector persistence; added shell quoting for the generated recovery command because the raw PR command was unsafe for paths with spaces or quotes. |
| Minimal local implementation if needed | Red/green targeted test and focused code diff | Passed | RED: new test failed because `src/boot/vector-dim-recovery.ts` did not exist. GREEN: targeted recovery suite passed 3/3 after helper and startup call were added. |
| Security review | Manual persistence/security checklist plus required scanner gates for code changes | Passed | Manual review complete. Security diff scan completed with no reportable findings; all six review-input paths have work-ledger receipts. |
| Neutral local documentation | Task record and coordinator list when safely writable | Passed | Task record and coordinator list updated without GitHub URLs, hash issue syntax, or mentions. |
| Merge prep | `prep-merge-to-local-main` workflow | Passed | Commit `d3edd46` created for the adapted import. Local `main` commit `6c387b4` is already an ancestor of the branch, so merge was a no-op. |

## Progress

- 2026-06-16: Created branch from detached clean worktree at `6c387b4`.
- 2026-06-16: Read repo instructions, README excerpt, package scripts, CI config, coordinator row, and embedding-related prior task notes.
- 2026-06-16: Public read-only issue evidence shows both issues report startup refusal after a 2048D-to-384D provider change. Issue 469 specifically claimed `.env` drop-stale was not honored early enough.
- 2026-06-16: Current fork already reads `AGENTMEMORY_DROP_STALE_INDEX` through merged env and preserves source memories/observations. It still did not make drop-stale one-shot if no later vector write occurred.
- 2026-06-16: PR 575 diff changes `src/config.ts` and `src/index.ts`: resolved path export, expanded error text, and immediate `indexPersistence.save()` after drop-stale. Public review noted the raw env path should be shell-quoted.
- 2026-06-16: Adapted implementation added `src/boot/vector-dim-recovery.ts`, exports `RESOLVED_PATHS` from config, and routes startup vector mismatch handling through the helper.
- 2026-06-16: Verification so far:
  - RED: `vitest run --config /Users/A1538552/_projects/_tools/agentmemory/vitest.config.ts --root /Users/A1538552/.codex/worktrees/f13e/agentmemory --exclude test/integration.test.ts test/vector-dim-recovery.test.ts` failed because `../src/boot/vector-dim-recovery.js` did not exist.
  - GREEN: same targeted recovery suite passed 3/3.
  - RED: after the first green pass, a stricter pre-populated target-index test failed because explicit drop-stale did not clear the target vector before saving.
  - GREEN: after adding `targetVector.clear()` to the recovery helper, the targeted recovery suite passed 3/3 again.
  - Targeted adjacent suites passed 44/44 across `test/vector-dim-recovery.test.ts`, `test/vector-index-dimensions.test.ts`, `test/index-persistence.test.ts`, and `test/env-loader.test.ts`.
  - `git diff --check` passed.
  - `semgrep scan --config p/default --error --metrics=off .` passed with zero findings on tracked files.
  - `semgrep scan --config p/default --error --metrics=off src/boot/vector-dim-recovery.ts test/vector-dim-recovery.test.ts` passed with zero findings on new files.
  - Broad non-integration Vitest from the isolated worktree was attempted through the main checkout's Vitest binary. It ran 159 test files with 137 passing, but failed 22 files because ESM imports from the worktree could not resolve packages such as `iii-sdk` and `@clack/prompts` without local `node_modules`.
  - `tsc --noEmit` from the isolated worktree was not usable because this worktree has no `node_modules`; errors were dominated by missing Node and package types. Targeted Vitest was run through the main checkout's installed dependencies.
  - ESLint direct attempts hit the same isolated-worktree dependency/base-path limitation and did not lint the files.
  - Security diff scan artifacts were written under `/tmp/codex-security-scans/agentmemory/6c387b4_20260616T020900Z`; discovery produced no candidates, so validation and attack-path analysis were not applicable.
- 2026-06-16: Coordinator list row for PR 575 was updated from pending/candidate to reviewed/adapted import. The coordinator worktree had pre-existing unrelated dirty/untracked task files; only the PR 575 row was changed for this task.

## Review Notes

- Prior local task `2026-06-13-remote-embedding-opt-in` records that implicit local embeddings could trigger existing persisted vector-index dimension guard failures. This task must determine whether current main already has safe startup recovery or still fails.
- Security review:
  - Auth/isolation: unchanged. The startup path does not alter request auth, MCP auth, agent isolation, or tenant scope.
  - Data loss: the change only persists the in-memory empty vector index when `AGENTMEMORY_DROP_STALE_INDEX=true` is explicitly enabled. It does not delete `KV.memories`, sessions, observations, BM25 data, or graph data. Persisted vectors are derived cache data and are rebuilt by future live writes or rebuild paths.
  - Path/filesystem: new path output uses `homedir()`-resolved existing config paths and shell-quotes the env file path in the suggested command. It does not read additional files beyond the existing env-file existence check.
  - Protocol/schema: no REST, MCP, export, import, schema, or audit operation changes.
  - Prompt/LLM flows: unchanged.
	  - DoS/performance: the added save runs only on explicit drop-stale recovery and writes an empty vector snapshot through existing sharded persistence. If persistence save fails, startup continues with a warning, matching PR 575's one-shot best-effort recovery intent without blocking on non-critical cache cleanup.
	  - Supply chain, hooks, tooling: no dependency, package-manager, hook, or CI changes.
- Implementation review:
  - Simple-Code pass removed no unrelated behavior and tightened the helper so explicit drop-stale clears any existing target index before persisting the empty snapshot.
  - Local review-implementation pass found no blocking correctness issue after the stricter target-index test was added.
  - Subagent-backed review was not used because the available subagent tool is restricted to explicit user requests for subagents; deterministic local tests and manual review covered the touched surface.
- Merge prep:
  - Staged task-owned files only and ran `gitleaks protect --staged --redact`; no leaks found.
  - Created commit `d3edd46` with the adapted implementation and task documentation.
  - Pre-merge branch review found the branch diff limited to the six task-owned files.
  - Local `main` was clean at `6c387b4`; that commit is already an ancestor of the branch, so the merge step was a no-op and no conflicts were possible.
  - Post-merge checks passed: `git diff --check HEAD` and the targeted adjacent Vitest suites passed 44/44.
