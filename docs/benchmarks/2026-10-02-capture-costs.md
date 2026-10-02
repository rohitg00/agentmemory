# 2026-10-02: capture and recovery costs after durable capture

**Commit:** `cd84e423efe3bf46aea6f2a54233116a1219f000` (this bench branch merged with the durable capture and vector durability work). It replaces the 2026-10-01 baseline, which was measured before vectors survived a force-kill.
**Bench:** `npm run bench:capture-costs` (`benchmark/capture-costs.ts`), built `dist/` artifact
**N:** 100 and 1,000 (two repeats each), 10,000 (two repeats each)
**Hardware:** Apple M1 Max, 10 cores, 64 GiB RAM, macOS (Darwin 25.2.0, arm64), Node 22.22.0, iii 0.22.1
**Receipts:** `benchmark/results/capture-costs-cd84e42.json` and `.md` (file and Redis state stores), `benchmark/results/capture-costs-cd84e42-ollama.json` and `.md` (local model run)

Method and profiles are unchanged from the 2026-10-01 report. New in this run: budgets at 10,000, a Redis state store run, a local model run, and a crash-while-offline scenario.

## Budgets

`benchmark/capture-costs-budgets.json` now holds limits for `keyless`, `embed` and `embed-llm` at 100, 1,000 and 10,000 on the file store, and for `keyless@redis` and `embed@redis` at 100 and 1,000. Each limit is the worst of two repeats times the same per-metric headroom as before. All 370 budget checks and all 250 invariant checks pass on the measured commit.

The disk and index limits for the embedding profiles are much higher than on 2026-10-01. That baseline was taken when only about 8% of vectors had reached the index snapshot before the kill; every vector now reaches it, at about 4.1 KB per vector at 768 dimensions.

| budget source (worst of 2 runs) | keyless 1k | embed 1k | embed-llm 1k | keyless 10k | embed 10k | embed-llm 10k |
|---|---|---|---|---|---|---|
| Disk after capture | 3.59 MiB | 7.60 MiB | 6.97 MiB | 32.1 MiB | 72.0 MiB | 69.6 MiB |
| Index bytes | 49 KiB | 4.06 MiB | 4.06 MiB | 501 KiB | 40.5 MiB | 40.5 MiB |
| Peak RSS during capture (engine + worker) | 266 MiB | 298 MiB | 365 MiB | 504 MiB | 675 MiB | 788 MiB |

## Crash while the service is down

`BENCH_SCENARIO=crash-offline` captures through the real `post-tool-use` hook, sends `SIGKILL` to the service halfway through (before the first vector snapshot), keeps the hooks running while it is down so they spool, restarts it and checks the result.

| N | runs | observations after recovery | vectors after recovery | spool left |
|---|---|---|---|---|
| 100 (kill with no settle time) | 2 | 100 / 100 | 100 / 100 | 0 |
| 100 (2.6 s settle before kill) | 2 | 100 / 100 | 100 / 100 | 0 |
| 1,000 (kill with no settle time) | 3 | 1,000 / 1,000 | 1,000 / 1,000 | 0 |

Events accepted just before the kill can be embedded a second time during recovery, so the `recoveryRepeatEmbedInputs` check for this scenario allows up to N.

## Redis state store

`BENCH_STATE_BACKEND=redis` with `BENCH_REDIS_URL` runs the same capture against a local `redis-server` with persistence off. agentmemory writes nothing to its data directory beyond its config; state lives in Redis.

| profile | N | Redis used memory | keys | peak RSS (engine + worker) |
|---|---|---|---|---|
| keyless | 1,000 | 5.1 MiB | 159 | 239 MiB |
| embed | 1,000 | 10.1 MiB | 170 | 279 MiB |

## Local model

`BENCH_PROVIDER=ollama` replaces the fake provider with a local Ollama server (`nomic-embed-text` for embeddings, a 4B qwen3 model for compression in `embed-llm`). These numbers depend on the machine and the model, so they are reported, not enforced.

| profile | N | hook p50 | hook p95 | observe p95 | disk after capture | peak RSS (engine + worker) |
|---|---|---|---|---|---|---|
| embed | 1,000 | 149 ms | 380 ms | 2,492 ms | 7.60 MiB | 269 MiB |
| embed-llm | 1,000 | 190 ms | 391 ms | 395 ms | 4.78 MiB | 186 MiB |

The model's own process memory is not included in the RSS column.

## Reproduce

```sh
npm install
npm run build
BENCH_N=100,1000 BENCH_REPEATS=2 npm run bench:capture-costs
BENCH_N=10000 BENCH_REPEATS=2 npm run bench:capture-costs
BENCH_SCENARIO=crash-offline BENCH_PROFILES=embed BENCH_N=1000 BENCH_KILL_SETTLE_MS=0 npm run bench:capture-costs
BENCH_STATE_BACKEND=redis BENCH_REDIS_URL=redis://127.0.0.1:6379 BENCH_PROFILES=keyless,embed BENCH_N=100,1000 BENCH_REPEATS=2 npm run bench:capture-costs
BENCH_PROVIDER=ollama BENCH_PROFILES=embed,embed-llm BENCH_N=100,1000 npm run bench:capture-costs
```

## Not covered

- Paid embedding and inference providers.
- Budgets above 10,000 and on machines other than the one measured here.
- A CI job. The bench is run by hand before a release.
