# Issue 799 / Upstream PR 224 CJK Bigram Tokenization

## Scope

Repository: `/Users/A1538552/.codex/worktrees/5f37/agentmemory`

Origin target: `https://github.com/wbugitlab1/agentmemory.git`

Issue: `#799` (`[upstream PR 224] feat(search): add CJK character bigram tokenization`)

Branch: `github-pr/issue-799-cjk-bigram-tokenization-71eceb08`

## Sprint Contract

Goal: Add dependency-free CJK character bigram fallback tokens to BM25 search so CJK runs remain searchable by internal two-character queries even when optional segmenters are unavailable or produce coarser tokens.

Scope:
- `src/state/cjk-segmenter.ts`
- `src/state/search-index.ts`
- `test/search-index.test.ts`
- `README.md`
- this task record and plan

Non-goals:
- No dependency additions or removals.
- No changes to MCP, REST, auth, persistence schema, embedding providers, viewer search, or upstream remotes.
- No fetch, pull, push, PR creation, or issue closure unless separately approved.

Acceptance criteria:
- Chinese text such as `人工智能技术发展迅速` is searchable by `人工智能`, `技术`, and `发展` through BM25 terms.
- Existing optional CJK segmenter behavior remains additive; word-level tokens are preserved.
- ASCII/Greek and existing CJK tests continue to pass.
- README accurately describes dependency-free bigram fallback and optional segmenter improvement.

Intended verification:
- RED: focused `test/search-index.test.ts` case fails before implementation.
- GREEN: `corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts`.
- Integration check: `corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts test/api-memories-project.test.ts`.
- Final if feasible: `corepack pnpm test`.

Known boundaries:
- `search-index.ts` calls the same tokenizer for indexing and query terms, so the change must cover both.
- Serialized old search indexes will not gain new terms until rebuilt or refreshed; the task does not change index serialization format.
- Bigram tokens increase term count linearly for CJK runs.

Stop conditions:
- A fix requires changing storage format, dependency policy, or external API behavior.
- Verification repeatedly fails from an unclear repo-wide condition.
- Remote state-changing GitHub actions would be needed.

## Validation Evidence

- Initial `git status -sb --untracked-files=all`: `## HEAD (no branch)`.
- Public GitHub issue read via unauthenticated API: issue `#799` is open and tracks upstream PR `224`.
- Explorer subagent `019ed6a5-915d-7123-98cc-9827d66d3b38` found the issue valid for dependency-free bigram behavior: current code uses optional CJK segmenters and whole-run fallback, not bigram fallback.
- Local inspection confirmed `src/state/search-index.ts` tokenizes CJK through `segmentCjk(raw)` and `src/state/cjk-segmenter.ts` falls back to `[text]` for Han and Japanese when optional segmenters are unavailable.
- Existing focused tests passed before changes after dependency materialization: `corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts test/api-memories-project.test.ts` reported 2 files, 28 tests passed.
- Runtime probe with installed optional segmenters returned `obs_cjk` for `人工智能`, `技术`, and `发展`; this proves installed optional segmenter behavior but not the dependency-free bigram fallback requested by the issue.

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
|---|---|---:|---|---|---|
| Validity explorer | Search tokenizer/index/query, CJK tests/docs/package evidence | No | Decide whether issue remains valid and identify minimal tests | Valid: dependency-free bigram fallback missing | Did not inspect live upstream PR; main agent inspected public issue body |
| Plan reviewer | Plan, task record, search tokenizer/tests/docs | No | ACCEPT or High/Medium findings | Medium findings accepted: original test could pass with optional segmenters; planned `Set` changed BM25 term frequency | Plan updated with direct `cjkBigrams()` RED test and segment-frequency-preserving implementation |

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---|---|
| Dependency-free CJK bigram fallback | New focused SearchIndex regression, red-green | done | RED: `corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts` failed with `TypeError: cjkBigrams is not a function`; final GREEN: same file passed, 27 tests |
| Preserve existing tokenization behavior | Existing search-index/API tests | done | `corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts test/api-memories-project.test.ts test/index-persistence.test.ts` passed, 3 files / 62 tests |
| README search docs updated | Diff inspection and stale-reference search | done | README now says CJK runs use overlapping character bigrams without extra dependencies; `rg` found no remaining `whole-run tokenization` wording |
| BM25 persisted snapshot compatibility | Snapshot version tests and index-persistence tests | done | RED: v2 snapshots still loaded; GREEN: SearchIndex 25 tests and IndexPersistence 27 tests passed after BM25 snapshot version bump to v3 |
| Full repo regression | `corepack pnpm test` | done | Final full run passed, 172 files / 2258 tests. One prior full run hit an unrelated `backup-scheduler.test.ts` tempdir cleanup `ENOTEMPTY`; isolated rerun passed, and the subsequent full run passed. |
| Static security scan | Semgrep | done | Full `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings; focused task-scope Semgrep also passed with 0 findings |
| Final branch state | Git status and commit record | pending |  |

## Progress

- Created local branch from detached worktree: `github-pr/issue-799-cjk-bigram-tokenization-71eceb08`.
- Task state initialized.
- Plan review completed; both Medium findings triaged as valid and fixed in `plan.md`.
- RED verified before implementation: `test/search-index.test.ts` failed on missing `cjkBigrams`.
- Implemented `cjkBigrams()` and additive SearchIndex tokenization, preserving current segment token emission.
- GREEN/focused integration verified: 22 SearchIndex tests passed, then 30 SearchIndex/API tests passed.
- Test coverage reviewer found the first SearchIndex regression could still pass through optional Jieba output. Added deterministic Hangul whole-run bigram SearchIndex test; negative control without `out.push(...cjkBigrams(seg))` failed with `expected [] to include 'obs_ko_bigram'`, then the production line was restored and the test passed.
- Maintainability reviewer found persisted v2 BM25 snapshots would skip rebuild and miss new bigram terms. Added RED tests for BM25 tokenization version and stale v2 rejection, then bumped serialized BM25 snapshots to `v: 3` and rejected non-v3 snapshots.
- Persistence re-review found bigrams were generated from post-segmenter tokens, missing boundary bigrams such as `能技`. Fixed SearchIndex to append `cjkBigrams(raw)` once after preserving segment tokens, and added `indexes CJK bigrams across optional segmenter boundaries`.
- Final maintainability review found Japanese prolonged-sound marks (`ー`, `ｰ`) were excluded from CJK runs. RED confirmed `cjkBigrams("コンピューター")` missed `ュー`, `ータ`, and `ター`; fixed CJK/Kana run regexes and added SearchIndex coverage for `ュー`/`ータ`.
- Final verification so far: targeted SearchIndex/API/index-persistence suite passed 62 tests; runtime probes confirmed `能技`, `ュー`, and `ータ` hit; full `corepack pnpm test` passed 172 files / 2258 tests; full Semgrep passed with 0 findings.
