# Changelog

All notable changes to agentmemory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.6] — 2026-05-10

Three reliability fixes that close field-reported regressions in v0.9.5: search/recall returns saved memories again, the standalone MCP shim no longer caps non-Claude clients at a 7-tool subset, and the Claude Code session/subagent hooks no longer block agent startup for up to five seconds against a slow or unreachable REST server.

### Fixed

- **`memory_smart_search` and `memory_recall` surface memories saved via `memory_save` again.** v0.9.5 indexed memories into BM25 (#258), so search ranked them correctly — but the result-enrichment step on both retrieval paths still queried `KV.observations(sessionId, obsId)`. Memories live in `KV.memories` under a synthetic sessionId, so every hit was silently dropped and clients saw `results: []`. Both `HybridSearch.enrichResults` (which powers `/smart-search`) and `mem::search`'s observation map (which powers `/search` / `memory_recall`) now fall back to `KV.memories` when the observation lookup misses, coercing the `Memory` record into a `CompressedObservation` via a new shared `memoryToObservation` helper in `src/state/memory-utils.ts`. Verified live end-to-end against an iii-engine 0.11.2 stack: pre-fix both endpoints returned `[]` for a saved memory; post-fix the memory surfaces with `score > 0` on both. (#269, closes [#265](https://github.com/rohitg00/agentmemory/issues/265))

- **`@agentmemory/mcp` standalone shim now exposes the server's full tool surface to non-Claude clients.** With `AGENTMEMORY_TOOLS=all` on the server, OpenCode / Cursor / Gemini CLI / Cline users expected 51 tools; the shim filtered the response through a hardcoded 7-tool `IMPLEMENTED_TOOLS` set baked in for the local InMemoryKV fallback, so they got 4 (default) or 7 (with the env var). The shim now delegates `tools/list` to `GET /agentmemory/mcp/tools` when an agentmemory server is reachable, and forwards any non-essential tool to `POST /agentmemory/mcp/call` for server-side validation. The local InMemoryKV fallback is unchanged — it still implements only the 7 essential tools, with a clearer error pointing to `AGENTMEMORY_URL` when no server is reachable. Verified live end-to-end via stdio JSON-RPC driver: pre-fix `tools/list` returned 4 tools and `memory_lesson_save` raised "Unknown tool"; post-fix `tools/list` returned 51 and `memory_lesson_save` created a lesson. (#270, closes [#234](https://github.com/rohitg00/agentmemory/issues/234))

- **Claude Code session/subagent hooks no longer block agent startup waiting for a slow agentmemory.** `session-start.ts` awaited a 5000 ms POST and discarded the response whenever `AGENTMEMORY_INJECT_CONTEXT=false` (the default since 0.8.10) — pure latency. `subagent-start.ts` had a `// fire and forget` comment but the code awaited a 2000 ms POST. Under fan-out (Slack-bot orchestrators, multi-agent harnesses, fanned `claude -p` jobs) the awaited timeouts stack and feed back into the engine; the reporter hit a positive feedback loop that OOM-killed iii-engine. `session-start` now fire-and-forgets on the telemetry path and caps the inject path at 1500 ms (down from 5000 ms). `subagent-start` actually fire-and-forgets, capped at 800 ms. Verified live against a black-hole TCP listener (accepts, never replies): session-start (no inject) 5.05 s → 0.85 s, session-start (inject=true) 5.05 s → 1.55 s, subagent-start 2.05 s → 0.87 s. (#271, closes [#221](https://github.com/rohitg00/agentmemory/issues/221))

### Changed

- `@agentmemory/mcp` package version bumped from 0.9.4 → 0.9.6 to lockstep with the main package, fixing a release-flow miss in v0.9.5.

## [0.9.5] — 2026-05-09

Bug-fix patch focused on **search recall correctness** and **plugin compatibility**. Pins `iii-engine` to v0.11.2 because v0.11.6 introduces a new sandbox-everything-via-`iii worker add` model that agentmemory hasn't been refactored for yet — pin lifts once that refactor lands. Adds a hard guard against silent vector-index corruption, fixes BM25 indexing for memories saved via `memory_save`, and lands four Hermes plugin fixes that make the memory provider actually usable end-to-end.

If you've been seeing `memory_smart_search` return empty results for memories you just saved, this release fixes that. If you've been hitting `hermes memory status` reporting "not available" against a healthy systemd-managed install, this release fixes that too.

### Fixed

- **BM25 search now indexes memories saved via `memory_save`.** `mem::remember` was writing to `KV.memories` but never calling `getSearchIndex().add()`, so `memory_smart_search` and `memory_recall` returned empty for everything saved through that path — for **every** version since v0.9.0. Synthesizes a `CompressedObservation` from the saved Memory (title + content + concepts + files) and adds it to BM25 right after the durable write. `rebuildIndex()` now walks `KV.memories` so a fresh rebuild covers the full corpus, and a startup backfill retroactively indexes pre-existing memories on first start after upgrade — no manual reindex required. New `SearchIndex.has(id)` is the idempotency gate. (#258, closes [#257](https://github.com/rohitg00/agentmemory/issues/257) — thanks @Nizar-BenHamida for the precise repro and log capture)

- **Embedding providers no longer silently corrupt the vector index when an API returns wrong-dimension vectors.** `cosineSimilarity` returns `0` on length mismatch instead of throwing, so a wrong-size vector got stored, never matched anything, and the corresponding memory became invisible without a single log line. `withDimensionGuard()` now wraps every embedding provider at the factory boundary in `src/providers/embedding/index.ts` — `embed()`, `embedBatch()` (per-vector, indexed errors like `embedBatch[3]`), and `embedImage()` all throw a descriptive error when the returned `Float32Array` length doesn't match `provider.dimensions`. The persistence-restore path got the same defense: `IndexPersistence.load()` now refuses to start when persisted vectors mismatch the active provider, with an actionable error spelling out the recovery paths (re-embed / `AGENTMEMORY_DROP_STALE_INDEX=true` / switch back). (#248, closes [#247](https://github.com/rohitg00/agentmemory/issues/247) and [#256](https://github.com/rohitg00/agentmemory/issues/256) — thanks @AmmarSaleh50 for the issue analysis, the fix PR, and the test coverage)

- **Hermes plugin: `handle_tool_call` now returns JSON strings, not raw Python dicts.** Hermes stores the return value as the tool result `content` field in session history. Anthropic-protocol providers reject non-string content with a 400 on the next request — once triggered, every subsequent request in the affected session 400s until the session JSON is hand-cleaned. Wrapped all four return paths (`memory_recall`, `memory_save`, `memory_search`, unknown-tool) in `json.dumps()` and tightened the return-type annotation `Any → str` on both the abstract base and the concrete class. Matches the contract that `src/mcp/standalone.ts` already honors. (#255, closes [#254](https://github.com/rohitg00/agentmemory/issues/254) — thanks @KyoMio for the Anthropic-protocol-specific repro)

- **Hermes plugin: `hermes memory status` now reflects the real service state on systemd / launchd installs.** When agentmemory runs as an external service whose runtime config lives in `~/.agentmemory/.env`, those values never reach the Hermes CLI shell. Hermes status reads `os.environ` against `get_config_schema()`'s `env_var` keys, finds them unset, and reports the plugin as "not available" — even though the service is healthy. The plugin now preloads `~/.agentmemory/.env` at import time using `os.environ.setdefault`, bridging the agentmemory-managed and Hermes-managed config source-of-truths. Anything explicitly exported in the shell still wins. Best-effort: malformed / absent file is silently skipped. Both `~/.agentmemory/.env` and `$XDG_CONFIG_HOME/agentmemory/.env` are checked. (#253, closes [#250](https://github.com/rohitg00/agentmemory/issues/250) — thanks @OptionalCoin for the systemd repro and tracing it to env-source divergence)

- **Hermes plugin: memory provider hooks accept passthrough kwargs.** Hermes calls memory provider hooks with extra context kwargs (e.g. `session_id`) at runtime that the existing strict signatures rejected with `sync_turn() got an unexpected keyword argument 'session_id'`. Hooks "succeeded" from Hermes's perspective but every conversation turn silently failed sync. Added `**kwargs: Any` to `sync_turn`, `on_session_end`, `on_pre_compress`, `on_memory_write`, `prefetch`, `queue_prefetch`, and `shutdown`. Where Hermes passes `session_id`, the patch prefers it over the cached `self._session_id` so multi-session gateway contexts route to the right session. Same change applied to the abstract `MemoryProvider` fallback for the import-error path. (#252, closes [#249](https://github.com/rohitg00/agentmemory/issues/249) — thanks @OptionalCoin for the precise log analysis)

- **`agentmemory demo` now actually seeds observations.** `seedDemoSession` posted to `/agentmemory/observe` without `project` and `cwd`, which the API requires as non-empty strings, so every observation 400'd and the demo silently reported "Seeded 0 observations across 3 sessions". Two-line fix: re-stage `project` + `cwd` into the observe payload alongside `sessionId`. The smart-search queries the demo prints will now return real hits. (#251, closes [#229](https://github.com/rohitg00/agentmemory/issues/229) — thanks @seishonagon for the precise root-cause analysis)

- **LLM compression / summarization timeouts increased.** Larger sessions were hitting the 120s consolidation timeout under heavier workloads, leaving partial state. Bumped per-step ceilings to give slow providers (esp. local models) room to finish. (#213 — thanks @xuli500177)

- **`pi` / OpenClaw / Hermes integration fixes.** Tested round-trip fixes across the three integration plugins to keep them aligned with the latest hooks contract. (#230 — thanks @deepmroot)

### Changed

- **`iii-engine` pinned to v0.11.2 across every install path.** v0.11.6 introduces a new architecture where workers run inside sandboxed microVMs registered via `iii worker add`. agentmemory still uses the older `iii-exec watch + node dist/index.mjs` worker model from `iii-config.yaml`, which doesn't pass the new engine's stricter trigger validation cleanly — the worker drops into an EPIPE reconnect loop and recall stops working. Pinning to v0.11.2 (the last engine that runs agentmemory's current architecture cleanly) until we refactor agentmemory to register itself via `iii worker add` and run inside the new sandbox model.
  - `src/cli.ts` auto-installer downloads `github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-<arch>.tar.gz` directly. Per-arch coverage: darwin arm64/x64, linux x64/arm64/armv7, win32 x64/arm64.
  - Docker fallback pulls `iiidev/iii:0.11.2` instead of `:latest`.
  - `docker-compose.yml` uses `image: iiidev/iii:${AGENTMEMORY_III_VERSION:-0.11.2}` so the override env var actually takes effect for compose users.
  - Install instructions and Windows guide updated to point at the v0.11.2 release page.
  - **Escape hatch:** `AGENTMEMORY_III_VERSION=<version>` overrides the pin for users who've moved to the sandbox model manually.
  - Windows ZIP path detection in `runUpgrade` so the auto-installer doesn't try to pipe a `.zip` through `tar -xz`. (#260)
  - **Follow-up tracked separately:** refactor agentmemory to register as a sandboxed worker via `iii worker add` so the pin can be lifted.

- **README documents how to extend agentmemory with `iii worker add`.** New "Powered by iii" section maps each `iii worker add <name>` to a concrete agentmemory capability — multi-instance memory, scheduled consolidation, durable retries on embeddings, sandboxed code exec, SQL state, extra MCP host. Lists only workers actually published to [workers.iii.dev](https://workers.iii.dev) with direct links. (#242)

- **README iii Console section corrected.** The console ships with `iii` as a subcommand; there's no separate installer. Replaced the bogus `curl install.iii.dev/console/main/install.sh` line, simplified the launch command to `iii console --port 3114`, and added the missing console pages to the capability table (Workers, Queues, Config, Flow). Replaced the dashboard screenshot with the Workers page so users see real agentmemory instances connected. (#243)

### Notes

If you're upgrading from <0.9.5 and have an existing vector index on disk, the new dim-guard will refuse to load if your active embedding provider declares a different dimension than what's persisted. This is the intended safe default — set `AGENTMEMORY_DROP_STALE_INDEX=true` to discard and rebuild from live observations, or re-embed against the new provider before starting.

If you've been on `iii-engine` v0.11.6 and noticed search returning empty after save, install agentmemory 0.9.5 fresh (or run `npx @agentmemory/agentmemory upgrade`) to pull pinned engine v0.11.2. v0.11.6 brings a new sandbox-everything-via-`iii worker add` model that agentmemory hasn't been refactored for yet — that work is tracked as a follow-up; this release just keeps existing users unblocked.

[0.9.6]: https://github.com/rohitg00/agentmemory/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/rohitg00/agentmemory/compare/v0.9.4...v0.9.5

## [0.9.4] — 2026-04-29

Bug-fix patch. Fixes a silent gap where the knowledge graph never auto-populated despite `GRAPH_EXTRACTION_ENABLED=true`, and adds a doctor check that detects when Claude Code fails to load plugin hooks.

### Fixed

- **`mem::graph-extract` now auto-fires at session end.** When `GRAPH_EXTRACTION_ENABLED=true`, the function was registered and the REST endpoint was live, but no internal caller invoked it — the graph KV stayed empty unless users manually `POST`ed to `/agentmemory/graph/extract`. `event::session::stopped` now triggers it (fire-and-forget, idempotent via existing node/edge merge keys), so enabling the flag actually populates the graph. README pipeline diagram updated to show graph extraction at the Stop/SessionEnd phase rather than implying it runs per PostToolUse. (#210)

### Added

- **`agentmemory doctor` detects Claude Code plugin-hook load state.** Scans `~/.claude/debug/latest` for the `Loaded hooks from standard location for plugin agentmemory` line. Surfaces the silent failure mode where the plugin is enabled but Claude Code never registered the hooks — users previously got no signal, hooks just silently did nothing. Hint points at reinstall + session restart and the CC version floor (>= 2.1.x). Skips silently when `~/.claude/debug` is absent. (refs #212)

[0.9.4]: https://github.com/rohitg00/agentmemory/compare/v0.9.3...v0.9.4

## [0.9.3] — 2026-04-24

Developer-experience patch. Every disabled feature flag is now visible in the viewer, the CLI, and REST error responses, so devs no longer hit empty tabs wondering whether the install is broken or just opt-in. Adds a `doctor` command that diagnoses the whole stack in one shot and a first-run hero in the viewer that points at the magical-moment `demo` command.

### Added

- **`agentmemory doctor` command.** Runs 10 diagnostic checks in one shot: server reachability, health status, viewer port, LLM provider, embedding provider, four feature flag states, and whether the knowledge graph has data. Every failing check includes a concrete hint with the exact env var or command to fix it. Mirrors the shape of the new viewer feature-flag banners.
- **`/agentmemory/config/flags` REST endpoint.** Returns `{ version, provider, embeddingProvider, flags[] }` with per-flag `{ key, label, enabled, default, affects, needsLlm, description, enableHow, docsHref }`. Used by the viewer banner, CLI status/doctor, and anyone who wants to introspect config without parsing logs.
- **Viewer feature-flag banner system.** Compact collapsible summary row at the top of every tab (`⚠ 3 off · ⚙ 1 note · Feature flags — click to expand`). Expanded view shows per-flag card with description, exact enable command, docs link, and dismiss button. Dismissed state persists per-flag in localStorage so banners stay out of the way once acknowledged. Banners filter by the current tab's `affects` list.
- **Viewer first-run hero card.** When `sessions.length === 0`, dashboard renders an orange-accent card titled "First run → magical moment in 10 seconds" with `npx @agentmemory/agentmemory demo` as the next step. Removes the dead-empty dashboard that used to greet fresh installs.
- **Viewer footer with preset issue report.** `agentmemory viewer · v{version} · github · docs · report issue →`. The feedback link opens a GitHub issue pre-filled with version, provider name, embedding provider, flag state, and user-agent — so the first message on an issue already contains the diagnostic context that used to take three back-and-forths.
- **Richer empty states on Actions, Memories, Lessons, Crystals tabs.** Each now has a titled lead explaining what the tab is for, why it's empty, three concrete ways to populate it (MCP tool, curl, hook), and a docs link. The old one-liners ("No actions yet. Create actions via memory_action_create MCP tool") assumed too much context.
- **`status` command shows flag state.** New section in the output block lists provider (`✓ llm` / `✗ noop`), embedding provider (`✓ embeddings` / `bm25-only`), and each flag with a tick/cross. Parity with the viewer banner.
- **`AGENTMEMORY_URL` environment variable honored by CLI.** `status`, `doctor`, and related health checks now respect `AGENTMEMORY_URL=http://host:port` and extract the port from it. Previously documented but silently ignored; `--port N` was the only way to override.
- **Website install section promotes `demo` to step 2.** `npx @agentmemory/agentmemory demo` now appears between "start server" and "open viewer" on agent-memory.dev. The magical-moment command is on the critical path of the three-step install, not tucked into the README.
- **Website version auto-derived from repo package.json.** `gen-meta.mjs` picks up `src/version.ts` on `prebuild` and writes `website/lib/generated-meta.json`. Removes the stale-version drift that showed `v0.9.1` on the landing page after `v0.9.2` shipped.

### Changed

- **REST "feature not enabled" errors now return structured bodies.** Graph extraction (3 endpoints) and consolidation pipeline (1 endpoint) used to return `{ error: "Knowledge graph not enabled" }`. Now return `{ error, flag, enableHow, docsHref }` matching the viewer banner contract. Curl users get the same fix guidance as UI users.
- **Website install title: `THREE STEPS` → `THREE COMMANDS`.** Matches the new three-command install (`npx agentmemory`, `agentmemory demo`, `open viewer`).

### Fixed

- **Viewer banner scroll blocker.** Initial banner implementation rendered four full-height banner cards stacked above the dashboard, pushing all stats off-screen. Replaced with compact collapsible summary that takes ~40px of vertical space by default and only expands on click.

[0.9.3]: https://github.com/rohitg00/agentmemory/compare/v0.9.2...v0.9.3

## [0.9.2] — 2026-04-22

Safety + import-pipeline patch. Kills the infinite Stop-hook recursion loop that burned Claude Pro tokens on unkeyed installs, repairs every empty viewer tab after `import-jsonl`, derives lessons and crystals automatically from imported sessions, and opens up OpenAI-compatible embedding endpoints.

### Security

- **Stop-hook recursion loop** ([#187](https://github.com/rohitg00/agentmemory/pull/187), follow-up to [#149](https://github.com/rohitg00/agentmemory/issues/149)). A user with no provider key and `AGENTMEMORY_AUTO_COMPRESS=false` could still trigger unbounded recursion: Stop hook → `/summarize` → `provider.summarize()` → agent-sdk provider spawned a Claude Agent SDK child session that inherited the same plugin hooks, whose own Stop fired, spawning another child, etc. ~579 ghost `entrypoint: sdk-ts` sessions could accumulate in minutes, draining the Claude Pro subscription. Fixed at five layers in defense-in-depth:
  1. `detectProvider()` treats empty-string keys (`ANTHROPIC_API_KEY=`) as unset and returns the noop provider by default. The agent-sdk fallback now requires explicit `AGENTMEMORY_ALLOW_AGENT_SDK=true` opt-in with a second loud warning.
  2. New `NoopProvider` returns empty strings for compress/summarize; callers detect `.name === "noop"` and short-circuit.
  3. `agent-sdk` provider sets `AGENTMEMORY_SDK_CHILD=1` before spawning `query()` and restores the previous value in `finally` so later calls in the same parent process are not mis-classified.
  4. All 12 hook scripts inline a shared `isSdkChildContext(payload)` guard that checks both the env marker and `payload.entrypoint === "sdk-ts"`, and bail early.
  5. `/summarize` short-circuits with `{ success: false, error: "no_provider" }` when `provider.name === "noop"` instead of calling through. Empty provider responses are now logged and recorded as failures on the metrics store.

### Added

- **`OPENAI_BASE_URL` / `OPENAI_EMBEDDING_MODEL`** ([#186](https://github.com/rohitg00/agentmemory/pull/186), thanks @Edison-A-N). The `OpenAIEmbeddingProvider` now accepts a base URL override and a configurable model name, mirroring the `MINIMAX_BASE_URL` pattern. Unlocks Azure OpenAI, vLLM, LM Studio, and other OpenAI-compatible proxies for embeddings with zero breakage — defaults are preserved.
- **`OPENAI_EMBEDDING_DIMENSIONS`** ([#189](https://github.com/rohitg00/agentmemory/pull/189)). Follow-up: `dimensions` is now derived from the model via a `MODEL_DIMENSIONS` lookup (3-small=1536, 3-large=3072, ada-002=1536) and falls back to 1536 for unknown models. Custom or self-hosted OpenAI-compatible models should set this env var explicitly; non-positive values are rejected at construction.
- **Auto-derived lessons and crystals on `import-jsonl`** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). Each imported session now produces one crystal (narrative, tool outcomes, files, lessons) and up to 20 heuristic lessons from instructional patterns (`always`/`never`/`don't`/`prefer`/`avoid`/`caveat`/`note`/`warning`). Lessons are keyed by `fingerprintId("lesson", content.toLowerCase())` so re-importing the same file bumps `reinforcements` on existing lessons instead of duplicating rows. Crystals are keyed by `fingerprintId("crystal", sessionId)` and preserve `createdAt` on upsert.
- **Session preview on the sessions list** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). `Session` gained `firstPrompt` / `summary` fields; both `import-jsonl` and the live `mem::observe` path populate `firstPrompt` from the first real user prompt they see, and the viewer renders it as a 140-char preview row under each session.
- **Richer session detail + crystals viz + lessons tab explainers** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). Clicking a session now fetches its observations and renders a 4-stat grid (observations / tools / files / duration), top-10 tool bar chart, activity breakdown, and file list. Crystals cards show resolved lesson content instead of raw IDs. Lessons tab has a header explainer card for the rule + confidence + decay model.

### Changed

- **`detectProvider()` default is now `noop`** (see Security). Users who had no API key and relied on the implicit Claude-subscription fallback must set `AGENTMEMORY_ALLOW_AGENT_SDK=true` to restore old behavior — and should read the warning about Stop-hook recursion first.
- **`/agentmemory/audit` response shape** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). Now returns `{ entries, success }` instead of a bare array to match the viewer's expected shape. The viewer was rendering empty despite populated data.
- **`/agentmemory/replay/sessions` path** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). Calls `kv.list` directly instead of `sdk.trigger → mem::replay::sessions`. Sub-50ms on 600+ sessions instead of timing out at 10s+.
- **Viewer WebSocket connect timeout** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). 5-second timeout around `new WebSocket(...)`. If the socket is still CONNECTING after that, it is force-closed so the `onclose` retry / polling-fallback chain kicks in. Previously the banner stuck on `CONNECTING…` forever when the iii-stream port accepted TCP but never completed the upgrade handshake.
- **`import-jsonl` now runs synthetic compression + BM25 indexing** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). Imported observations go through the same `buildSyntheticCompression` + `getSearchIndex().add()` path as live `mem::observe`. Previously the raw shape was written directly to KV and the search index never saw it — consolidation reported "fewer than 5 summaries" and semantic/procedural/memory tabs stayed empty.
- **Viewer strength gauge** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). Memory tab showed `700%` on `strength: 7` because the scale was treated as 0–1. Now handles both 0–1 and 0–10 and clamps at 100%.

### Fixed

- **`npm ci` on fork PRs** ([#187](https://github.com/rohitg00/agentmemory/pull/187), [#188](https://github.com/rohitg00/agentmemory/pull/188)). CI failed because lockfiles are gitignored at the repo level. `.github/workflows/ci.yml` + `publish.yml` now run a two-step install: `npm install --package-lock-only` to produce a lockfile in the runner workspace, then `npm ci` to install deterministically from it. Gives a single resolved dependency graph across build + test + publish within one job run — important because publish uses `--provenance`.
- **`image-quota-cleanup` fail-closed on refCount read errors** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). When `getImageRefCount` threw, the code fell through to `deleteImage` with `refCount === 0`, risking deletion of still-referenced images on transient KV errors. Fail-closed: log + return from the `withKeyedLock` callback, never reach `deleteImage` without a confirmed zero refcount.
- **`raw.userPrompt` type guard** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). `mem::observe` now runtime-checks `typeof raw.userPrompt === "string"` before calling `.replace` / `.trim` / `.slice`. Non-string truthy values from malformed hook payloads no longer crash the handler.
- **Viewer Actions frontier field** ([#188](https://github.com/rohitg00/agentmemory/pull/188)). The tab was reading `results[1].actions` but `/frontier` returns `{ frontier: [...] }`. Fixed the read path; preserves actions/frontier unification.
- **Hardcoded `maxTokens: 4096` in the agent-sdk branch of `detectProvider`** ([#188](https://github.com/rohitg00/agentmemory/pull/188), [#190](https://github.com/rohitg00/agentmemory/pull/190)). Ignored the `maxTokens` variable computed from `env["MAX_TOKENS"]`. Every other branch already used the computed value; agent-sdk now matches.

### Infrastructure

- `StateScope` interface in `types.ts` documents the `KV.state` scope shape (`system:currentDiskSize: number`); `disk-size-manager` uses `StateScope[typeof DISK_SIZE_KEY]` generics instead of ad-hoc `<number>`.
- `onnxruntime-node` + `onnxruntime-web` moved to `optionalDependencies` alongside `@xenova/transformers` to make their lazy/transitive nature explicit; still externalized in `tsdown.config.ts` because bundling breaks the native `.node` binding paths.
- `FALLBACK_PROVIDERS` parsing now honors the same `AGENTMEMORY_ALLOW_AGENT_SDK` gate as `detectProvider`, filtering out `agent-sdk` from the fallback chain unless explicitly opted in.
- README provider table + env block updated: no-op is the new default, Claude-subscription fallback moved to a separate opt-in row, OpenAI env vars documented.
- Hero stat badge refreshed from 654 → 827 tests (both dark + light variants).
- `VERSION` / `ExportData.version` union / `supportedVersions` Set / `test/export-import.test.ts` / `@agentmemory/mcp` shim version all bumped in lockstep.
- Test count: 827 (up from 812 in v0.9.1).

[0.9.2]: https://github.com/rohitg00/agentmemory/compare/v0.9.1...v0.9.2

## [0.9.1] — 2026-04-21

Trust-the-CLI patch. Three bugs that surfaced in real testing of v0.9.0: the dashboard viewer showed zeros for half its cards, the `import-jsonl` command crashed on anything but a perfect response, and `upgrade` hard-aborted on a cargo registry that never had the crate.

### Fixed

- **Viewer dashboard list endpoints** ([#172](https://github.com/rohitg00/agentmemory/pull/172)). `GET /agentmemory/semantic` and `GET /agentmemory/procedural` were never registered, and `GET /agentmemory/relations` returned 405 because only the POST trigger existed. The dashboard's `Promise.all` fan-out silently received null for those cards even when semantic, procedural, or relation data was present. Added `api::semantic-list`, `api::procedural-list`, and `api::relations-list` handlers next to `api::memories` in `src/triggers/api.ts`, each returning the shape the viewer already parses.
- **CLI version drift** ([#173](https://github.com/rohitg00/agentmemory/pull/173)). The viewer brand badge hardcoded `v0.7.0` and the README "New in" banner still said `v0.8.2`. Replaced the viewer string with a `__AGENTMEMORY_VERSION__` placeholder substituted at render time by `document.ts` (same mechanism as the CSP nonce). Collapsed `src/version.ts` from a literal union of every historical release back to a single `VERSION` constant — the import-compat contract is the `supportedVersions` Set in `export-import.ts`, not the type.
- **`import-jsonl` crashed with `Unexpected end of JSON input`** ([#174](https://github.com/rohitg00/agentmemory/pull/174)). The livez probe used fetch throws as the only failure signal — any stray service on port 3111 passed silently, then `res.json()` blew up when the real POST returned an empty body or HTML error. Probe now captures `probe.status` + body snippet on non-OK responses and the exception message on network failure, so the error distinguishes `unreachable (...)` from `reachable but unhealthy (HTTP 503: ...)`. The POST reads body as text, parses only if non-empty, requires `json.success === true`, and maps 401 → "set AGENTMEMORY_SECRET" and 404 → "upgrade server to v0.8.13+".
- **`upgrade` aborted on `cargo install iii-engine`** ([#174](https://github.com/rohitg00/agentmemory/pull/174)). The crate was never published — the old flow called `requireSuccess`, which exited before the Docker pull ran. Swapped to the official installer used throughout the README and demo command: `curl -fsSL https://install.iii.dev/iii/main/install.sh | sh`. Installer failure is optional; a warn points at `iiidev/iii:latest` and the releases page at `iii-hq/iii`.

### Infrastructure

- Three integration tests cover the new list endpoints.
- `VERSION` / `ExportData.version` union / `supportedVersions` / `test/export-import.test.ts` all bumped in lockstep.

[0.9.1]: https://github.com/rohitg00/agentmemory/compare/v0.9.0...v0.9.1

## [0.9.0] — 2026-04-18

Visibility + correctness release. Landing site, filesystem connector, MCP standalone now actually talks to the running server, health logic stops crying wolf, audit trail closes its last gap, and every memory path has a clear policy.

### Added
- **Website** ([#164](https://github.com/rohitg00/agentmemory/pull/164)). Next.js 16 App Router landing page at `website/` — Lamborghini-inspired dark canvas, live GitHub stars pill, agents marquee with real brand logos, command-center tab showcase (viewer · iii console · state · traces), 12-tile feature grid, 10-agent MCP install selector, universal MCP JSON + one-click Cursor/VS Code deeplinks. Deploys to Vercel with Root Directory = `website/`.
- **Filesystem connector** — new `@agentmemory/fs-watcher` package under `integrations/filesystem-watcher/` ([#163](https://github.com/rohitg00/agentmemory/pull/163), closes [#62](https://github.com/rohitg00/agentmemory/issues/62)). Node `fs.watch` based, no native deps. Emits valid `HookPayload` observations for every file change and delete, with debounce, default ignore list, text-file preview, bearer auth, and env-driven config.
- **Security advisory drafts** for v0.8.2 CVEs ([#118](https://github.com/rohitg00/agentmemory/pull/118)). Six markdown drafts under `.github/security-advisories/` covering viewer XSS, curl-sh RCE, default 0.0.0.0 bind, unauthenticated mesh sync, Obsidian export traversal, and incomplete secret redaction. Also documents the symlink-traversal limitation of the Obsidian export fix.
- **iii console documentation** in the README ([#157](https://github.com/rohitg00/agentmemory/pull/157)). How to launch the iii console alongside the viewer, what each page gives you for agentmemory, and the `iii-observability` config that ships turned on.

### Changed
- **Audit policy codified** ([#162](https://github.com/rohitg00/agentmemory/pull/162), closes [#125](https://github.com/rohitg00/agentmemory/issues/125)). `src/functions/audit.ts` gains a top-of-file policy block: every structural deletion emits a `recordAudit` row, scoped deletions (`governance-delete`, `forget`) write one row per call, bulk sweeps (`retention-evict`, `evict`, `auto-forget`) write one batched row per invocation. `mem::forget` no longer deletes silently — it writes a single audit row with target ids, session id, and per-type counts.
- **Standalone MCP talks to the running server** ([#161](https://github.com/rohitg00/agentmemory/pull/161), closes [#159](https://github.com/rohitg00/agentmemory/issues/159)). `@agentmemory/mcp` now probes `GET /agentmemory/livez` at `AGENTMEMORY_URL` (defaults to `http://localhost:3111`) on first tool call. If the server is up, every tool (sessions, smart-search, recall, save, governance-delete, export, audit) routes through REST and sees exactly what hooks and the viewer see. If the probe fails, falls back to the local `InMemoryKV` so pure-standalone setups keep working. Bearer `AGENTMEMORY_SECRET` attached automatically. Handle cache invalidates on proxy failure with a 30s TTL so a later server start is picked up. Response shapes are now consistent across proxy and local branches.
- **Retention eviction targets the right store** ([#132](https://github.com/rohitg00/agentmemory/pull/132)). `mem::retention-evict` now routes deletes to `mem:memories` or `mem:semantic` based on the candidate's `source` field, probing both namespaces when the field is missing (legacy rows). Emits a single batched audit row per sweep with `evictedIds`, `evictedEpisodic`, `evictedSemantic`, and the threshold. Retention scores gain a `source` field persisted to the store.

### Fixed
- **Health stops flagging `memory_critical` on tiny Node processes** ([#160](https://github.com/rohitg00/agentmemory/pull/160), closes [#158](https://github.com/rohitg00/agentmemory/issues/158)). Memory severity no longer escalates from heap ratio alone. Both warn and critical bands now require RSS above `memoryRssFloorBytes` (default 512 MB). When heap is tight but RSS is below the floor, a non-alerting `memory_heap_tight_NN%_rssMMmb` note is attached to the snapshot — visibility without the false positive.
- **iii console screenshots vendored** in the README so the docs don't depend on CDN signed URLs.

### Infrastructure
- `VERSION` union extended to `0.9.0`; `ExportData.version`, `supportedVersions`, and `test/export-import.test.ts` bumped in lockstep.
- `@agentmemory/mcp` dependency pinned at `~0.9.0` to match.
- Tests: 777 passing (+ 14 skipped), up from 769.

[0.9.0]: https://github.com/rohitg00/agentmemory/compare/v0.8.12...v0.9.0

## [0.8.13] — 2026-04-17

### Added

- Session replay: new "Replay" tab in the viewer that plays any stored session as a scrubbable timeline with prompt, response, tool-call, and tool-result events. Keyboard bindings: space to play/pause, arrow keys to step, speed selector (0.5×–4×).
- JSONL transcript import via `agentmemory import-jsonl [path]` CLI subcommand and `POST /agentmemory/replay/import-jsonl`. Default path `~/.claude/projects`, or pass an explicit file/directory. Imports are recorded in the audit log.
- New iii functions `mem::replay::load`, `mem::replay::sessions`, and `mem::replay::import-jsonl`, each routed through the same HMAC-authed API trigger as other endpoints.

### Security

- JSONL import rejects symlinks, paths containing sensitive terms (`secret`, `credential`, `.env`, etc.), and skips malformed lines without aborting the batch.

## [0.8.12] — 2026-04-16

### Added

- Added token-efficient `memory_recall` output modes:
  - `format: "full"` (default)
  - `format: "compact"` (returns compact observation rows)
  - `format: "narrative"` (title + narrative text for low-token recall)
- Added `token_budget` support to `memory_recall` / `mem::search` to trim results to a target budget and return `tokens_used`, `tokens_budget`, and `truncated` metadata.
- Added new MCP + REST tool `memory_compress_file` (`mem::compress-file` / `/agentmemory/compress-file`) to compress markdown files while preserving headings, URLs, and fenced code blocks.

### Changed

- Updated MCP tool count to 44 and REST endpoint count to 104.
- Updated docs and plugin metadata for new tool/endpoint counts.
- Added test coverage for search formats, token budget behavior, and file compression validation.

## [0.8.11] — 2026-04-15

**Fix**: `node dist/index.mjs` crashed on first import after the iii-sdk v0.11 migration (#116) merged. iii-sdk v0.11 dropped `getContext()`, but 32 `src/functions/*.ts` files still imported and called it. Added `src/logger.ts` (thin stderr shim with the same `.info/.warn/.error` signature) and mechanically replaced every `ctx.logger.*` call. Updated all 45 test mock blocks. Fixed `search.ts` `registerFunction` call to use the v0.11 string-ID API.

### Fixed

- **iii-sdk v0.11 getContext crash** ([#116](https://github.com/rohitg00/agentmemory/issues/116)) — `SyntaxError: The requested module 'iii-sdk' does not provide an export named 'getContext'` on startup. Removed all `getContext` imports from 32 function files, added `src/logger.ts` shim, updated 45 test mock blocks.

### Changed

- Upgraded `iii-sdk` dependency from `^0.11.0-next.8` to stable `^0.11.0`.
- Aligned stream send payloads with v0.11 wire format by using `type` for `stream::send` events in observe/compress/session-activity paths.
- Updated migration guidance/examples and diagnostics plugin registration snippets to v0.11 function registration and trigger request shapes.
## [0.8.10] — 2026-04-15

**Behavior change**: the PreToolUse and SessionStart hooks no longer run enrichment by default. SessionStart saves ~1-2K input tokens per session you start (the only path that was actually reaching the model, per the [Claude Code hook docs](https://code.claude.com/docs/en/hooks.md)). PreToolUse stops spawning a Node process and POSTing to `/agentmemory/enrich` on every file-touching tool call — a pure resource cleanup, not a token fix. If you were relying on either path, set `AGENTMEMORY_INJECT_CONTEXT=true` in `~/.agentmemory/.env` and restart. Observations are still captured via PostToolUse regardless.

### Fixed

- **Gate SessionStart context injection** ([#143](https://github.com/rohitg00/agentmemory/issues/143), thanks [@adrianricardo](https://github.com/adrianricardo)) — `src/hooks/session-start.ts` previously wrote ~1-2K chars of project context to stdout at every session start. Per the [Claude Code hook docs](https://code.claude.com/docs/en/hooks.md), `SessionStart` stdout is explicitly injected into the model's context ("where stdout is added as context that Claude can see and act on"), so this was adding real tokens to the first turn of every new session. Now gated behind `AGENTMEMORY_INJECT_CONTEXT`, default off. The session still gets registered for observation tracking — only the stdout echo is skipped.
- **Skip the PreToolUse enrichment round-trip when disabled** ([#143](https://github.com/rohitg00/agentmemory/issues/143)) — `src/hooks/pre-tool-use.ts` was POSTing `/agentmemory/enrich` on every `Edit`/`Write`/`Read`/`Glob`/`Grep` tool call and piping up to 4000 chars to stdout. The Claude Code docs make clear that PreToolUse stdout goes to the debug log, not the model context, so this was **not** burning user tokens — but it was spawning a Node process + full HTTP round-trip ~20x per user message with no effect on the conversation. Gating it makes the disabled hot path a ~15ms no-op Node startup instead of a ~100-300ms REST round-trip. **This is a resource cleanup, not a token fix**; leaving the gate in place protects forward in case Claude Code ever changes PreToolUse to inject stdout like SessionStart does.
- **`mem::retention-evict` no longer leaks semantic memories** ([#124](https://github.com/rohitg00/agentmemory/issues/124)) — the eviction loop was unconditionally calling `kv.delete(KV.memories, id)` for every below-threshold candidate, but retention scores are computed for both episodic (`KV.memories`) and semantic (`KV.semantic`) memories. When a candidate came from `KV.semantic`, the delete silently became a no-op (key wasn't in `mem:memories` to begin with) and the semantic row stayed alive forever with a sub-threshold score. Semantic memories could not be evicted by this path at all. Fix: add a `source: "episodic" | "semantic"` discriminator to `RetentionScore`, tag it at score creation, and branch the delete on `candidate.source`. For pre-0.8.10 rows with no `source` field (including semantic retention rows written by the old scorer), the loop probes both namespaces to find where the `memoryId` actually lives, so upgraded stores get their stranded semantic memories evicted without needing to re-score first. The response shape now also includes `evictedEpisodic` and `evictedSemantic` counts for observability.
- **`mem::retention-evict` now emits an audit record per sweep** ([#124](https://github.com/rohitg00/agentmemory/issues/124)) — retention eviction performs structural deletes (memories, retention scores, access logs) but was not calling `recordAudit()`, which made evictions invisible to audit consumers. Now batched one audit row per non-zero sweep, with `operation: "delete"`, `functionId: "mem::retention-evict"`, `targetIds` containing every evicted id, and `details.evicted` / `evictedEpisodic` / `evictedSemantic` / `threshold` for context. Zero-eviction sweeps intentionally do not write an audit row.

### Honest note on #143

My initial diagnosis on the #143 thread pattern-matched too quickly to #138 and overclaimed that PreToolUse stdout was the smoking gun behind "Claude Pro burned in 4 messages". It wasn't — per the docs, PreToolUse stdout is debug-log only. The actual background cause is that [Claude Pro's Claude Code quotas are documented as tight](https://www.theregister.com/2026/03/31/anthropic_claude_code_limits/) and Anthropic has publicly confirmed "people are hitting usage limits in Claude Code way faster than expected." agentmemory contributes ~1-2K tokens per session via SessionStart, and that contribution is worth eliminating, but this release does not and cannot make Claude Pro's base quotas roomier. Users on heavy tool-call workloads should consider Max 5x or Team tiers regardless of whether agentmemory is installed.

0.8.8's #138 fix (opt-in `mem::compress` via `AGENTMEMORY_AUTO_COMPRESS`) remains the correct fix for users with `ANTHROPIC_API_KEY` set — that path was a real per-observation Claude API burn and is unrelated to the Claude Code hook pipeline.

### Added

- **`AGENTMEMORY_INJECT_CONTEXT` env var** — default `false`. When `true`, restores the old SessionStart stdout write and the old PreToolUse `/enrich` round-trip. Startup banner prints a loud warning when it's on, mirroring the `AGENTMEMORY_AUTO_COMPRESS` warning from 0.8.8.
- **`isContextInjectionEnabled()`** helper in `src/config.ts` — single source of truth for the flag. The hooks read the env var directly (they're spawned as standalone `.mjs` files by Claude Code and don't bootstrap through `src/index.ts`), so the helper is there for the startup banner and future code paths.
- **5 subprocess regression tests** in `test/context-injection.test.ts` — spawns the compiled `pre-tool-use.mjs` and `session-start.mjs` hooks with real stdin/stdout pipes and asserts that stdout is empty when the env var is unset, when it's explicitly `false`, and that the disabled PreToolUse path exits under 1 second. Also asserts that the opt-in path with an unreachable backend still exits cleanly. Full suite: **724 passing** (was 719 + 5 new).

### Infrastructure

- **Startup banner** (`src/index.ts`) now prints `Context injection: OFF (default, #143)` on normal startup and a prominent WARNING when opt-in is enabled, so the mode is never silent.
- **Migration note**: if you were relying on the old SessionStart project-context injection or the old PreToolUse enrichment round-trip, add to `~/.agentmemory/.env`:
  ```env
  AGENTMEMORY_INJECT_CONTEXT=true
  ```
  and restart Claude Code. You'll see the startup warning in the engine logs confirming it's active.

[0.8.10]: https://github.com/rohitg00/agentmemory/compare/v0.8.9...v0.8.10
[0.8.12]: https://github.com/rohitg00/agentmemory/compare/v0.8.11...v0.8.12

## [0.8.9] — 2026-04-14

Two UX fixes for the Claude Code plugin install path, both reported in [#139](https://github.com/rohitg00/agentmemory/issues/139) by [@stefanfaur](https://github.com/stefanfaur).

### Fixed

- **Claude Code plugin now auto-wires the `@agentmemory/mcp` stdio server** ([#139](https://github.com/rohitg00/agentmemory/issues/139)) — the plugin previously only shipped hooks and skills, and the README told Claude Code users to wire up the MCP server manually. A new `plugin/.mcp.json` declares the MCP server so `/plugin install agentmemory@agentmemory` auto-starts it when the plugin is enabled. No extra config step.
- **Skills no longer fail under Claude Code's sandbox with "Contains expansion"** ([#139](https://github.com/rohitg00/agentmemory/issues/139)) — the `recall` and `session-history` skills used pre-execution bash with `$(...)` / `${VAR:-default}` shell expansion, which Claude Code's sandbox rejects by pattern match. All four plugin skills (`recall`, `remember`, `forget`, `session-history`) are now rewritten as pure prompts that tell Claude to use the MCP tools directly. No bash, no sandbox issues, no shell escaping — and the skills run faster because they no longer fork a curl subprocess on every invocation.

### Added

- **Standalone MCP shim now implements `memory_smart_search` and `memory_governance_delete`** — the `@agentmemory/mcp` stdio server only exposed 5 tools (`memory_save`, `memory_recall`, `memory_sessions`, `memory_export`, `memory_audit`), so the rewritten plugin skills would have failed at runtime referencing tools the standalone didn't know about. Now ships 7 tools. `memory_smart_search` falls back to the same substring filter as `memory_recall` since the standalone shim doesn't have BM25/vector/graph without the full engine. `memory_governance_delete` takes `memoryIds` as an array or comma-separated string and returns `{deleted, requested, reason}`.
- **`memory_save` accepts `concepts`/`files` as arrays or comma-separated strings** — the old standalone only accepted CSV strings, which would silently drop array inputs. New `normalizeList()` helper handles both.
- **`memory_sessions` honours a `limit` arg** (default 20) — previously returned every session.
- **8 regression tests** in `test/mcp-standalone.test.ts` covering array/CSV inputs for `memory_save`, `memory_smart_search` substring fallback, `memory_sessions` limit, `memory_governance_delete` happy path + unknown-id skip + validation. Full suite: 715 passing.

### Changed

- **README Claude Code install snippet** — now explicitly notes that `/plugin install agentmemory` registers hooks + skills AND auto-wires the MCP server via `.mcp.json`, with no extra step.

[0.8.9]: https://github.com/rohitg00/agentmemory/compare/v0.8.8...v0.8.9

## [0.8.8] — 2026-04-14

**Behavior change**: per-observation LLM compression is now opt-in. If you were relying on LLM-generated summaries (the old default), set `AGENTMEMORY_AUTO_COMPRESS=true` in `~/.agentmemory/.env` and restart.

### Fixed

- **Stop silently burning Claude API tokens on every tool invocation** ([#138](https://github.com/rohitg00/agentmemory/issues/138), thanks [@olcor1](https://github.com/olcor1)) — the old `mem::observe` path fired `mem::compress` unconditionally on every PostToolUse hook, which called Claude via the user's `ANTHROPIC_API_KEY` to turn each raw observation into a structured summary. An active coding session (50-200 tool calls/hour) could run through hundreds of thousands of tokens in minutes, which is the exact opposite of what a memory tool should do. The new default path skips the LLM call and uses a zero-token **synthetic compression** step that derives `type`, `title`, `narrative`, and `files` from the raw tool name, tool input, and tool output directly. Recall and BM25 search still work — you just lose the LLM-generated summaries unless you opt in.

### Added

- **`AGENTMEMORY_AUTO_COMPRESS` env var** — default `false`. When `true`, restores the old per-observation LLM compression path. The engine startup banner now prints a loud warning when it's on, reminding you that it spends tokens proportional to your session tool-use frequency.
- **`src/functions/compress-synthetic.ts`** — the new zero-LLM compression helper. `buildSyntheticCompression(raw)` maps tool names to `ObservationType` (via camelCase-aware substring matching for `Read`/`Write`/`Edit`/`Bash`/`Grep`/`WebFetch`/`Task`/etc.), pulls file paths out of `tool_input.file_path` / `pattern` / etc., and truncates narratives to 400 chars so one huge tool output can't blow up the BM25 index.
- **Regression test** `test/auto-compress.test.ts` — 8 cases covering the default path (no `mem::compress` trigger, synthetic observation stored in KV), explicit opt-in, tool-name-to-type mapping, file-path extraction, narrative truncation, and the `post_tool_failure` → `error` path. Full suite: 707 passing.

### Infrastructure

- **Startup banner** (`src/index.ts:171`) now prints either `Auto-compress: OFF (default, #138)` or a prominent warning when opt-in is enabled, so the mode is never silent.
- **Migration note**: if you were running 0.8.7 or earlier with `ANTHROPIC_API_KEY` set, your token usage will drop sharply on upgrade. Search quality may also drop slightly because narratives are now derived from raw tool I/O instead of Claude-generated summaries. If you want the old behavior:
  ```env
  # ~/.agentmemory/.env
  AGENTMEMORY_AUTO_COMPRESS=true
  ```
  and restart. Existing compressed observations in `~/.agentmemory/` are untouched.

[0.8.8]: https://github.com/rohitg00/agentmemory/compare/v0.8.7...v0.8.8

## [0.8.7] — 2026-04-14

One-line fix for a brown-paper-bag bug reported in [#136](https://github.com/rohitg00/agentmemory/issues/136).

### Fixed

- **`npx @agentmemory/agentmemory` no longer crashes with "`/app/config.yaml` is a directory"** ([#136](https://github.com/rohitg00/agentmemory/issues/136), thanks [@stefano-medapps](https://github.com/stefano-medapps)) — the published tarball shipped `docker-compose.yml` but **not** `iii-config.docker.yaml`, even though the compose file mounts `./iii-config.docker.yaml:/app/config.yaml:ro`. Docker resolves missing host-path bind sources by silently creating them as empty directories, so the iii-engine container mounted an empty dir at `/app/config.yaml` and crashed with `Error: Failed to read config file '/app/config.yaml': Is a directory (os error 21)`. The `files` array in `package.json` now includes `iii-config.docker.yaml` alongside the regular `iii-config.yaml`.

### Infrastructure

- New regression test in `test/consistency.test.ts` parses every `./<path>:<container>` bind mount in `docker-compose.yml` and asserts the source file is shipped via the `files` array. Catches the class of bug where a new bind mount is added to compose without a corresponding entry in `files`.

[0.8.7]: https://github.com/rohitg00/agentmemory/compare/v0.8.6...v0.8.7

## [0.8.6] — 2026-04-13

Finishes the `npx <shim>` story from #120 by moving the standalone package under the `@agentmemory` scope.

### Changed

- **Standalone MCP shim is now `@agentmemory/mcp`** — the 0.8.5 publish attempted to push `agentmemory-mcp` as an unscoped package, but npm's name-similarity policy rejects it because of an unrelated third-party package called `agent-memory-mcp`. The shim now lives under the scope we already own, so `npx -y @agentmemory/mcp` works on the live registry. All README/integration/CLI-help snippets, the OpenClaw and Hermes guides, and the Claude-Desktop/Cursor/Codex/OpenCode MCP config examples have been updated to use the scoped name. The unscoped `agentmemory-mcp` command line (in the main package's `bin` field) was never published and has been removed from the docs.
- **Package directory renamed** `packages/agentmemory-mcp/` → `packages/mcp/`. The `.github/workflows/publish.yml` publish step points at the new path and `npm view @agentmemory/mcp` for the propagation check.
- **Log prefix** in `src/mcp/standalone.ts` and `src/mcp/in-memory-kv.ts` changed from `[agentmemory-mcp]` to `[@agentmemory/mcp]` so stderr output matches the package users install.

### Fixed

- **Shim version bump was missed in 0.8.5** — `packages/agentmemory-mcp/package.json` (now `packages/mcp/package.json`) was still pinned at `0.8.4` because the release bump script only touched the 8 files in the main package. The shim now tracks the main package and depends on `@agentmemory/agentmemory: ~0.8.6`.

[0.8.6]: https://github.com/rohitg00/agentmemory/compare/v0.8.5...v0.8.6

## [0.8.5] — 2026-04-13

Compatibility fix for stricter JSON-RPC clients, plus a spec cleanup CodeRabbit caught during review.

### Fixed

- **MCP server works with Codex CLI and any strict JSON-RPC 2.0 client** ([#129](https://github.com/rohitg00/agentmemory/issues/129)) — the stdio transport was responding to JSON-RPC **notifications** (messages without an `id` field, e.g. `notifications/initialized`), which violates JSON-RPC 2.0 §4.1 and caused stricter clients like Codex CLI v0.120.0 to close the transport with "Transport closed". Notifications are now detected by the missing/null `id` field, the handler still runs for side effects, but no response is written. Handler errors on notifications are logged to stderr instead of sent back to the client. Claude Code and other clients that tolerated the spurious responses continue to work unchanged.
- **Request `id` type validation per JSON-RPC 2.0 §4** — the transport previously only checked `id != null`, so a malformed request with `id: {}` or `id: [1,2]` could get echoed back with that non-primitive id, and valid-shape requests with bad id types fell through to the handler and produced a response carrying a bogus non-JSON-RPC id. `isValidId()` now enforces `string | number | null | undefined`, and bad-id requests get `-32600 Invalid Request` with `id: null` before the handler runs. Caught by CodeRabbit on PR [#131](https://github.com/rohitg00/agentmemory/pull/131).

### Infrastructure

- 14 tests in `test/mcp-transport.test.ts` covering the request path, notification path (#129), malformed input, and id-type validation (object/array/boolean). Full suite: 698 passing.

[0.8.5]: https://github.com/rohitg00/agentmemory/compare/v0.8.4...v0.8.5

## [0.8.4] — 2026-04-13

Two community contributions land on top of 0.8.3 and close out the #120 npm story for real.

### Fixed

- **Memories saved via the standalone MCP server now survive SIGKILL** ([#122](https://github.com/rohitg00/agentmemory/pull/122), thanks [@JasonLandbridge](https://github.com/JasonLandbridge)) — `memory_save` previously only flushed to `~/.agentmemory/standalone.json` on `SIGINT`/`SIGTERM`. If the MCP server process was killed forcefully (e.g. when an agent session ended), every memory saved during that session was lost. The save handler now persists to disk immediately after every `memory_save` call, so data survives unexpected termination. Also switched to the shared `generateId("mem")` helper and a single `isoNow` shared by `createdAt`/`updatedAt` so they can't drift.
- **OpenCode MCP config format corrected** ([#121](https://github.com/rohitg00/agentmemory/pull/121), thanks [@JasonLandbridge](https://github.com/JasonLandbridge)) — the README previously told OpenCode users to edit `.opencode/config.json` with an `mcpServers` object, but OpenCode actually uses `opencode.json` with an `mcp` object, `type: "local"`, and a `command` array. The agents table row and a new dedicated OpenCode block in the Standalone MCP section now document the correct format.

## [0.8.3] — 2026-04-13

Two bug fixes reported in the public issue tracker.

### Fixed

- **Retention score now reflects real agent-side reads** ([#119](https://github.com/rohitg00/agentmemory/issues/119)) — `mem::retention-score` previously hardcoded `accessCount = 0` and `accessTimestamps = []` for episodic memories, and only used a single-sample `lastAccessedAt` for semantic memories. Reads from `mem::search`, `mem::smart-search`, `mem::context`, `mem::timeline`, `mem::file-context`, and the matching MCP tools (`memory_recall`, `memory_smart_search`, `memory_timeline`, `memory_file_history`) were never recorded, so the time-frequency decay formula was a dead path. The reinforcement boost is now driven by a real per-memory access log persisted at `mem:access`, written by every read endpoint (fire-and-forget, so reads never block on tracker writes), with a bounded ring buffer of the last 20 access timestamps. Pre-0.8.3 semantic memories that only have the legacy `lastAccessedAt` field still score correctly via a backwards-compat fallback.
- **`npx agentmemory-mcp` 404** ([#120](https://github.com/rohitg00/agentmemory/issues/120)) — the README told users to run `npx agentmemory-mcp` for MCP client setup, but `agentmemory-mcp` was only a `bin` entry inside `@agentmemory/agentmemory`, not a real package, so `npx` returned 404 from the npm registry. Two fixes:
  - Published a new sibling package `agentmemory-mcp` (in `packages/agentmemory-mcp/`) that is a thin shim over `@agentmemory/agentmemory/dist/standalone.mjs`. `npx agentmemory-mcp` now works as documented.
  - Added a canonical `npx @agentmemory/agentmemory mcp` subcommand to the main CLI for users who already have `@agentmemory/agentmemory` installed and don't want a second package on disk. Both commands do the same thing.
  - README install snippets now use `npx -y agentmemory-mcp` so first-time users skip the install confirmation prompt.

### Added

- **Concurrent access tracking is race-safe** — the access log RMW is wrapped in the existing `withKeyedLock` keyed mutex, so two parallel reads of the same memory don't lose increments. `recordAccessBatch` uses `Promise.allSettled` so a slow keyed-lock acquisition on one id doesn't block the rest of the batch.
- **`mem::export` / `mem::import` now round-trip the access log** — the new `mem:access` namespace is included in dumps and restored on import, so backup/restore cycles no longer silently zero out reinforcement signals.
- **`exports` field in `package.json`** — explicitly exposes `./dist/standalone.mjs` as a subpath so the shim package and external consumers have a stable contract.
- **CI publishes both packages on release** — `.github/workflows/publish.yml` now publishes `@agentmemory/agentmemory` first, then the `agentmemory-mcp` shim from `packages/agentmemory-mcp/` so `npx agentmemory-mcp` works on the live release.

## [0.8.2] — 2026-04-12

This release ships 6 security fixes, growth features, and a visual redesign of the README. Users on v0.8.1 should upgrade as soon as possible — the security fixes address vulnerabilities in default deployments.

### Security

Six vulnerabilities fixed, originally introduced before v0.8.1:

- **[CRITICAL] Stored XSS in the real-time viewer** — viewer HTML used inline `onclick=` handlers while the CSP allowed `script-src 'unsafe-inline'`. User-controlled tool outputs could execute JavaScript in the reader's browser. Fixed by removing all inline event handlers, adding delegated `data-action` handling, switching to a per-response nonce-based CSP, and adding `script-src-attr 'none'`.
- **[CRITICAL] `curl | sh` in CLI startup** — the CLI auto-installed iii-engine via `execSync("curl -fsSL https://install.iii.dev/iii/main/install.sh | sh")`. Removed entirely. The CLI now uses an existing local `iii` binary if available, or falls back to Docker Compose. Users install iii-engine manually via `cargo install iii-engine` or Docker.
- **[HIGH] Default `0.0.0.0` binding** — `iii-config.yaml` bound REST (3111) and streams (3112) to all interfaces, exposing the memory store to anyone on the local network. Now binds to `127.0.0.1` by default. A separate `iii-config.docker.yaml` handles the Docker case with host port mapping restricted to `127.0.0.1:port`.
- **[HIGH] Unauthenticated mesh sync** — mesh push/pull endpoints accepted requests without an `Authorization` header. Mesh endpoints now require `AGENTMEMORY_SECRET`, and outgoing mesh sync requests send `Authorization: Bearer <secret>`.
- **[MEDIUM] Path traversal in Obsidian export** — the `vaultDir` parameter was passed directly to `mkdir`/`writeFile`, allowing writes to any filesystem path (e.g., `/etc/cron.d`). Exports are now confined to `AGENTMEMORY_EXPORT_ROOT` (default `~/.agentmemory`) via `path.resolve` + `startsWith` containment check.
- **[MEDIUM] Incomplete secret redaction** — the privacy filter missed `Bearer ...` tokens, OpenAI project keys (`sk-proj-*`), and GitHub fine-grained service tokens (`ghs_`, `ghu_`). Added regex coverage for all three formats.

See GitHub Security Advisories for CVSS scores and affected version ranges.

### Added

- **`agentmemory demo` CLI command** — seeds 3 realistic sessions (JWT auth, N+1 query fix, rate limiting) and runs smart-search queries against them. Shows semantic search finding "N+1 query fix" when you search "database performance optimization" — the kind of result keyword matching can't produce. Zero config, 30 seconds, no integration needed.
- **`benchmark/COMPARISON.md`** — head-to-head comparison vs mem0 (53K⭐), Letta/MemGPT (22K⭐), Khoj (34K⭐), claude-mem (46K⭐), and Hippo. 18-dimension feature matrix, honest LongMemEval vs LoCoMo caveats, token efficiency table.
- **`integrations/openclaw/`** — OpenClaw gateway plugin with 4 lifecycle hooks (`onSessionStart`, `onPreLlmCall`, `onPostToolUse`, `onSessionEnd`). Same pattern as the existing Hermes integration. Includes README with paste-this-prompt block, `plugin.yaml`, and `plugin.mjs`.
- **Token savings dashboard** — `agentmemory status` now shows cumulative token savings and dollar cost saved (`$0.30/1K tokens` rate). Same card added to the real-time viewer on port 3113.
- **Paste-this-prompt blocks** — main README and both integration READMEs now open with a copy-pasteable text block users drop into their agent. The agent handles the entire setup (start server, update MCP config, verify health, open viewer).
- **60 custom SVG tags** — 30 dark-bg + 30 light-bg variants under `assets/tags/` and `assets/tags/light/`. Covers 14 section headers, 6 stat cards, 8 pill tags, and utility badges. GitHub README uses `<picture>` elements to auto-swap based on reader theme (dark theme → light-bg SVGs, light theme → dark-bg SVGs).
- **Real agent logos** in the Supported Agents grid — 16 agents with clickable brand logos (Claude Code, OpenClaw, Hermes, Cursor, Gemini CLI, OpenCode, Codex CLI, Cline, Goose, Kilo Code, Aider, Claude Desktop, Windsurf, Roo Code, Claude SDK, plus "any MCP client").

### Changed

- README redesigned from plain markdown headers to SVG-tagged sections matching the agentmemory brand palette (orange `#FF6B35 → #FF8F5E` accent on dark `#1A1A1A` background).
- Hero stat row replaced with 6 custom SVG stat cards showing 95.2% R@5, 92% fewer tokens, 43 MCP tools, 12 auto hooks, 0 external DBs, 654 tests passing.
- Supported Agents grid reordered: Claude Code, OpenClaw, and Hermes now lead the first row (the 3 agents with first-class integrations in `integrations/`).
- Viewer token savings card now shows dollar cost saved alongside raw token count.
- Default configuration files updated: `iii-config.yaml` binds to `127.0.0.1`, new `iii-config.docker.yaml` for Docker deployments.

### Fixed

- **Viewer cost calculation was 100x under-reporting** — the formula `tokensSaved / 1000 * 0.3` returns dollars but was treated as cents. Now computes `costDollars` first, then `costCents = Math.round(costDollars * 100)`. 100K tokens now correctly displays `$30.00` instead of `30ct`.
- **`ObservationType` union missing `"image"`** — `VALID_TYPES` in `compress.ts` included `"image"` but the TypeScript union in `types.ts` didn't, breaking exhaustive checks.
- **Dynamic imports inside eviction loops** — `auto-forget.ts` and `evict.ts` called `await import("../utils/image-store.js")` inside nested loops. Hoisted once at the top of each function.
- **OpenClaw `/agentmemory/context` payload** — plugin was sending `{ tokenBudget, query, minConfidence }` but the endpoint expects `{ sessionId, project, budget? }`. Fixed to match the server contract.
- **Cursor cell in README grid** was missing its `<strong>Cursor</strong>` label.
- Codex CLI logo URL returned 404 from simple-icons CDN. Switched to GitHub org avatars for all logos for maximum reliability.

### Infrastructure

- 654 tests (up from 646 in v0.8.1), including 8 new tests covering viewer security, mesh auth, privacy redaction, and export confinement.
- All 60 custom SVGs validated with `xmllint` in CI-ready fashion.
- README consistency check updated to match new tool counts.

---

## [0.8.1] — 2026-04-09

- Fix viewer not found when installed via npx (#109)

## [0.8.0] — 2026-04-09

- Initial 0.8.x release

---

[0.8.4]: https://github.com/rohitg00/agentmemory/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/rohitg00/agentmemory/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/rohitg00/agentmemory/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/rohitg00/agentmemory/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/rohitg00/agentmemory/releases/tag/v0.8.0
