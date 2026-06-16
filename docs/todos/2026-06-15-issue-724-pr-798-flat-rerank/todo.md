# Issue 724 / PR 798 flat rerank review

Scope: review Issue 724 and PR 798 against the local fork, decide whether to import/adapt/reject/defer/already-fix, implement only the minimal task-owned change if needed, verify, and run prep-merge-to-local-main.

## Sprint Contract

Goal: determine whether flat cross-encoder rerank scores still break local hybrid search ranking, and preserve useful retrieval ordering if the issue is relevant.

Scope:
- Inspect local reranker and hybrid-search code paths.
- Inspect PR 798 as untrusted upstream input through public read evidence.
- Add or adjust targeted tests for the rerank fallback/flat-score behavior if code changes are needed.
- Document a neutral local outcome with no GitHub URLs, no hash-issue references, and no mentions.
- Run required focused verification and security gates as far as available.
- Run prep-merge-to-local-main before handoff.

Non-goals:
- No GitHub writes, pushes, pull requests, tracker comments, or labels.
- No dependency changes or reranker model replacement.
- No broader retrieval refactor or API/schema/persistence changes.

Acceptance criteria:
- Issue-first relevance is recorded from local code evidence.
- PR 798 is inspected as untrusted input and disposition is recorded.
- If implemented, the diff is minimal and task-owned.
- Tests cover the flat rerank score behavior or the no-op decision is justified.
- Security review covers auth/isolation, data exposure, file/path access, protocol/schema, LLM/tool flows, DoS/performance, supply chain, hooks/tooling, and persistence as applicable.
- Prep merge to local main is attempted and the result is recorded.

Intended verification:
- Targeted Vitest for reranker behavior.
- `git diff --check`.
- Security gates required by local policy for code changes where available: Semgrep, OSV if dependency surfaces changed, Gitleaks before commit.
- Prep-merge post-merge verification as required by the skill.

Known boundaries:
- Public upstream reads are allowed; credentialed GitHub API or logged-in browser reads require current-turn approval and are not planned.
- No remote writes are authorized.
- Local main is the integration target; no fetch/pull during prep-merge unless separately approved.

Stop conditions:
- Required current-turn approval boundary is reached.
- Untrusted PR diff crosses external API/security/persistence boundaries beyond the minimal retrieval-score fix.
- Required review/security tooling is unavailable and the workflow says it blocks.
- Merge/prep finds Git operation state or unresolved conflicts that cannot be resolved from evidence.

## Feature / Verification Matrix

| Change or decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first relevance | Inspect local reranker and hybrid-search paths; reproduce flat scores in a targeted test if needed | complete | Local `src/state/reranker.ts` used text-classification output score as `combinedScore`; targeted test covers constant score preservation. |
| PR 798 disposition | Public diff inspection; compare against local fork code | complete | PR 798 inspected as untrusted public diff; decision is adapted import. |
| Minimal implementation, if needed | Focused diff review and targeted tests | complete | Changed `src/state/reranker.ts`, `src/types.ts`, and `test/reranker.test.ts` only. |
| Security review | Passive security review plus required local scan gates where applicable | complete | Manual review, Semgrep, and staged Gitleaks complete; OSV not applicable. |
| Prep merge | Run prep-merge-to-local-main workflow | complete | Local main commit was already an ancestor of the branch after task commit; merge step was a no-op. |

## Progress

- Created target branch `review/issue-724-pr-798-flat-rerank-scores` from local main commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1`.
- Coordinator row read: PR 798 / Issue 724 / Fork issue 457 is pending/candidate.
- Issue-first relevance: still relevant in local fork. Local reranker overwrote retrieval `combinedScore` with the pipeline score, and constant scores would erase the meaningful BM25/vector/graph retrieval score exposed to downstream smart-search consumers.
- PR 798 disposition: adapted import. Kept the minimal flat-score guard and optional `rerankScore`, but retained a focused local test structure that separately exercises unavailable, constant-score, and discriminative-score module states.
- Implementation: constant reranker scores now keep original candidate order and `combinedScore`; discriminative reranker scores can reorder candidates while preserving the original retrieval score and exposing `rerankScore`.
- Verification:
  - `git diff --check`: pass.
  - Targeted Vitest via main checkout dependency host: 1 file passed, 7 tests passed.
  - `tsc --noEmit`: attempted, but not a valid verification in this worktree because dependencies are not installed locally and module/type resolution fails broadly before isolating this diff.
  - Targeted ESLint via main checkout dependency host: attempted, but files were ignored as outside that checkout base path; not counted as verification.
  - Semgrep default registry scan: pass, 0 findings.
  - Staged Gitleaks before task commit: pass, no leaks found.
- Commit:
  - Task commit `432f7969bbd0e1a6b3992bed86a45f3e6b1a7492` created with only task-owned files.
- Prep merge:
  - Local main commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` was already an ancestor of `HEAD` after the task commit.
  - Merge command skipped as no-op; no conflicts and no preserved unrelated dirty paths.

## Review Notes

- Security review:
  - Auth/authorization/tenancy/isolation: no auth, tenant, project, or agent filtering logic changed.
  - Data exposure: no new logging, serialization, network output, or stored data path. `rerankScore` is optional in the in-memory/search result type; compact smart-search output still returns the retrieval `score` from `combinedScore`.
  - Path/file access: no filesystem paths or file IO changed.
  - Protocol/schema/API: no REST or MCP schema/handler changed. Type surface gains optional `rerankScore` on `HybridSearchResult`.
  - Prompt/LLM/model flow: model input text construction remains unchanged and capped at 512 chars; change only interprets model output and avoids clobbering retrieval score on flat output.
  - DoS/performance: no additional model calls, loops, downloads, or larger rerank window. Added an O(n) distinct-score check over the existing rerank candidates.
  - Supply chain/hooks/tooling/persistence: no dependency, hook, tooling config, or persistence changes.
  - OSV skipped: no dependency, lockfile, container, vendored, or package-manager surface changed.
