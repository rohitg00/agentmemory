# AgentMemory evaluations

Development evaluations for retrieval and persistent-memory behavior. These are separate from end-to-end answer accuracy, agent task success, and competitor rankings. Current measured results and remaining failures are in [the baseline report](../docs/benchmarks/2026-10-09-evaluation-baseline.md).

## Run locally

```sh
npm install
npm run eval:check
npm run eval:coding-life -- --adapters grep,bm25

npm run build
npm run eval:coding-life -- --adapters grep,bm25,agentmemory
npm run eval:lifecycle
npm run eval:recall
```

The defaults are local and require no model API keys. The HTTP adapter and lifecycle suite require an installed **iii 0.22.1** binary. Set `AGENTMEMORY_EVAL_III` to its absolute path, or use the binary installed by AgentMemory at `~/.agentmemory/bin/iii`.

Each HTTP case launches the actual built CLI in a new temporary home, state directory, and port block, with an environment that excludes provider credentials. It uses the noop compression provider, with automatic compression, consolidation, and graph extraction disabled. The parent home and existing daemon are not used. Cleanup runs even after a failed query. `AGENTMEMORY_EVAL_KEEP=1` preserves scratch files for diagnosis; the daemon still stops. This sandbox supports macOS/Linux and needs permission to bind local ports.

The old sourced `eval/scripts/sandbox.sh` now prints these instructions and exits without creating or deleting state. Do not run evaluations against a personal memory store.

## Retrieval adapters

| CLI name | Measured path | Limitations |
|---|---|---|
| `grep` | Token substring overlap over complete supplied sessions | Lexical baseline with input-order tie breaking |
| `bm25` | Production `SearchIndex`, one document per supplied session | Component only; no persistence, compression, embeddings, graph, or reader |
| `agentmemory` | Built CLI + iii, `/remember` then full `/search` | Retrieval-only ingestion of whole sessions; normal deduplication/supersession remains active |
| `vector` | OpenAI `text-embedding-3-small` and cosine similarity | Explicit opt-in, paid API, first 8,000 characters per session; not an equal-context comparison |

The HTTP adapter maps returned memory IDs to source sessions outside the searchable content. It fails on unknown sources or unsuccessful writes. It uses full search results rather than silently replacing failed smart-search expansion with the source fixture. The lifecycle suite separately exercises smart search.

The vector adapter reads `OPENAI_API_KEY` from the environment only when explicitly selected. It has not been included in the published local runs. Set a spending budget before using hosted adapters; no cost estimate is assumed.

## LongMemEval

Use the pinned **cleaned S dataset**, not the oracle subset that removes distractors:

```sh
mkdir -p ~/datasets/longmemeval
curl -fL \
  https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/98d7416c24c778c2fee6e6f3006e7a073259d48f/longmemeval_s_cleaned.json \
  -o ~/datasets/longmemeval/longmemeval_s_cleaned.json
shasum -a 256 ~/datasets/longmemeval/longmemeval_s_cleaned.json

npm run eval:longmemeval -- \
  --data ~/datasets/longmemeval/longmemeval_s_cleaned.json \
  --adapters grep,bm25

npm run eval:longmemeval -- \
  --data ~/datasets/longmemeval/longmemeval_s_cleaned.json \
  --adapters grep,bm25,agentmemory --stratify 2
```

Expected SHA256: `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442` (277,383,467 bytes). External data is downloaded separately, not redistributed here. Dataset terms remain those of its publisher.

`--stratify N` selects the first N rows in each question type, in sorted type order. `--limit N` applies afterward. This deterministic development slice is not a random sample or a substitute for full coverage. The default cutoff is `--k 5`; valid values are 1–100.

The loader validates the entire dataset before selecting rows. It removes per-turn answer labels and replaces source IDs with opaque per-question IDs. Answers and gold IDs stay in the controller. Session and question dates retain their supplied strings. Source dates are included in searchable text; `/remember` still records ingestion time, so these runs do not simulate historical clocks, TTL, or decay.

The pinned dataset contains 13 repeated distractor IDs with identical transcripts but different dates. The loader coalesces only identical transcripts with the same ID and retains all supplied dates as text. Conflicting transcripts are rejected. The manifest records the transformation and coalesced count. This affects lexical inputs and must be reproduced in any matched comparison.

## Metrics and receipts

