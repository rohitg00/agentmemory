# 2026-10-01: capture and recovery costs

**Commit:** `b3d6cf50026655233f11c2273b898af0ca82cf03` (main after #1457). The durable capture work for #1436, #1437 and #1438 lands in a separate PR and is not in this build.
**Bench:** `npm run bench:capture-costs` (`benchmark/capture-costs.ts`), built `dist/` artifact, file state store
**N:** 100, 1,000 (two repeats each) and 10,000 (one run; two for `embed-llm`)
**Hardware:** Apple M1 Max, 10 cores, 64 GiB RAM, macOS (Darwin 25.2.0, arm64), Node 22.22.0, iii 0.22.1
**Providers:** none for `keyless`; a local fake OpenAI-compatible server for `embed` (768-dimension deterministic hash vectors) and `embed-llm` (same vectors plus a fake chat model with `AGENTMEMORY_AUTO_COMPRESS=true`). No real model was called.
**Receipts:** `benchmark/results/capture-costs-b3d6cf5.json` (every number below) and `benchmark/results/capture-costs-b3d6cf5.md` (per-run tables).

## Method

Each `(profile, N)` run gets a fresh `HOME`, a fresh `--data-dir`, REST on 4900, engine on 50100 and its own fake-provider counters. Runs are serial. The corpus is the seeded `mulberry32` generator shared with `load-100k.ts`: 100 observations per session, tool outputs of 400 to 4,000 bytes with a unique head and tail marker, unique tool inputs. The first 100 observations of every run go through the bundled `post-tool-use` hook process; the rest are posted to `/agentmemory/observe` with the same body at concurrency 8.

After capture the harness waits for provider calls and disk writes to stop, samples idle RSS, checks evidence, probes agent-visible context, sends `SIGKILL` to the CLI and engine, boots again, checks evidence again, stops gracefully and boots once more (warm start). Context injection and automatic compression keep their default-off setting except in `embed-llm`, where automatic compression is the variable under test. Injection is switched on only in the environment of single hook processes to measure what an agent would receive.

Per-observation numbers below describe the measured sizes only. They do not support a linear projection beyond 10,000 records.

## Budgets

The budgets file is `benchmark/capture-costs-budgets.json`. It holds separate storage, memory, latency and context limits per profile at N = 100 and 1,000. Each limit is the worst of two repeats times a per-metric headroom (1.2 for disk and context bytes, 1.25 for RSS, 2 to 3 for latency), with a floor so tiny values do not alert on noise. The 10,000 baseline has no budget yet: one run per profile is not a repeatable measurement. All 162 budget checks pass on the measured commit.

| budget | keyless 1k | embed 1k | embed-llm 1k |
|---|---|---|---|
| Disk after capture | 4.27 MiB | 4.70 MiB | 3.96 MiB |
| Disk growth per observation | 4,467 B | 4,917 B | 4,144 B |
| Index bytes after capture | 61.5 KiB | 525 KiB | 550 KiB |
| Peak RSS during capture (engine + worker) | 304 MiB | 307 MiB | 350 MiB |
| Idle RSS after capture | 304 MiB | 301 MiB | 346 MiB |
| Hook p95 | 250 ms | 250 ms | 250 ms |
| Observe p95 at concurrency 8 | 150 ms | 151 ms | 150 ms |
| Recovery to `livez` | 3,000 ms | 3,000 ms | 3,000 ms |
| `/search` full response p50 | 10.2 KiB | 10.2 KiB | 7.7 KiB |
| `/search` compact server tokens p50 | 681 | 663 | 834 |
| `SessionStart` stdout with injection on | 5,266 B | 5,266 B | 6,968 B |

Invariants are not budgets and have no headroom: the logical observation count equals N before the kill and after recovery, every sampled source keeps its tail marker, observe returns no error, hooks print nothing with injection off, the `/context` estimate stays within the declared 2,000-token cap, and vector documents after recovery equal the count before the kill.

## Measured envelope

Ranges are min to max across repeats.

### Storage

| profile | N | on disk after capture | source | index | stream | diagnostic | growth / obs |
|---|---|---|---|---|---|---|---|
| keyless | 100 | 0.38 MiB | 0.29 MiB | 0.01 MiB | 0.08 MiB | 4 KiB | 3,971 B |
| keyless | 1,000 | 3.56 MiB | 3.08 MiB | 0.05 MiB | 0.43 MiB | 4 KiB | 3,722 B |
| keyless | 10,000 | 32.05 MiB | 31.12 MiB | 0.49 MiB | 0.43 MiB | 4 KiB | 3,360 B |
| embed | 1,000 | 3.91 MiB | 3.07 MiB | 0.40 MiB | 0.42 MiB | 4 KiB | 4,093 B |
| embed | 10,000 | 32.37 MiB | 31.10 MiB | 0.83 MiB | 0.43 MiB | 4 KiB | 3,394 B |
| embed-llm | 1,000 | 3.30 MiB | 2.86 MiB | 0.43 MiB | 0 | 4 KiB | 3,449 B |
| embed-llm | 10,000 | 29.9 MiB | 29.02 MiB | 0.86 to 0.89 MiB | 0 | 4 KiB | 3,135 B |

- Fixed overhead of an empty instance is 5.8 to 6.1 KiB.
- Source (`mem:obs:*` plus sessions) is the largest category in every run: 76 to 87 percent at 100 and 1,000 for keyless and 97 percent at 10,000 for every profile. The first vector checkpoint lowers the share at small N (39 percent for `embed` at 100). Index bytes are the BM25 session shards plus whatever vector buckets were checkpointed.
- With embeddings on, the on-disk index after capture is not the steady state. The first vector checkpoint writes about 90 vectors; the next one is due after `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS` (600 s by default), which no run reached. Checkpoints written later measure about 4.1 KiB per 768-dimension vector (2.4 MiB for 589 vectors at 1k, 2.8 MiB for 591 at 10k).
- Queue and failed-delivery bytes are 0 on the file store: the builtin queue adapter keeps nothing on disk. The viewer stream file holds about 0.43 MiB at 1k and 10k; the `embed-llm` runs wrote no stream file.

### Resident memory and CPU (engine + worker)

| profile | N | empty idle | capture peak | engine peak | worker peak | idle after capture | after recovery | capture CPU |
|---|---|---|---|---|---|---|---|---|
| keyless | 100 | 167 MiB | 182 to 204 MiB | 55 to 56 MiB | 127 to 151 MiB | 163 to 182 MiB | 157 to 190 MiB | 0.8 to 1.0 s |
| keyless | 1,000 | 167 MiB | 236 to 243 MiB | 80 to 82 MiB | 160 to 163 MiB | 236 to 243 MiB | 222 to 225 MiB | 5.6 to 6.2 s |
| keyless | 10,000 | 167 MiB | 419 MiB | 193 MiB | 229 MiB | 412 MiB | 384 MiB | 51.4 s |
| embed | 1,000 | 166 MiB | 240 to 246 MiB | 78 to 79 MiB | 162 to 168 MiB | 240 to 241 MiB | 227 to 256 MiB | 6.4 to 6.5 s |
| embed | 10,000 | 167 MiB | 452 MiB | 181 MiB | 271 MiB | 452 MiB | 401 MiB | 57.9 s |
| embed-llm | 1,000 | 167 MiB | 272 to 280 MiB | 78 to 80 MiB | 192 to 202 MiB | 272 to 277 MiB | 179 to 245 MiB | 7.8 to 7.9 s |
| embed-llm | 10,000 | 168 MiB | 641 to 673 MiB | 272 to 313 MiB | 362 to 369 MiB | 631 to 673 MiB | 369 to 371 MiB | 69.9 to 70.1 s |

- RSS does not return to the empty baseline after capture. At 10k with automatic compression on, idle RSS stays at 631 to 673 MiB until a restart, which brings it to about 370 MiB.
- The fake provider runs inside the harness process and is not part of these numbers. A real local inference process would be additional.

### Capture latency and hook output

| profile | N | hook p50 | hook p95 | hook stdout | observe p50 | observe p95 | observe p99 |
|---|---|---|---|---|---|---|---|
| keyless | 1,000 | 54 to 59 ms | 59 to 65 ms | 0 B | 29 to 32 ms | 41 to 49 ms | 47 to 56 ms |
| embed | 1,000 | 55 to 56 ms | 58 to 59 ms | 0 B | 36 ms | 49 to 50 ms | 57 to 58 ms |
| embed-llm | 1,000 | 53 to 54 ms | 55 to 57 ms | 0 B | 36 ms | 48 ms | 56 ms |
| keyless | 10,000 | 54 ms | 56 ms | 0 B | 29 ms | 43 ms | 48 ms |
| embed-llm | 10,000 | 52 to 57 ms | 57 to 62 ms | 0 B | 35 to 36 ms | 51 to 52 ms | 59 to 61 ms |

Hook latency is the wall time of the hook process, which is mostly Node start. It is flat from 100 to 10,000 records.

### Startup and recovery

| profile | N | cold ready | warm ready | recovery ready | BM25 rebuild | recovery index ready | vectors before / after kill | re-embedded on recovery |
|---|---|---|---|---|---|---|---|---|
| keyless | 1,000 | 1.15 to 1.23 s | 0.83 to 0.85 s | 0.83 to 1.05 s | 153 to 161 ms | 1.03 to 1.05 s | n/a | 0 |
| keyless | 10,000 | 1.68 s | 0.83 s | 1.05 s | 1,387 ms | 2.38 s | n/a | 0 |
| embed | 1,000 | 1.23 s | 0.82 to 0.85 s | 0.85 to 1.05 s | 149 to 150 ms | 1.05 s | 1,000 / 91 or 589 | 0 or 500 |
| embed | 10,000 | 1.28 s | 0.85 s | 1.06 s | 1,392 ms | 2.38 s | 10,000 / 591 | 500 |
| embed-llm | 1,000 | 1.27 to 1.37 s | 0.83 to 0.85 s | 0.97 s | 72 to 74 ms | 0.97 s | 1,000 / 93 or 595 | 0 or 500 |
| embed-llm | 10,000 | 1.25 to 1.67 s | 0.83 to 0.85 s | 0.87 to 0.98 s | 638 to 643 ms | 1.57 to 1.59 s | 10,000 / 588 to 595 | 500 |

- Observations and source survive a force-kill at every size: logical count and all sampled tail markers match before and after.
- Vectors do not. A kill after quiescence loses every vector written after the first checkpoint. One boot then either re-embeds up to 500 (16 provider requests) or queues nothing and reports that a full backfill needs `AGENTMEMORY_VECTOR_BACKFILL=all`. Which branch runs varied between repeats of the same configuration. The following warm start did not resume the remaining backfill in any run.
- Recovery embedding requests are the only provider calls on restart. Warm starts made none.

### Provider usage

| profile | N | embedding requests (repeats) | chat requests (repeats) | chat prompt tokens | chat completion tokens |
|---|---|---|---|---|---|
| embed | 1,000 | 1,000 (0) | 0 | 0 | 0 |
| embed-llm | 1,000 | 1,000 (0) | 1,000 (0) | 912,430 | 124,107 |
| embed-llm | 10,000 | 9,999 to 10,000 (0) | 9,999 to 10,000 (0) | 9.21 M | 1.25 M |

Token counts are the fake server's `ceil(chars / 4)`, returned as `usage`, so they track prompt size, not a provider's tokenizer. Each query-side search also embeds the query: the context probe made 33 embedding requests per run.

### Agent-visible context

| profile | N | `/search` full | compact | narrative | `/smart-search` | `/context` (cap 2,000) | `SessionStart` stdout on | `PreToolUse` stdout on |
|---|---|---|---|---|---|---|---|---|
| keyless | 1,000 | 8.5 KiB, 2,882 tok | 1.7 KiB, 567 tok | 9.9 KiB, 1,918 tok | 1.7 KiB | 4.4 KiB, 1,456 tok | 4,388 B | 2,197 B |
| embed-llm | 1,000 | 6.4 KiB, 2,159 tok | 2.1 KiB, 695 tok | 4.9 KiB, 1,082 tok | 2.1 KiB | 5.8 KiB, 1,934 tok | 5,806 B | 664 B |
| keyless | 10,000 | 8.5 KiB, 2,888 tok | 1.8 KiB, 575 tok | 9.9 KiB, 1,922 tok | 1.7 KiB | 4.4 KiB, 1,455 tok | 4,386 B | 2,217 B |

Search responses use `limit: 10` and are p50 over eight seeded queries. Token figures are the server's own estimate (`ceil(JSON length / 3)` for search, `ceil(chars / 3)` for context), not provider billing. Response size does not grow with the store from 1k to 10k because the result count is fixed. With injection off, every hook printed 0 bytes in every run.

## Findings

1. Vector recovery after a crash is partial and nondeterministic on this build: 10,000 vectors before the kill, 588 to 595 after one boot, and no further progress on the next boot. The invariant `vectorDocumentsAfterRecovery` fails for every embedding run at 1k and 10k.
2. Duplicate tool inputs are dropped silently. An earlier pass of this harness reused tool inputs within a session and lost 30 of 100 hook captures and 168 of 900 REST captures: `mem::observe` deduplicates on session, tool and the first 500 characters of the input for five minutes, regardless of output. The hook reports nothing. The published corpus uses unique inputs so the numbers above measure capture, not deduplication.
3. One `embed-llm` 10k run returned 8 observe errors and took 131 s to capture, while its logical count still reached 10,000 and only 9,999 observations reached the index. A second run had no errors and took 48 s. The harness now records error samples. A client that saw an error for a stored observation cannot tell whether to retry.
4. RSS after automatic compression at 10k stays about 300 MiB above the post-restart level.

## Reproduce

```sh
git checkout b3d6cf50026655233f11c2273b898af0ca82cf03
npm install
npm run build
BENCH_N=100,1000 BENCH_REPEATS=2 npm run bench:capture-costs
BENCH_N=10000 npm run bench:capture-costs
```

The harness needs iii 0.22.1 in `~/.agentmemory/bin`, `~/.local/bin` or `AGENTMEMORY_BENCH_III`, and free ports 4900-4903, 4950 and 50100.

## Not covered yet

- A kill during capture, before the first vector checkpoint (the boundary in #1439), and a service-down capture window (#1436). Both need the durable capture work first.
- The Redis state backend and real embedding or inference providers. Their resource use belongs in a separately identified job.
- Budgets at 10,000 and runs above 10,000. Those wait for repeated 10k measurements on the machine that enforces them.
