# benchmark/

Three kinds of numbers live in this directory:

1. **Quality / retrieval** — `longmemeval-bench.ts`, `quality-eval.ts`,
   `real-embeddings-eval.ts`, `scale-eval.ts`. Recall, precision, token
   savings. Documented in `LONGMEMEVAL.md`, `QUALITY.md`,
   `REAL-EMBEDDINGS.md`, `SCALE.md`.

2. **Load shape** — `load-100k.ts`. p50 / p90 / p99 latency and
   throughput against a running daemon. This is the file you want when
   somebody asks "what's p99 at 100k memories under concurrency 100?".

3. **Resource cost**: `capture-costs.ts`. Disk, resident memory, CPU,
   hook cost, provider calls, agent-visible context and recovery cost of
   the built capture path, each reported separately.

## capture-costs.ts

![Capture costs and crash recovery](../docs/benchmarks/capture-costs.svg)

Runs the built `dist/` artifact (CLI, worker and the bundled hooks in
`dist/hooks/`) in an isolated instance per run: a fresh `HOME`, a fresh
`--data-dir`, REST/streams/viewer on 4900-4902, metrics on 4903, the
engine on 50100 and an in-process fake OpenAI-compatible provider on
4950. It refuses to start if any of those ports is already in use, and it
only signals the processes it spawned (the CLI and its engine). Nothing
here runs in the default test suite.

```bash
npm run build
npm run bench:capture-costs
BENCH_N=10000 BENCH_PROFILES=keyless npm run bench:capture-costs
```

Each `(profile, N)` run goes through the same phases serially: cold start
on an empty store, capture of N observations, quiesce, idle sample,
evidence check, agent-visible context probe, `SIGKILL` of the whole
process tree, recovery boot, evidence check again, graceful stop and a
warm start.

### Profiles

| profile | provider config | automatic processing |
|---|---|---|
| `keyless` | no keys; BM25 only | synthetic compression, no provider calls |
| `embed` | fake embeddings (`BENCH_EMBED_DIMS`, default 768), `OPENAI_API_KEY_FOR_LLM=false` | compression off |
| `embed-llm` | fake embeddings plus fake chat model | `AGENTMEMORY_AUTO_COMPRESS=true` |

Context injection stays at its default (off) for the instance. The probe
turns it on only in the environment of single hook processes to measure
what an agent would receive.

### What it reports

- **Storage**: bytes on disk per state scope, grouped into source,
  summary, index, queue, failed-delivery, diagnostic, config and stream.
  Fixed overhead (empty instance) and growth are separate. The builtin
  queue adapter keeps nothing on disk, so queue and failed-delivery bytes
  read 0 on the file store.
- **Memory and CPU**: process-tree RSS (engine and worker split) sampled
  every 250 ms during capture, at idle, after recovery and after a warm
  start; CPU seconds from `ps` for the capture and recovery windows.
- **Capture**: latency of the real `post-tool-use` hook process for the
  first `BENCH_HOOK_SAMPLE` observations (the hook spawns Node and posts
  to `/agentmemory/observe`), its stdout and stderr bytes, then the
  remaining observations posted to the same endpoint with the same body at
  `BENCH_CONCURRENCY`.
- **Provider calls**: requests, inputs, repeated inputs and returned usage
  counted on the fake server for capture, the context probe, recovery and
  warm start separately. Counters a run cannot observe are `unknown`.
- **Agent-visible context**: bytes and the server's own token estimate
  (`tokens_used`, `tokens`) for `/search` in full, compact and narrative
  formats, `/smart-search` and `/context` at `BENCH_CONTEXT_BUDGET`, plus
  stdout bytes of the `SessionStart` and `PreToolUse` hooks with injection
  off and on. These are server estimates, not provider billing.
- **Recovery and evidence**: time to `livez`, time to the BM25 rebuild log
  line, rebuild duration and doc count, vectors loaded, backfill queued,
  re-embedding requests, logical observation count, keyword hits for a
  per-observation head marker and whether the stored source still holds
  the tail marker (via `/agentmemory/replay/load`). A smaller store that
  lost source fails the invariants.

### Invariants and budgets

Invariants run on every report: the logical observation count equals N
before the kill and after recovery, every sampled source keeps its tail
marker, no observe errors, zero hook stdout with injection off, and the
`/context` estimate stays within the declared cap. A failing invariant
exits 1.

Budgets live in `benchmark/capture-costs-budgets.json`, keyed by profile
and N, separately for storage, memory, latency and context. They were
derived from repeated runs with `BENCH_REPEATS=2
BENCH_WRITE_BUDGETS=<file>`, which takes the worst repeat and applies a
per-metric headroom. Results show pass or fail per budget; set
`BENCH_ENFORCE_BUDGETS=1` to exit 2 on a breach. Budgets are
hardware-bound: re-derive them on the machine that enforces them.

