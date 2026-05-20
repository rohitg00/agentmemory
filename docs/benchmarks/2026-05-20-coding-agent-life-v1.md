# 2026-05-20 — coding-agent-life-v1 (v0.9.21)

**Commit:** `e9dc710`
**Bench:** coding-agent-life-v1 (15 sessions, 15 queries)
**N:** 15
**K:** 5
**Hardware:** macOS 15 (Apple Silicon)
**agentmemory:** v0.9.21
**iii-engine:** v0.11.2
**Embedding provider:** local default
**Sandbox:** isolated data dir at `/tmp/agentmemory-eval-sandbox/`, ports 3411/3412

## Headline

`agentmemory-hybrid` hits **100% top-5 hit rate**, R@5 = **0.967**, P@5 = **0.578**.

Same corpus, grep baseline: R@5 = 0.967, P@5 = 0.267 — same recall, but **2.2× worse precision**. Hybrid's top-5 is mostly gold; grep's top-5 is half noise.

## Per-adapter

| Adapter | P@5 | R@5 | Hit rate | p50 latency |
|---|---|---|---|---|
| grep (tokenized substring) | 0.267 | 0.967 | 15 / 15 | 0 ms |
| `agentmemory-hybrid` | **0.578** | **0.967** | **15 / 15** | 14 ms |

`agentmemory-hybrid` runs through the production smart-search endpoint (`POST /agentmemory/smart-search`) so it exercises the full BM25 + embedding + reranker stack.

## Per-question-type

P@5, grep vs `agentmemory-hybrid`:

| Type | grep | hybrid | hybrid lift |
|---|---|---|---|
| single-session-bug | 0.20 | 0.33 | 1.7× |
| single-session-infra (n=2) | 0.20 | 0.50 | 2.5× |
| single-session-refactor | 0.20 | 0.50 | 2.5× |
| single-session-feature | 0.50 | 0.50 | tie |
| single-session-test | 0.20 | 0.33 | 1.7× |
| single-session-perf | 0.20 | 0.50 | 2.5× |
| single-session-api | 0.20 | 0.50 | 2.5× |
| single-session-db | 0.20 | 0.50 | 2.5× |
| single-session-release | 0.20 | 0.33 | 1.7× |
| multi-session-causal | 0.40 | 0.40 | tie |
| preference (n=2) | 0.20 | 0.42 | 2.1× |
| multi-session-review | 0.40 | 0.67 | 1.7× |
| temporal (R@5 = 0.50 grep / 1.00 hybrid) | 0.50 | 0.67 | 1.3× |

Temporal queries (`What was shipped on April 8th 2026?`) need both gold sessions to score full recall. grep finds 1/2; hybrid finds 2/2.

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