Each adapter starts fresh for each question. Ranked IDs are deduplicated before taking the first k distinct source sessions.

- **Precision@k**: retrieved gold sessions divided by k, including unused slots.
- **Fractional recall@k**: retrieved gold sessions divided by all required gold sessions.
- **Strict recall-all@k**: 1 only when every required source is retrieved.
- **Any hit**: at least one required source, reported separately.
- **Strict success over attempts**: complete-evidence successes divided by all answerable attempts, including errors.

Unanswerable questions have null retrieval metrics and separate attempted/completed/failed counts. Returning nothing is not proof of a correct abstention. Answerable questions with empty gold, missing gold sources, duplicate gold IDs, unknown returned sources, malformed adapter output, and non-finite scores cannot silently improve accuracy.

Reports go to a fresh, gitignored `eval/reports/<run>/` directory:

- `manifest.json`: code, dependency, dataset and selection fingerprints; built artifacts and engine hash for HTTP runs.
- `scores.ndjson`: every attempted case, explicit failure phase, ingestion time and query time.
- `evidence.ndjson`: returned source IDs, scores, content hashes, and controller-only gold IDs.
- `summary.json`: attempted/completed/failed coverage and metrics by adapter/type.

Query timing excludes initialization and cleanup. Ingestion timing includes sandbox startup for the HTTP adapter. Latency figures are diagnostic, with no warmup or repeated timing trials. No reader/judge tokens or dollars are measured. Existing output directories are refused; there is no mixed-configuration resume. Interrupted runs lack a complete summary and cannot support a claim. Keep private datasets and their receipts private.

## Original lifecycle fixture

`eval:lifecycle` runs `coding-memory-lifecycle-v1`, an original synthetic fixture, through the public REST API. It checks positive recall, supersession, project filtering, full-content expansion, forgetting, capture provenance, restart persistence, and creating an Action record from retrieved text. Missing-memory and conflicting-memory controls require abstention; the conflict control first proves both memories were retrieved.

The reader is a deterministic command selector over returned text. The fixture creates an Action record and verifies its stored arguments/provenance. It does not run shell commands or measure LLM reasoning. All assertions must pass for a successful exit; current runtime failures remain red rather than being marked expected failures.

## Methodology and publication

`eval:recall` runs a synthetic saved-memory regression against the built CLI and
iii. Each of five queries has one long saved memory and 360 short tool observations;
a separate-project memory tests scope preservation. It checks filtering before
retrieval limits, all recall formats over REST and MCP, tiny-budget disclosure,
full-content expansion, observation-only search, and restart persistence. Reports
include mixed and memory-only result IDs, source fingerprints, and every check.
The distractors exceed both keyword and hybrid candidate windows, and the mixed
search control must miss the saved record before filtered recall is tested.
These checks measure the response contract on a development fixture, not general
answer accuracy or competitor performance.

Useful methods were adapted from [gbrain-evals](https://github.com/garrytan/gbrain-evals) (strict evidence and lifecycle controls), [Mem0 memory-benchmarks](https://github.com/mem0ai/memory-benchmarks) (long-history coverage), [DolphinBench](https://github.com/mem0ai/dolphinbench) (memory-to-action checks), and [Supermemory MemoryBench](https://github.com/supermemoryai/memorybench) (provider separation and per-case reporting). This is an independent implementation, not an official run of those suites.

A public competitive claim requires the same dataset revision and split, ingestion semantics, context budget, reader model/prompt, judge/rubric, retries and failure accounting across systems. Publish full per-case receipts, operational failure rates, phase costs and paired uncertainty estimates. Keep development tuning separate from held-out evaluation; freeze configuration before the held-out run. A tie or a small selected slice does not establish leadership. Vendor headline answer scores cannot be compared with these retrieval scores.

Next evaluation layers are a neutral fixed reader/judge, matched competitor adapters, capture-based coding tasks, and BEAM long-history stress. They remain unmeasured until their complete paths actually run.

To add an adapter, implement `Adapter<State>` in `runner/types.ts` and register it in `runner/cli.ts`. `init` receives only projected session fields and non-secret configuration; `query` receives the question and optional question date. Return actual retrieved text and source IDs. Clean partially initialized resources before throwing from `init`, and implement `teardown` for successful initialization. Configuration is recorded in receipts, so never put credentials there.
