# Changelog

All notable changes to agentmemory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
