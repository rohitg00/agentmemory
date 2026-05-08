# Roadmap

This is agentmemory's public 12-month roadmap. It covers Q2 2026 through Q1 2027. The roadmap is the source of truth for where the project is heading; anything significant that lands in main should trace back to an item here or a ratified issue.

Items shift as evidence changes. Each quarter we publish a short retrospective on what landed, what slipped, and why — attached to the release notes.

## How to read this

- **Shipped** — landed in main and tagged in a release.
- **Active** — in-flight, has an open PR or issue owner.
- **Planned** — accepted scope for the quarter, not started.
- **Candidate** — under consideration, may defer.

Anything not on this list that a contributor wants to pursue is welcome — open an issue labeled `roadmap` and it gets triaged against the quarterly theme.

## Themes

- **Q2 2026 — Depth.** Multimodal memory, more connectors, close out backlog from the v0.9 cycle.
- **Q3 2026 — Breadth.** Hook parity across more agents, community expansion, OpenSSF best-practices alignment.
- **Q4 2026 — Trust.** Enterprise features — SSO, audit export, RBAC, long-running deployment story.
- **Q1 2027 — v1.0.** Stability, LTS branch, semver freeze on the REST + MCP surface.

## Q2 2026 — Depth (April – June)

### Shipped so far in this quarter
- [x] iii console docs in README with vendored screenshots (#157)
- [x] Health severity gated on RSS floor (#158 / PR #160)
- [x] Standalone MCP proxies to the running server (#159 / PR #161)
- [x] Audit coverage for `mem::forget` + audit policy doc (#125 / PR #162)
- [x] `@agentmemory/fs-watcher` filesystem connector (#62 / PR #163)
- [x] Next.js website on Vercel (PR #164)
- [x] CI publishes all three npm packages on release (PR #166)

### Active
- [ ] **Multimodal memory** — content-addressed image store, vision-prompt compression, disk quota + refcount on eviction (#64, PR #111)
- [ ] **Governance baseline** — this file, plus `GOVERNANCE.md`, `CONTRIBUTING.md`, `MAINTAINERS.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`

### Planned
- [ ] **GitHub connector** (`@agentmemory/github-watcher`) — sync issues, PRs, discussions as observations. Shares the `POST /agentmemory/observe` wire format with the filesystem connector.
- [x] **OpenCode hook bus** (#156) — wired 22 hooks covering all 12 Claude Code hook types: session lifecycle (create/idle/status/compacted/update/diff/delete/error), messages & prompts (chat.message, message.updated user+assistant, message.removed), tool capture (before + rich ToolPart lifecycle in message.part.updated), memory injection (context + enrich via system.transform), part tracking (subtask, step-finish, reasoning, file, patch, compaction, agent, retry), file enrichment pipeline (stash via tool.execute.before + file.edited + file parts), permissions (updated + replied), task tracking (todo.updated w/ priority), commands (command.executed), config & model tracking (config + chat.params). Plus 2 slash commands (recall/remember). See `plugin/opencode/`.
- [ ] **Session replay UI** in the real-time viewer — scrub the timeline, inspect per-observation payloads.
- [ ] **Benchmark harness in CI** — keep the 95.2% R@5 number honest across releases by re-running LongMemEval-S on every minor tag.

## Q3 2026 — Breadth (July – September)

### Planned
- [ ] **Additional maintainer onboarding** — at least one Maintainer from a different organization added via the process in `GOVERNANCE.md`. This is a prerequisite for advancing past the foundation's Growth Stage.
- [ ] **Slack / Discord connector** — third source in the connector family.
- [ ] **OpenSSF Scorecard** — enroll, reach a Silver-equivalent score. Badged in the README.
- [ ] **Hermes integration hardening** — reach parity with the OpenClaw plugin surface (session lifecycle + tool-use hooks).
- [ ] **Knowledge graph query language** — small DSL on top of `/agentmemory/graph` for multi-hop questions.
- [ ] **First conference talk** — submit to KubeCon / LlamaCon / similar.

### Candidate
- Cross-agent shared memory namespace. Currently each agent installs its own instance. This would let a Claude Code session and a Cursor session recall each other's observations via a shared mesh node.

## Q4 2026 — Trust (October – December)

### Planned
- [ ] **SSO gateway** — accept OIDC in front of the REST surface for team deployments.
- [ ] **Audit log export** — streamable tail to S3 / Loki / stdout for compliance pipelines.
- [ ] **RBAC on memory scope** — `project:read`, `project:write`, `governance:delete` role set.
- [ ] **Long-running deployment guide** — first-class Docker, systemd unit, and launchd plist.
- [ ] **Performance SLO** — publish p50/p95 recall latency targets, enforce via the benchmark harness.
- [ ] **Security audit** — external review of the REST surface + mesh-sync path. Fund through LF if foundation acceptance lands before end of quarter.

### Candidate
- Agent-to-agent memory handoff protocol — standardize what one agent can inherit from another's memory, complementing MCP.

## Q1 2027 — v1.0 (January – March)

### Planned
- [ ] **REST + MCP surface freeze.** Any break requires a major-version tag per `GOVERNANCE.md`.
- [ ] **LTS branch `v1.x`** — 12-month security-fix commitment.
- [ ] **v1.0 release** — full documentation pass, all roadmap items from prior quarters either shipped or formally deferred.
- [ ] **Foundation membership** — Growth → Impact stage application if adoption + maintainer diversity metrics justify.

### Candidate
- Hosted reference instance for the community to benchmark against.
- Reference implementation in a second language (Rust or Go) for the MCP server — would expand the set of runtimes that can host agentmemory.

## Out of scope

For transparency, these are deliberately *not* on the roadmap:

- A cloud-hosted agentmemory SaaS.
- Billing, subscription tiers, commercial licensing beyond Apache-2.0.
- Agent frameworks themselves — agentmemory is a dependency, not a replacement for the agent runtime.

## Feedback

Anything on this list you disagree with, or think should move up / down — open an issue tagged `roadmap`. Quarterly themes are revisited with every quarterly retrospective.