### Knobs

`BENCH_N` (default `100,1000`), `BENCH_PROFILES`, `BENCH_REPEATS`,
`BENCH_OBS_PER_SESSION` (100), `BENCH_HOOK_SAMPLE` (100),
`BENCH_CONCURRENCY` (8), `BENCH_OUTPUT_BYTES` (`400,4000`),
`BENCH_SEED`, `BENCH_EMBED_DIMS` (768), `BENCH_CONTEXT_BUDGET` (2000),
`BENCH_SEARCH_LIMIT` (10), `BENCH_EVIDENCE_SAMPLE` (50), `BENCH_PORT`
(4900), `BENCH_ENGINE_PORT` (50100), `BENCH_FAKE_PORT`, `BENCH_ROOT`,
`BENCH_KEEP=1` (keep data dirs and CLI logs), `BENCH_OUT_DIR`,
`BENCH_BUDGETS` (path or `off`), `BENCH_WRITE_BUDGETS` (derive budgets
from this report), `BENCH_ENFORCE_BUDGETS=1`, `BENCH_MERGE` (comma list
of report JSON files from one commit: merges them, rechecks invariants
and budgets, and renders one table without starting an instance),
`AGENTMEMORY_BENCH_III` (engine binary;
defaults to a binary matching the pinned version in `~/.agentmemory/bin`
or `~/.local/bin`). Tool outputs come from the same `mulberry32` corpus
generator as `load-100k.ts` (`lib/corpus.ts`).

## load-100k.ts

Hand-rolled, dependency-free load harness. Issues real HTTP against a
local agentmemory daemon at `http://localhost:3111`, records per-request
latency with `performance.now()`, and writes a JSON report per run.

### What it measures

For each cell in the matrix `(N, concurrency, endpoint)` it records:

- `p50_ms`, `p90_ms`, `p99_ms` — nearest-rank percentiles.
- `min_ms`, `max_ms`, `ops`, `errors`.
- `throughput_per_sec` — wall-clock ops / sec for that cell.

Default matrix:

- `N` ∈ {1000, 10000, 100000} — number of memories seeded before the
  cell runs.
- `C` ∈ {1, 10, 100} — concurrent in-flight requests during the cell.
- Endpoints under test:
  - `POST /agentmemory/remember`
  - `POST /agentmemory/smart-search`
  - `GET  /agentmemory/memories?latest=true`

Each cell issues `BENCH_OPS=200` requests by default — enough samples
for stable p99 without dragging a 100k-seed run past tens of minutes.

### Why p99 is the number that matters

p50 tells you the median request feels fast. p90 tells you the bulk of
requests feel fast. **p99 tells you the request your tail user hits when
they really need it feels fast.** Capacity planning lives here — if you
want to size a fleet, scale your daemon, or set an SLO, p99 is the
number to plan against. p50 will lie to you.

### Running it

```bash
# 1. Start the daemon however you normally do (npx, Docker, etc.)
npx @agentmemory/agentmemory

# 2. From the repo root, in another shell:
npm run bench:load
```

To override the matrix:

```bash
BENCH_N=1000 BENCH_C=1,10 BENCH_OPS=100 npm run bench:load
```

To have the harness spawn a daemon for the run (after `npm run build`):

```bash
AGENTMEMORY_BENCH_AUTOSTART=1 npm run bench:load
```

Other env knobs (see the file header for the canonical list):

- `AGENTMEMORY_URL` — base URL of the daemon (default
  `http://localhost:3111`).
- `BENCH_SEED` — seed for the `mulberry32` content RNG. Same seed +
  same daemon build = byte-identical seed corpus.
- `BENCH_OUT_DIR` — where the JSON report lands (default
  `benchmark/results/`).

### Where results land

`benchmark/results/load-100k-<short-git-sha>.json`. The harness
`mkdir -p`s the directory. The file has a `schema_version: 1` field so
future format changes don't silently break consumers.

### Content generation is seedable

Synthetic memory content is built from a small noun / verb / concept
vocabulary fed by a `mulberry32(BENCH_SEED)` PRNG. Same seed + same
build = same corpus. The point isn't "realistic" content (there isn't
one realistic content); the point is **reproducibility** — re-running
the harness against the same git sha should give the same content
mixture going in, so latency variance comes from the daemon and not
from JSON payload jitter.

### Publishing numbers per release

The release flow appends a `## Performance` section to `CHANGELOG.md`
referencing the JSON in `benchmark/results/` for that release's git
sha. p99 is the headline number; the JSON is the receipt.
