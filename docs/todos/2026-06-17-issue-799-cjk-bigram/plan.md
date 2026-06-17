# CJK Bigram Tokenization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dependency-free CJK character bigram fallback tokens to the BM25 search index while preserving existing optional word segmentation.

**Architecture:** Keep `SearchIndex` as the single BM25 boundary and keep CJK-specific token generation in `src/state/cjk-segmenter.ts`. `segmentCjk()` will continue returning source-order CJK and non-CJK pieces; a new exported helper will add overlapping CJK bigrams to the tokenizer output only when a segmented token contains CJK characters.

**Tech Stack:** TypeScript ESM, Vitest, existing `@node-rs/jieba` / `tiny-segmenter` optional segmenters, pnpm.

---

## Sprint Contract

Goal: Add dependency-free CJK character bigram fallback tokens to BM25 search so CJK runs remain searchable by internal two-character queries even when optional segmenters are unavailable or produce coarser tokens.

Scope:
- Modify `src/state/cjk-segmenter.ts`.
- Modify `src/state/search-index.ts`.
- Modify `test/search-index.test.ts`.
- Modify `README.md`.

Non-goals:
- Do not add dependencies.
- Do not change persistence schema, REST/MCP APIs, auth, embeddings, viewer behavior, or GitHub remote state.
- Do not fetch, pull, push, or create a PR.

Acceptance criteria:
- Query `人工智能`, `技术`, and `发展` can find a memory whose CJK text is `人工智能技术发展迅速`.
- Existing CJK word-level tokens remain indexed.
- Existing ASCII, Greek, Chinese, Japanese, Korean, prefix, and API search tests still pass.
- README no longer claims no-dependency CJK fallback is whole-run only.
- Existing persisted BM25 snapshots from before this tokenizer version are invalidated so startup rebuilds with bigram terms.
- Japanese long-vowel marks inside kana words remain part of CJK bigram runs.

Intended verification:
- `corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts`
- `corepack pnpm exec vitest run --exclude test/integration.test.ts test/index-persistence.test.ts`
- `corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts test/api-memories-project.test.ts`
- `corepack pnpm test` if time and environment allow.

Known boundaries:
- Serialized old BM25 indexes are rejected by tokenization version so the existing rebuild path repopulates CJK bigram terms.
- Bigram tokens add O(n) terms per CJK run.

Stop conditions:
- The change would require schema migration, dependency changes, or remote state changes.
- Required verification cannot run after the documented pnpm hardening fallback.

## Files

- Modify: `src/state/cjk-segmenter.ts`
  - Add an exported helper that returns overlapping two-character CJK bigrams for each CJK run in a token, including Japanese long-vowel marks.
- Modify: `src/state/search-index.ts`
  - Import the helper, preserve optional segment tokens, and append bigram tokens from the original raw CJK token so segment-boundary bigrams are indexed.
  - Bump the serialized BM25 tokenization version so pre-bigram snapshots are rejected and rebuilt.
- Modify: `test/search-index.test.ts`
  - Add a direct `cjkBigrams()` regression, SearchIndex CJK substring regressions, deterministic Hangul whole-run bigram coverage, optional-segmenter boundary bigram coverage, Japanese long-vowel mark coverage, and BM25 snapshot version tests.
- Modify: `README.md`
  - Update BM25 CJK wording to mention dependency-free bigram fallback and optional word segmenters.

## Task 1: SearchIndex CJK Bigram Fallback