- Review gates:
  - `$simple-code`: performed manually on task-owned diff; only formatting cleanup in `test/reranker.test.ts`.
  - `$requesting-code-review`: subagent dispatch not run because available subagent tooling requires an explicit user request for subagents; local focused review performed instead.
  - `$review-implementation`: local adversarial review performed on the same task-owned diff; no blocking findings.
  - `codex-security:security-diff-scan`: skipped because the diff does not touch auth, secrets, dependencies, CI, package-manager/tool config, API contracts, networking, subprocesses, filesystem access, parsers/deserializers, persistence, or protocol handling. Manual security review and Semgrep cover the changed model-scoring path.
- Final residual risks:
  - The adapted fix does not change the underlying model/pipeline choice; it prevents flat scores from clobbering retrieval scores but does not make the cross-encoder more discriminative.
  - Full `npm test` was not run in this worktree because dependencies are not installed locally. Targeted Vitest ran through the main checkout dependency host.

## Corrected Merge-Readiness Run - 2026-06-16

- Worktree: `/Users/A1538552/.codex/worktrees/1f91/agentmemory`.
- Branch: `review/issue-724-pr-798-flat-rerank-scores`; worktree started detached at `ee34f6d4bd15435ce4e459450378823340c4d09a`, and the target branch was unattached elsewhere, so the worktree was switched onto the branch.
- Local main integrated: `d4393d1ab5dd284edee3a17bfbf45825f239c07e`.
- Merge status: first merge attempt was blocked by sandbox permissions on the worktree Git metadata lock; rerunning the same captured-SHA merge with escalation created merge commit `b5f322af8fe1e27b49a659740d2ab42608191cfe` with no conflicts.
- Dependency setup: `HOME=/tmp/agentmemory-merge-test-issue724-home XDG_CONFIG_HOME=/tmp/agentmemory-merge-test-issue724-xdg NPM_CONFIG_USERCONFIG=/tmp/agentmemory-merge-test-issue724-npmrc PNPM_HOME=/tmp/agentmemory-merge-test-issue724-pnpm-home corepack pnpm install --frozen-lockfile --ignore-scripts --store-dir /tmp/agentmemory-merge-test-pnpm-store` exited 0 using pnpm 11.6.0. It reported a non-fatal missing `dist/cli.mjs` bin warning for `packages/mcp`.
- Full test before post-merge fix: `corepack pnpm test` failed with 2 failures: `test/context-injection.test.ts` disabled hook wall-clock assertion took 2465ms, and `test/retention.test.ts` dry-run eviction timed out at 10000ms.
- Diagnostic subagents:
  - Context-injection failure classified as a brittle wall-clock timing assertion under full-suite load; isolated subprocess and focused Vitest runs passed, and the hook still returns before stdin/fetch when context injection is disabled.
  - Retention failure classified as brittle runtime/import slowness; `mem::retention-evict` imported `image-refs` before the dry-run return, which pulled in a slow cold `iii-sdk` dependency even though dry-run never deletes images.
- Post-merge fix:
  - `src/functions/retention.ts`: defer the `image-refs` import until an actual evicted memory has `imageRef`.
  - `test/context-injection.test.ts`: replace the absolute `<1000ms` disabled-hook assertion with a behavioral test that leaves stdin open and fails only if the hook waits for stdin.
- Review gates for post-merge fix:
  - Passive security review: no auth, tenant, protocol, network, parser, filesystem, dependency, or persistence boundary broadened; retention delete semantics preserved.
  - `$simple-code`: focused pass kept the diff to the import placement and subprocess helper cleanup.
  - `$requesting-code-review`: read-only reviewer returned `ACCEPT`, no findings.
  - `$review-implementation`: read-only adversarial reviewer returned `NO FINDINGS`.
  - `codex-security:security-diff-scan`: not run as a full artifact-producing scan; planned coverage is targeted Semgrep plus staged Gitleaks because the patch only defers a module import and tightens a test assertion.
- Targeted verification after post-merge fix:
  - `git diff --check -- src/functions/retention.ts test/context-injection.test.ts`: pass.
  - `corepack pnpm vitest run test/retention.test.ts --reporter verbose`: 1 file passed, 15 tests passed.
  - `corepack pnpm vitest run test/context-injection.test.ts --reporter verbose`: 1 file passed, 5 tests passed.
- Security and final verification after post-merge fix:
  - `semgrep scan --config p/default --error --metrics=off src/functions/retention.ts test/context-injection.test.ts`: pass, 0 findings.
  - `gitleaks protect --staged --redact`: pass, no leaks found before post-merge-fix commit.
  - Post-merge fix commit: `13b00161f7f8ff533c77df444a360828171eb079`.
  - Prep-merge rerun after fix: captured local main `d4393d1ab5dd284edee3a17bfbf45825f239c07e` was already up to date after sandbox-escalated no-op merge command.
  - Repeat dependency setup: requested frozen pnpm install exited 0 and was already up to date.
  - Repeat full test: `corepack pnpm test` passed, 158 files and 1989 tests.
