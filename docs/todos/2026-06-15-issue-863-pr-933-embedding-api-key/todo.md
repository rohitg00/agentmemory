# Issue 863 / PR 933 Review

Scope: `review/issue-863-pr-933-embedding-api-key` in the agentmemory worktree.

## Sprint Contract

Goal: decide whether PR 933 should be imported for Issue 863 and, if still relevant, apply only the minimal local fix.

Scope:
- Issue 863: OpenAI embedding provider key precedence.
- PR 933: provider factory and related docs/config hints.
- Local code paths under `src/providers/embedding/`, `src/config.ts`, `src/cli.ts`, `README.md`, `.env.example`, and focused tests.

Non-goals:
- No GitHub writes, labels, comments, PR creation, pushes, deploys, migrations, or dependency changes.
- No unrelated embedding-provider refactors.
- No remote-main synchronization claims.

Acceptance criteria:
- Current fork behavior is evaluated issue-first.
- PR 933 diff is inspected as untrusted input.
- Any imported/adapted change is minimal and covered by a targeted regression test.
- Security-sensitive surfaces are reviewed: secret selection, outbound embedding calls, config detection, LLM/tooling flows, DoS/performance, persistence, hooks/tooling, supply chain.
- Result is documented locally with neutral IDs only.
- `$prep-merge-to-local-main` is run at the end or its no-op/blocker is documented.

Intended verification:
- `npm test -- test/embedding-provider.test.ts`
- `git diff --check`
- Security gates where required/available after code changes.

Known boundaries:
- Public GitHub reads are allowed for issue and PR diff inspection.
- Credentialed `gh api`, logged-in browser reads, pushes, PRs, and tracker updates are out of scope.

Stop conditions:
- Any required credentialed read/write, remote state change, destructive cleanup, schema/API/security boundary broadening, or unresolved required security finding.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Evaluate Issue 863 relevance in current fork | Inspect `src/providers/embedding/index.ts`, `src/providers/embedding/openai.ts`, tests | Done | Current factory still passed `OPENAI_API_KEY` into `OpenAIEmbeddingProvider`; provider already supported `OPENAI_EMBEDDING_API_KEY` precedence internally |
| Import/adapt minimal fix if needed | TDD regression test, minimal source diff | Done | Adapted only PR 933's factory hunk; did not import obsolete auto-detection/docs hunk |
| Security review | Manual diff review plus required scanner gates where available | Done | Semgrep p/default: 0 findings; Codex Security diff scan: no candidates |
| Local documentation | Neutral task record and plan | Done | This file and `plan.md` |
| Merge prep | `$prep-merge-to-local-main` workflow | In progress | Task-owned changes committed; merge with local `main` is next |

## Subagent Ledger

No delegated workstreams planned. The scope is small and the immediate blocking steps are local code/test review.

## Progress

- Branch created from detached `main` commit: `review/issue-863-pr-933-embedding-api-key`.
- Public Issue 863 and PR 933 patch inspected without credentialed GitHub access.
- Current fork already has `OPENAI_EMBEDDING_API_KEY` support inside `OpenAIEmbeddingProvider`, but the factory still overrides it with `OPENAI_API_KEY`.
- Decision: adjusted import. Applied the minimal factory hunk from PR 933 and added local regression coverage.
- Rejected/deferred PR 933's auto-detection hunk because this fork intentionally requires explicit `EMBEDDING_PROVIDER` and does not auto-enable remote embeddings from general provider keys.
- Red verification: with the old factory, the new regression test failed because outbound `Authorization` was `Bearer hosted-chat-key`.
- Green verification: targeted Vitest suite passed with 21 tests using the existing main-checkout Vitest toolchain and config against this worktree.
- Security evidence: `git diff --check` passed; Semgrep default scan completed with 0 findings; Codex Security diff scan report is under `/tmp/codex-security-scans/agentmemory/issue-863-pr-933-20260615/report.md` and found no candidates.
- Secret-scan evidence: `gitleaks detect --source . --redact` completed with no leaks. The first `$prep-merge-to-local-main` attempt blocked before staging, so staged protection was not applicable then. On retry, `gitleaks protect --staged --redact` completed with no leaks before the task-owned commit.
- Limitation: direct `npm test -- test/embedding-provider.test.ts` in this worktree failed before test execution because `vitest` is not installed locally in this worktree.
- First `$prep-merge-to-local-main` attempt: blocked during Preflight. The local `main` worktree at `/Users/A1538552/_projects/_tools/agentmemory` had dirty unrelated tracked and untracked paths, so the skill required stopping before cleanup, staging, commit, or merge.
- Retry `$prep-merge-to-local-main`: local `main` worktree is now clean at `6c387b4efea524db5bf8fe0e923958cbcf0213f1`; cleanup/commit and merge prep resumed.
- Task-owned commit: `f7bf9e6` (`fix: respect openai embedding api key precedence`).
- Verification artifact: `node_modules/.vite/vitest` exists as an ignored local cache from the Vitest invocation. It was not removed because cleanup/deletion was not explicitly authorized in the current turn.
