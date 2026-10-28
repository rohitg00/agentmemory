# Local evaluation baseline, 9 October 2026

A prefix-scoring bug was fixed using two independent synthetic regressions. On the same cleaned LongMemEval S input, strict evidence retrieval improved from **309/470 (65.74%) to 398/470 (84.68%)**. Grep retrieved all required evidence for **339/470 (72.13%)**.

These are development retrieval results. They do not establish superiority over Mem0, Supermemory, gbrain, or another memory product. No competitor backend, LLM reader, or judge ran. The public data was inspected during diagnosis and is not held-out validation for this fix.

## Reproducibility

The input is [LongMemEval cleaned S](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/tree/98d7416c24c778c2fee6e6f3006e7a073259d48f), revision `98d7416c24c778c2fee6e6f3006e7a073259d48f`, file SHA256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`. All 500 questions ran for each local component arm. There are 470 answerable questions and 30 unanswerable questions; the latter are counted separately and are not assigned a retrieval-accuracy or abstention score.

The same validated loader, opaque IDs, dates, cutoff (five distinct sessions) and data transformations were used before and after. Thirteen identical repeated distractor transcripts were coalesced by source ID while retaining their supplied dates. Normalization details, commands, metric definitions and claim requirements are in [eval/README.md](../../eval/README.md).

The product base is `df3d4a83b966d8d415cb9180d5a4724b07f729dc`, with the working-tree harness and then the prefix correction on this branch. The archived manifests record dirty state, actual source-content fingerprints, resolved dependency versions, Node/platform, and built-artifact/iii hashes for live runs. No provider API was called; measured API spending was $0. This does not estimate hosted costs.

## Full supplied-session retrieval

| Adapter | Completed | Strict recall-all@5 | Fractional recall@5 | Any-hit count |
|---|---:|---:|---:|---:|
| Grep | 500/500 | 72.13% | 80.82% | 417/470 |
| BM25 before fix | 500/500 | 65.74% | 76.70% | 413/470 |
| BM25 after fix | 500/500 | 84.68% | 91.72% | 452/470 |

All arms had zero operational failures, so strict success over answerable attempts equals strict recall here. BM25 uses the real production `SearchIndex`, with one complete session per document. It does not exercise the capture/compression pipeline or hybrid embeddings. The fixture is not an equal-token reader comparison.

| Question type | Answerable | Grep strict recall | BM25 before | BM25 after |
|---|---:|---:|---:|---:|
| single-session-user | 64 | 93.75% | 92.19% | 98.44% |
| multi-session | 121 | 52.89% | 42.15% | 71.07% |
| single-session-preference | 30 | 46.67% | 60.00% | 83.33% |
| temporal-reasoning | 127 | 66.93% | 66.14% | 77.95% |
| knowledge-update | 72 | 91.67% | 72.22% | 97.22% |
| single-session-assistant | 56 | 89.29% | 80.36% | 98.21% |

There were **92 recovered cases and 3 regressions**, a net gain of 89 complete-evidence retrievals. Regressed question IDs: `e01b8e2f`, `gpt4_731e37d7`, `2b8f3739`. They remain visible in the receipts. No additional score-driven parameter tuning was performed.

## What changed in ranking

An equal-length synthetic example demonstrates the defect without benchmark labels: querying `redis` ranked `redistool redisproxy rediscache redisserver` above `redis alpha beta gamma`, with scores 1.386294 versus 0.693147. Multiple vocabulary expansions of one query term were being summed.

Each query term now contributes only its strongest prefix match per document. A document already matching that exact term receives no additional prefix bonus. Exact term scoring, stemming, synonyms and prefix fallback remain available. Two tests failed before the correction and pass afterward, including index serialization consistency. The measured benchmark gain is supporting development evidence, not the sole justification for the change.

## Built daemon sample

The live comparison uses the first two questions per type (12 total), identical before/after selection, with a new disposable home and iii state for every question. This is a deterministic development sample, not a random estimate of the full dataset. The adapter stores complete sessions through `/remember` and queries full `/search` results; normal memory supersession stays enabled.

| Adapter | Before strict recall-all@5 | After strict recall-all@5 | After fractional recall@5 |
|---|---:|---:|---:|
| grep | 83.33% | 83.33% | 87.50% |
| agentmemory-bm25-component | 66.67% | 83.33% | 87.50% |
| agentmemory-http-bm25 | 66.67% | 83.33% | 85.42% |

Every live sample case completed without an operational error. The original 15-query coding fixture scored 15/15 strict recall for grep, the BM25 component, and the built daemon after the fix. It is saturated and should only be used as a smoke test.

## Lifecycle assertions and unresolved product bugs

The original `coding-memory-lifecycle-v1` suite executed 11/11 checks: **9 passed, 2 failed**. Its process exited nonzero.

Passed: positive recall; version supersession with stale evidence removed; forgetting with a positive witness and preserved neighboring memory; capture and source provenance; persistence after restart; abstention without memory; abstention with verified conflicting memories; creation/readback of an Action from retrieved text; sandbox cleanup.

Still failing:

1. **Smart-search project filtering:** a scoped request returns a known memory from another explicitly scoped project.
2. **Durable-memory expansion:** a compact `mem_*` hit cannot recover its stored full content through `expandIds`.

Existing contributor work covers these paths: [#869](https://github.com/rohitg00/agentmemory/pull/869), [#1091](https://github.com/rohitg00/agentmemory/pull/1091), and [#1230](https://github.com/rohitg00/agentmemory/pull/1230). Their implementations were not copied into this change. The combined fix in #1091 requires conflict resolution and current-base validation before merging. These regression results must turn green when that work lands; they are not hidden as expected failures.

The lifecycle reader is deterministic. It creates a real Action record with source IDs but does not execute a shell command or measure LLM task success.

## Validation and next gate

The required build, skills generation, docs sync, skills check and full local test sequence passed: 2,632 tests passed and four were skipped. Evaluation type checking and 22 focused harness tests passed. Two production ranking regressions are included in the full suite. Remote CI is a separate check.

Before a competitive claim: resolve the remaining lifecycle bugs; expand original coding tasks with a fixed reader and judge; freeze a held-out split and token budgets; add equivalent competitor adapters and credentials; then publish matched coverage, failures, phase costs and paired uncertainty. No claim is made from vendor headline scores or from this exposed development dataset.

## Archived run receipts

- [longmemeval-local-final](data/2026-10-09/longmemeval-local-final/summary.json): [manifest](data/2026-10-09/longmemeval-local-final/manifest.json), [scores](data/2026-10-09/longmemeval-local-final/scores.ndjson), [source evidence](data/2026-10-09/longmemeval-local-final/evidence.ndjson).
- [longmemeval-prefix-fix](data/2026-10-09/longmemeval-prefix-fix/summary.json): [manifest](data/2026-10-09/longmemeval-prefix-fix/manifest.json), [scores](data/2026-10-09/longmemeval-prefix-fix/scores.ndjson), [source evidence](data/2026-10-09/longmemeval-prefix-fix/evidence.ndjson).
- [longmemeval-http-final](data/2026-10-09/longmemeval-http-final/summary.json): [manifest](data/2026-10-09/longmemeval-http-final/manifest.json), [scores](data/2026-10-09/longmemeval-http-final/scores.ndjson), [source evidence](data/2026-10-09/longmemeval-http-final/evidence.ndjson).
- [longmemeval-http-prefix-fix](data/2026-10-09/longmemeval-http-prefix-fix/summary.json): [manifest](data/2026-10-09/longmemeval-http-prefix-fix/manifest.json), [scores](data/2026-10-09/longmemeval-http-prefix-fix/scores.ndjson), [source evidence](data/2026-10-09/longmemeval-http-prefix-fix/evidence.ndjson).
- [coding-prefix-fix](data/2026-10-09/coding-prefix-fix/summary.json): [manifest](data/2026-10-09/coding-prefix-fix/manifest.json), [scores](data/2026-10-09/coding-prefix-fix/scores.ndjson), [source evidence](data/2026-10-09/coding-prefix-fix/evidence.ndjson).
- [lifecycle-prefix-fix](data/2026-10-09/lifecycle-prefix-fix/summary.json): [manifest](data/2026-10-09/lifecycle-prefix-fix/manifest.json), [assertion receipts](data/2026-10-09/lifecycle-prefix-fix/checks.ndjson).
