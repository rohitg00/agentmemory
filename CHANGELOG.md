# Changelog

All notable changes to agentmemory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.8.2]: https://github.com/rohitg00/agentmemory/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/rohitg00/agentmemory/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/rohitg00/agentmemory/releases/tag/v0.8.0
