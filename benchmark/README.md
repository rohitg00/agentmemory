# benchmark/

Two kinds of numbers live in this directory:

1. **Quality / retrieval** — `longmemeval-bench.ts`, `quality-eval.ts`,
   `real-embeddings-eval.ts`, `scale-eval.ts`. Recall, precision, token
   savings. Documented in `LONGMEMEVAL.md`, `QUALITY.md`,
   `REAL-EMBEDDINGS.md`, `SCALE.md`.

2. **Load shape** — `load-100k.ts`. p50 / p90 / p99 latency and
   throughput against a running daemon. This is the file you want when
   somebody asks "what's p99 at 100k memories under concurrency 100?".

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
