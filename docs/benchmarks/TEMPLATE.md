# <YYYY-MM-DD> — <benchmark-name>

**Commit:** `<sha>`
**Bench:** LongMemEval `_s` / coding-agent-life-v1 / ...
**N:** 500 / 15 / ...
**K:** 5
**Hardware:** macos-15 / ubuntu-22.04 / ...
**OpenAI model:** text-embedding-3-small
**Anthropic model:** N/A (no LLM in retrieval loop)

## Headline

agentmemory-hybrid: **R@5 = XX.XX%**, P@5 = XX.XX%, p50 latency = XXms

Beats grep baseline by +X.Xpt R@5, vector by +X.Xpt R@5.

## Per-adapter

| Adapter | P@5 | R@5 | Hit rate | p50 latency |
|---|---|---|---|---|
| grep | | | | |
| vector | | | | |
| agentmemory-hybrid | | | | |

## Per-question-type

| Type | grep R@5 | vector R@5 | agentmemory R@5 |
|---|---|---|---|
| single-session-bug | | | |
| single-session-refactor | | | |
| preference | | | |
| multi-session-causal | | | |
| temporal | | | |

## Methodology

- Sessions ingested via `POST /agentmemory/remember` with `type=eval-session`
- Queries hit `POST /agentmemory/smart-search` with `limit=k*4`
- No LLM in retrieval loop. Direct rank from hybrid scoring.
- Ranks dedup by sessionId before truncating to K
- Latency measured as init+query for LongMemEval (per-question fresh state), query-only for coding-life (shared state)

## Reproduce

```sh
git checkout <sha>
npm install --legacy-peer-deps
OPENAI_API_KEY=sk-... AGENTMEMORY_BASE_URL=http://localhost:3111 \
  npm run eval:longmemeval -- --stratify 10
```

## Notes

<what surprised, what regressed, what's load-bearing>