**Files:**
- Modify: `test/search-index.test.ts`
- Modify: `src/state/cjk-segmenter.ts`
- Modify: `src/state/search-index.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

Update the import in `test/search-index.test.ts`:

```typescript
import { cjkBigrams, segmentCjk } from "../src/state/cjk-segmenter.js";
```

Add these tests near the existing CJK tests in `test/search-index.test.ts`:

```typescript
  it("extracts overlapping CJK character bigrams", () => {
    expect(cjkBigrams("人工智能技术发展迅速")).toEqual([
      "人工",
      "工智",
      "智能",
      "能技",
      "技术",
      "术发",
      "发展",
      "展迅",
      "迅速",
    ]);
    expect(cjkBigrams("auth人工智能")).toEqual(["人工", "工智", "智能"]);
  });

  it("indexes CJK bigrams for internal substring search", () => {
    index.add(
      makeObs({
        id: "obs_zh_bigram",
        title: "人工智能技术发展迅速",
        narrative: "中文内容没有空格也应该支持部分查询",
        facts: [],
        concepts: [],
      }),
    );

    expect(index.search("人工智能").map((r) => r.obsId)).toContain("obs_zh_bigram");
    expect(index.search("技术").map((r) => r.obsId)).toContain("obs_zh_bigram");
    expect(index.search("发展").map((r) => r.obsId)).toContain("obs_zh_bigram");
  });
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts
```

Expected: the new `indexes CJK bigrams for internal substring search` test fails before implementation because `技术` or another internal substring is not indexed without a matching segment/concept.

The direct `cjkBigrams` import/test should also fail before implementation because the export does not exist yet. This makes the RED step independent of optional segmenter availability.

- [ ] **Step 3: Add CJK bigram helper**

In `src/state/cjk-segmenter.ts`, add an exported helper close to the existing regex helpers:

```typescript
export function cjkBigrams(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CJK_RUN_RE)) {
    const chars = Array.from(m[0]);
    for (let i = 0; i < chars.length - 1; i++) {
      out.push(chars[i] + chars[i + 1]);
    }
  }
  return out;
}
```

- [ ] **Step 4: Append CJK bigrams during tokenization**

In `src/state/search-index.ts`, change the import:

```typescript
import { cjkBigrams, segmentCjk, hasCjk } from "./cjk-segmenter.js";
```

Then update the CJK branch in `tokenize()` to preserve current segment emission frequency and append bigrams after each CJK segment:

```typescript
      if (hasCjk(raw)) {
        for (const seg of segmentCjk(raw)) {
          if (seg.length >= 1) out.push(seg);
          for (const bigram of cjkBigrams(seg)) {
            out.push(bigram);
          }
        }
      } else {
        out.push(stem(raw));
      }
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts
```

Expected: all `test/search-index.test.ts` tests pass.

- [ ] **Step 6: Update README**

Replace the current BM25 CJK paragraph with:

```markdown
BM25 tokenizes Greek, Cyrillic, Hebrew, Arabic, and accented Latin out of the box. Chinese / Japanese / Korean runs are searchable without extra dependencies through overlapping CJK character bigrams. Optional segmenters (`npm install @node-rs/jieba tiny-segmenter`) improve Chinese and Japanese search with word-level tokens; when they are unavailable, agentmemory keeps the bigram fallback and prints a one-time hint on stderr.
```

- [ ] **Step 7: Run integration verification**

Run:

```bash
corepack pnpm exec vitest run --exclude test/integration.test.ts test/search-index.test.ts test/api-memories-project.test.ts
```

Expected: 2 files pass with 30 total tests after the new tests are added.

- [ ] **Step 8: Simplification pass**

Inspect the active diff:

```bash
git diff -- src/state/cjk-segmenter.ts src/state/search-index.ts test/search-index.test.ts README.md
```

Remove only unnecessary duplication introduced by this task. Preserve APIs, serialized format, optional segmenter behavior, and search semantics.

- [ ] **Step 9: Commit**

After verification and reviews pass, stage only task-owned files and commit:

```bash
git add src/state/cjk-segmenter.ts src/state/search-index.ts test/search-index.test.ts README.md docs/todos/2026-06-17-issue-799-cjk-bigram/todo.md docs/todos/2026-06-17-issue-799-cjk-bigram/plan.md
git commit -m "feat(search): add CJK bigram fallback tokens"
```

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---|---|
| Dependency-free CJK bigram fallback | Red-green `test/search-index.test.ts` | done | RED: `cjkBigrams is not a function`; final GREEN: `test/search-index.test.ts`, 27 tests passed |
| Preserve existing search behavior | Existing focused tests | done | `test/search-index.test.ts` + `test/api-memories-project.test.ts` + `test/index-persistence.test.ts`, 62 tests passed |
| README CJK search wording | Diff/stale-reference inspection | done | README now documents bigram fallback; `rg` found no remaining `whole-run tokenization` wording |
| Persisted BM25 snapshot compatibility | Version tests and index-persistence tests | done | RED: v2 accepted; GREEN: SearchIndex 25 tests and IndexPersistence 27 tests passed with BM25 `v: 3` |
| Full repo regression | `corepack pnpm test` | done | 172 files / 2258 tests passed after rerunning an unrelated backup-scheduler cleanup flake |
| Static security scan | Semgrep | done | Full `semgrep scan --config p/default --error --metrics=off .` reported 0 findings |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output |
|---|---|---:|---|
| Pre-code validation explorer | tokenizer/index/query behavior, CJK tests/docs | No | Validity decision and test suggestions |
| Plan reviewer | this plan and issue scope | No | ACCEPT or High/Medium findings; first pass found deterministic RED and term-frequency issues, both incorporated |
| Implementer | task-owned files listed above | Yes | TDD implementation, tests, commit-ready diff |
| Spec/code reviewers | current diff | No | ACCEPT or actionable High/Medium findings |

## Self-Review

- Spec coverage: The plan covers tokenizer/index/query behavior, tests, docs, and verification. It intentionally does not change persistence or remote GitHub state.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: `cjkBigrams(text: string): string[]` is exported from `cjk-segmenter.ts` and imported by `search-index.ts`.
