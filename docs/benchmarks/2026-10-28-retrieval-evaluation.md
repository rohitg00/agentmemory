# Retrieval evaluation, 2026-10-28

AgentMemory 0.9.31 development checkout, revision `3f8784d10c2e996873d4392b85226a5d042def0e`. These runs exercise the production BM25 `SearchIndex` directly and a lexical baseline over identical supplied sessions. They do not exercise the daemon, hooks, compression, vectors, graph, persistence, or an answer-generating model.

## Results

| Dataset | Adapter | Strict recall-all@5 | Fractional recall@5 | Any-hit@5 | Completed / attempted |
|---|---|---:|---:|---:|---:|
| LongMemEval-S | BM25 component | 84.7% (398/470) | 91.7% | 96.2% (452/470) | 500/500 |
| LongMemEval-S | grep baseline | 72.1% (339/470) | 80.8% | 88.7% (417/470) | 500/500 |
| coding-agent-life-v1 | BM25 component | 93.3% (14/15) | 93.3% | 93.3% (14/15) | 15/15 |
| coding-agent-life-v1 | grep baseline | 100% (15/15) | 100% | 100% (15/15) | 15/15 |

All 1,030 adapter attempts completed with zero execution failures. LongMemEval has 470 answerable questions and 30 unanswerable questions. The latter are included in coverage but excluded from retrieval metrics; this run does not measure abstention quality. The small coding fixture is a development regression set, and the simpler baseline does better on it.

**Strict recall-all@5** requires every gold source session among the first five distinct returned sessions. **Fractional recall@5** averages the fraction of required sources found. **Any-hit@5** needs only one. Multi-source questions can therefore have an any-hit success while still missing necessary evidence.

| LongMemEval question type | Answerable | BM25 strict successes | grep strict successes |
|---|---:|---:|---:|
| Single-session user | 64 | 63 | 60 |
| Single-session assistant | 56 | 55 | 50 |
| Single-session preference | 30 | 25 | 14 |
| Knowledge update | 72 | 70 | 66 |
| Temporal reasoning | 127 | 99 | 85 |
| Multi-session | 121 | 86 | 64 |

Multi-session retrieval remains the weakest BM25 category: 86/121 strict successes (71.1%). A complete answer-quality evaluation still needs a fixed reader, judge, model, prompt, context budget, and matched ingestion path.

## Reproduce

Run from the repository root with dependencies installed:

```sh
mkdir -p benchmark/data
curl -fL https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/98d7416c24c778c2fee6e6f3006e7a073259d48f/longmemeval_s_cleaned.json -o benchmark/data/longmemeval_s_cleaned.json
shasum -a 256 benchmark/data/longmemeval_s_cleaned.json
npm run eval:longmemeval -- --data benchmark/data/longmemeval_s_cleaned.json --adapters grep,bm25
npm run eval:coding-life -- --adapters grep,bm25
```

Expected dataset SHA256: `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`. The external dataset is not redistributed. The loader removes answer labels, uses opaque source IDs, retains supplied dates, and coalesces 13 identical repeated distractor IDs. Each question gets a fresh index. See the [evaluation guide](../../eval/README.md) for the input transformation and metric contract.

The run used Node v25.6.1 on macOS arm64. Manifests record source, installed dependency and dataset hashes. `dirty: true` records an untracked dependency symlink; tracked source was unchanged during the run. Diagnostic query timings exclude ingestion, initialization and cleanup, have no warmup or repeated trials, and are not end-to-end latency claims.

## Receipts and scope

- [LongMemEval summary](receipts/2026-10-28/longmemeval/summary.json) and [manifest](receipts/2026-10-28/longmemeval/manifest.json).
- [LongMemEval per-question scores](receipts/2026-10-28/longmemeval/scores.ndjson.gz) and [returned-source evidence](receipts/2026-10-28/longmemeval/evidence.ndjson.gz).
- [Coding summary](receipts/2026-10-28/coding/summary.json), [manifest](receipts/2026-10-28/coding/manifest.json), [scores](receipts/2026-10-28/coding/scores.ndjson.gz), and [evidence](receipts/2026-10-28/coding/evidence.ndjson.gz).

Receipts contain public fixture identifiers, content hashes and scores, without transcript text or personal memory data. Decompress the NDJSON with `gzip -dc <file>`.

These results do not establish a speedup or accuracy gain over 0.9.30. The historical [hybrid LongMemEval report](../../benchmark/LONGMEMEVAL.md) used any-hit scoring and a different input pipeline; its 95.2% headline cannot be compared to strict recall-all here. The [v0.6.0 token experiment](../../benchmark/REAL-EMBEDDINGS.md) and [May coding benchmark](2026-05-20-coding-agent-life-v1.md) remain historical measurements, not 0.9.31 guarantees. No third-party memory product was run in this evaluation.

## What changed in 0.9.31

The [release notes](https://github.com/rohitg00/agentmemory/releases/tag/v0.9.31) document scoped saved-memory recall, incremental session summaries, paged exports, validated imports, native Pi/OMP/DeepSeek Harness integrations, Cursor workspace attribution, and compression/recovery fixes. These are implementation improvements. Lifecycle correctness and packaged startup/restart behavior are tested separately by the [evaluation suites](../../eval/README.md) and [release gate](../../scripts/release-gate/); this component run does not certify them.
