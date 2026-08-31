# 2026-05-20 — coding-agent-life-v1 (v0.9.26)

**Bench:** coding-agent-life-v1 (15 sessions, 15 queries)
**N:** 15
**K:** 5
**Hardware:** macOS 15 (Apple Silicon)
**agentmemory:** v0.9.26
**iii-engine:** v0.11.2
**Embedding provider:** local default
**Sandbox:** isolated data dir at `/tmp/agentmemory-eval-sandbox/`, ports 3411/3412

## Math ceiling on this dataset

12 of 15 questions have 1 gold session, 3 have 2 gold sessions. Per
`scoreQuestion` in `eval/runner/score.ts`, P@K = `hits / k` averaged
across questions, so the **maximum achievable P@5** is:

```
(12 * 1/5) + (3 * 2/5)) / 15 = (2.4 + 1.2) / 15 = 0.240
```

R@5 ceiling is **1.000** (every gold session found in top-5).

The benchmark is **small** (15 questions) and **gold-sparse** (mostly
single-gold). It's tuned for fast iteration on the retrieval stack,
not for headline P@K comparisons. **Recall** + per-question-type
**P@5** are the signals; aggregate P@5 saturates at 0.240 so it can't
differentiate top-tier adapters.

## Headline

`agentmemory-hybrid` hits **100% top-5 hit rate**, R@5 = **1.000**,
P@5 = **0.240** (at the math ceiling — every gold session retrieved
in top-5).

grep baseline: R@5 = **0.967**, P@5 = **0.227** — missed one gold
session in one multi-gold question. Lift is **recall**, not aggregate
precision.

## Per-adapter

| Adapter | P@5 | R@5 | Hit rate | p50 latency |
|---|---|---|---|---|
| grep (tokenized substring) | 0.227 | 0.967 | 15 / 15 | 0 ms |
| `agentmemory-hybrid` | **0.240** | **1.000** | **15 / 15** | 14 ms |

`agentmemory-hybrid` runs through the production smart-search endpoint (`POST /agentmemory/smart-search`) so it exercises the full BM25 + embedding + reranker stack.

## Per-question-type

At K=5 with 1 gold per single-session question, the P@5 ceiling per
question is **0.20**; with 2 gold the ceiling is **0.40**. Both
adapters saturate the per-type ceiling on most types, so the per-type
table primarily exposes where one adapter **misses** gold (failing
the recall side).

| Type | grep P@5 | grep R@5 | hybrid P@5 | hybrid R@5 |
|---|---|---|---|---|
| single-session-bug | 0.20 | 1.00 | 0.20 | 1.00 |
| single-session-infra (n=2) | 0.20 | 1.00 | 0.20 | 1.00 |
| single-session-refactor | 0.20 | 1.00 | 0.20 | 1.00 |
| single-session-feature | 0.20 | 1.00 | 0.20 | 1.00 |
| single-session-test | 0.20 | 1.00 | 0.20 | 1.00 |
| single-session-perf | 0.20 | 1.00 | 0.20 | 1.00 |
| single-session-api | 0.20 | 1.00 | 0.20 | 1.00 |
| single-session-db | 0.20 | 1.00 | 0.20 | 1.00 |
| single-session-release | 0.20 | 1.00 | 0.20 | 1.00 |
| multi-session-causal (2 gold) | 0.40 | 1.00 | 0.40 | 1.00 |
| preference (n=2) | 0.20 | 1.00 | 0.20 | 1.00 |
| multi-session-review (2 gold) | 0.40 | 1.00 | 0.40 | 1.00 |
| temporal (2 gold) | 0.20 | 0.50 | 0.40 | 1.00 |

The differentiator at this corpus size is **temporal** (`What was shipped on April 8th 2026?`): grep finds 1 of 2 gold sessions, hybrid finds both. Per-type R@5 saturates everywhere else.

## Methodology

- 15 fictional Claude Code sessions across a 10-day stretch of a Rust CLI project (`shipctl`) — bug fixes, refactors, infra, perf, schema migrations, preferences, post-mortem
- 15 hand-graded queries with `goldSessionIds[]` covering single-session, multi-session causal, multi-session review, preference, temporal
- Each session ingested via `POST /agentmemory/remember` with `type=eval-session` and `concepts=[session_id]`
- Each query hits `POST /agentmemory/smart-search` with `limit=50`; dedupe by session ID; truncate to K=5
- No LLM in the retrieval loop
- Sandbox: clean `~/.agentmemory` via `HOME` override + alt ports (3411/3412) so no cross-contamination from a user's real store

## Reproduce

```sh
git checkout e9dc710
npm install --legacy-peer-deps
npm run build

source eval/scripts/sandbox.sh
npm run eval:coding-life -- --adapters grep,agentmemory
```

Outputs land in `eval/reports/coding-life/`: `scores.ndjson` (per-query rows) and `summary.json` (per-adapter and per-type aggregates).

## Notes

- The single-session-feature tie (`Which PR introduced helm chart support?`) is interesting: query says `PR introduced helm chart` and gold session has `helm chart` literally — grep wins on lexical exactness, hybrid matches but doesn't outperform.
- The corpus is intentionally small for fast iteration. Hardening targets: paraphrased queries, synonym substitution, in-corpus distractors with shared keywords, longer multi-session chains.
- Vector adapter not measured here — requires `OPENAI_API_KEY`; will be added in a follow-up scorecard alongside LongMemEval `_s`.
