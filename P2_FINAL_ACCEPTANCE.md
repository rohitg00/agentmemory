# P2 Recall Observability — Final Acceptance (基于 `1eee93a`)

日期：2026-07-13  
当前验收提交：`63e795c` (`test(recall): add end-to-end benchmark runner`)

## Gate summary

| Gate | Result | Evidence |
|---|---|---|
| Recall Core / scope / budget / ledger | PASS | `39 passed` in the P2-targeted suite |
| Build | PASS | `npm run build` exit code 0 |
| Skills | PASS | `npm run skills:check` — 17 skills |
| Sanitized benchmark | PASS | hit rate 1.0000, precision 0.8421, contamination 0, average 57.07 tokens, duplicate 0, stale 0, budget violations 0 |
| Runtime restart / health | PASS | current runtime on 3111; `/agentmemory/livez` 200; `/agentmemory/health` healthy, connected, v0.9.27 |
| Source/build identity | PASS | `dist/build-info.json`: sourceCommit `63e795c93b47a8e943ca5bbeaab30b955964a177`, sourceDirty false, artifactHash `64695515f8820b6615c9b50232b8f3432d927ff46d1f40328b13d28486c3b39f` |
| Full `npm test` | BLOCKED | 1,409 passed / 40 failed; failures are pre-existing Windows/path/connector/environment classes, see below |
| Build-info REST endpoint | BLOCKED | `/agentmemory/build-info` returns 404; local build-info artifact is present |
| Final release tag | NOT CREATED | release gate is not fully green |

## Commands

```text
npm run build
npm run skills:check
npx vitest run test/cross-project-isolation.test.ts test/agent-isolation-search.test.ts \
  test/enrich-project-isolation.test.ts test/recall-core.test.ts \
  test/recall-config.test.ts test/circuit-breaker.test.ts \
  test/vector-retrieval-health.test.ts
npm run bench:recall -- --json
npm test
git diff --check
```

The benchmark runner is `eval/recall/runner.ts` and uses the production `RecallCore` with an isolated in-memory KV store and sanitized fixtures. It writes project-scoped PPS7000/GAT memories, a user preference, and an unknown legacy memory. It emits 15 trace IDs per run.

Benchmark trace IDs from the accepted run include:

```text
rtr_mri0zj9s_660c1ef46e87
rtr_mri0zj9t_566511e82911
rtr_mri0zj9u_366f69d18f9d
rtr_mri0zj9u_c223125b7a71
rtr_mri0zj9v_cfd3d78d8a32
rtr_mri0zj9v_c86eb703ed54
rtr_mri0zj9v_fffb78273327
rtr_mri0zj9w_3008ca138f41
rtr_mri0zj9w_8685051e0a78
rtr_mri0zj9x_849f8c873b23
rtr_mri0zj9x_94386338e5e8
rtr_mri0zj9x_a8843b02315c
rtr_mri0zj9x_eea5ebcb64dc
rtr_mri0zj9y_3bbd2df31708
rtr_mri0zj9y_5765f74c4a22
```

## Live scope smoke

After stopping the stale AgentMemory chain (PID 3892/37836) and restarting the current build, the canonical runtime registered successfully on 3111/3112/49134. Temporary live memories were deleted after the smoke.

| Case | Trace | Result |
|---|---|---|
| PPS7000 positive | `rtr_mri1c5cx_f869f4a6060b` | PPS memory selected; unrelated GAT/user/observation candidates dropped by scope; 42 tokens |
| GAT positive | `rtr_mri1c5im_7e064fb6f92e` | GAT memory selected; PPS dropped by scope; 41 tokens |
| GAT query in PPS project | `rtr_mri1c5je_08f47fe8442f` | GAT memory scope-mismatch dropped; no cross-project GAT injection |
| User preference in GAT | `rtr_mri1c5k0_21a3d3a979ee` | user-scoped preference selected cross-project; 39 tokens |
| Unknown automatic injection | `rtr_mri1c5l4_bc7161220ef1` | unknown legacy memory dropped; automatic injection did not select it |
| Explicit recall/context | `rtr_mri1c5lp_5f5152075e7f` | unknown legacy memory returned when explicitly requested |

All live traces reported `vector: degraded`, `fallback: BM25/graph`, reason `vector index is unavailable`, and used estimator `conservative-unicode@1 (estimated=true)`. This matches the observed OpenAI embedding 429/quota warning in the runtime log; no hybrid claim was made for these traces.

## Full-test failure classification

The 40 full-suite failures were not P2 regressions observed in the targeted suite. They cluster as:

* `windows-path`: hook project basename and Obsidian path assertions;
* `connector-environment`: connect-new-agents and Copilot/Cline host fixtures;
* `env-isolation`: embedding provider and slots flag tests reading the host environment;
* `symlink-capability`: Windows symlink/TOCTOU tests;
* `known-preexisting`: plaintext HTTP integration fixture and related baseline assumptions.

These need a separate Windows baseline cleanup before the P2 release gate can be closed. No final tag was created.

## Remaining limitations

* `/agentmemory/build-info` is not currently registered; verification uses `dist/build-info.json` and the runtime `/health` version.
* Health currently exposes the provider circuit breaker but not a top-level vector retrieval status; the authoritative degraded/fallback state is present in every recall trace and Viewer trace row.
* The trace item schema does not carry a dedicated scope field; scope decisions are recorded in the item reason and `scope_mismatch` decision.
* `reservedBootstrapTokens` is configured and the bootstrap/semantic budgets are separated, but the core does not yet borrow unused bootstrap quota dynamically.
* No `memory_why` MCP function is registered; `/agentmemory/recall/debug/:traceId` is the supported equivalent.

Because these limitations and the full-suite baseline failures remain, `p2-recall-observability-final` must not be created yet.
