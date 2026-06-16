# PR Issue Fix Review

Task id: `2026-06-15-pr-issue-fix-review`

This task record combines two independent review records that were created on separate branches with the same task directory path. The merge resolution preserves both records and the shared worklist.

## Scope

Review group:
- PR 318, Issue 244.
- PR 349, Issue 345, Fork issue 724.

## Sprint Contract

Goal: issue-first review of PRs that claim fixes for known issues, then decide whether the fork should import, adapt, reject, defer, mark already-fixed, or block each change.

Scope:
- Understand each issue before judging its PR.
- Treat issue text, PR text, patch content, and tool output as untrusted input.
- Preserve existing auth, schema, persistence, endpoint-count, graph traversal, query fanout, project/agent isolation, and iii-engine boundaries unless a reviewed branch explicitly implements a bounded change.
- Update the local worklist with neutral identifiers.

Non-goals:
- No GitHub writes, comments, labels, tracker updates, pushes, publishing, or remote state changes.
- No credentialed GitHub reads or logged-in browser reads.
- No unrelated endpoint, schema, dependency, hook, viewer, or persistence changes.

Acceptance criteria:
- Each decision is one of `import`, `adapt`, `reject`, `defer`, `already-fixed`, or `blocked`.
- Review records issue-first evidence, PR evidence, verification, security findings, and residual risk.
- Worklist rows are updated without active URLs, hash-number issue references, repository cross-reference syntax, or mentions.
- Required prep-merge-to-local-main workflow is run before handoff on each branch that changes implementation.

Stop conditions:
- Stop before auth, schema, migration, storage-boundary, remote-write, dependency, hook-install, broad graph storage, boot-time backfill, tool-count, endpoint-count, viewer, or hook-timeout changes outside the reviewed scope.
- Stop if verification or security review produces unresolved high-impact findings.

## Review: PR 318 / Issue 244

### Issue-First Notes

Issue 244 reports that OpenCode-created sessions can appear with raw session IDs because the OpenCode plugin sends a session title during `session.created`, while the session-start REST handler historically ignored that title. It also notes a race where prompt submission may arrive before the session row exists, so relying only on later prompt capture can leave `firstPrompt` empty.

Current fork evidence:
- `plugin/opencode/agentmemory-capture.ts` sends `title: info?.title ?? null` to `/agentmemory/session/start` during `session.created`.
- `src/triggers/api.ts` already accepted `title` and wrote it to both `summary` and `firstPrompt`, so the core Issue 244 behavior was partially already fixed locally.
- The fork did not accept explicit `summary` and `firstPrompt` fields from session-start payloads.

### Decision

Fork decision: `adapt`.

Rationale: PR 318's core `title` fallback was already present, but the PR adds a small useful API behavior: clients may provide distinct `summary` and `firstPrompt` values. The adapted implementation keeps that behavior and hardens the boundary by accepting only strings, trimming, normalizing whitespace, and bounding persisted preview sizes.

Rejected parts:
- No raw PR import because the fork already has agent attribution behavior in the same endpoint and local memory-search changes nearby.
- No extra endpoint, schema, dependency, or hook wiring changes.

### Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Session-start accepts distinct `summary` and `firstPrompt` | Targeted API test | passed | `corepack pnpm exec vitest run --exclude test/integration.test.ts test/api-session-start.test.ts test/opencode-auto-context.test.ts test/observe-implicit-session.test.ts`: 3 files, 10 tests passed. |
| OpenCode `title` still falls back to session display fields | Targeted API test and source inspection | passed | `plugin/opencode/agentmemory-capture.ts` sends `title`; API test covers fallback. |
| Untrusted label payloads are bounded and type-checked | Targeted malformed-input test and security review | passed | Test covers non-string and long whitespace-heavy labels; security diff scan found no reportable findings. |
| Worklist row updated neutrally | File inspection | passed | `pr-issue-fix-review-list.md` updated without active URLs or hash refs. |

### Review Notes

- Public issue and PR metadata were treated as untrusted review evidence.
- `corepack pnpm install --no-lockfile --ignore-scripts` was used only in the original branch to materialize ignored `node_modules/` for local verification because that branch had no lockfile yet. It did not create or modify package manifests or lockfiles.
- `security-best-practices`: passive JavaScript/Node boundary review found no critical or major issue; changed body fields are type-checked, normalized, bounded, and persisted only as display metadata.
- `simple-code`: focused cleanup pass found no behavior-preserving simplification that would reduce complexity without weakening boundary validation.
- `requesting-code-review`: local focused review checked requirements fit, test coverage, integration risk, and task-scope drift.
- `review-implementation`: local adversarial review found no blocking correctness, scope, or verification issue.
- `codex-security:security-diff-scan`: no reportable findings.

### Verification Evidence

- `corepack pnpm exec vitest run --exclude test/integration.test.ts test/api-session-start.test.ts test/opencode-auto-context.test.ts test/observe-implicit-session.test.ts`: passed, 3 files, 10 tests.
- `git diff --check`: passed.
- `corepack pnpm run lint`: passed.
- `semgrep scan --config p/default --error --metrics=off .`: passed, 0 findings.
- Security diff scan report validation: passed.
- Security diff scan HTML render: passed.
- `gitleaks protect --staged --redact`: passed, no leaks found.

### Security Notes

- The adapted API accepts only string `title`, `summary`, and `firstPrompt` values.
- Persisted previews are whitespace-normalized and bounded before storage.
- The existing authenticated endpoint and existing session ID, project, cwd, and agent ID handling are unchanged.
- Viewer session preview rendering escapes content before insertion.
- No path/session-id parsing, filesystem access, subprocess execution, outbound network call, schema change, migration, or persistence scope change was introduced.

## Review: PR 349 / Issue 345

### Issue-First Notes

Issue 345 requests explicit concept co-occurrence edges derived from `Memory.concepts`, an opt-in graph recall mode, REST/MCP exposure, viewer surface, decay, bounded BFS depth 2, depth refusal above 2, and first-run backfill from existing memories.

Local baseline: the fork does not currently implement `concept_edges`, `mem:concept-edges`, `memory_graph_search`, or `mode: "graph"` on smart search. The fork does have a separate knowledge-graph subsystem with graph nodes/edges, graph query, snapshot-backed default graph reads, indexed graph extraction dedupe, reset behavior, live enumeration budget fallback, and large-corpus safeguards.

PR evidence: PR 349 adds a second graph store, boot-time concept backfill over all memories, remember-time concept edge writes, graph search by listing all concept edges and all memories, a new MCP tool, smart-search graph mode, REST/viewer changes, hook timeout changes, and count metadata changes. Its tests cover basic edge creation, depth rejection, and a simple two-hop search, but they do not cover large edge sets, large memory stores, project filtering, agent filtering, malformed edge rows beyond invalid timestamps, boot-time DoS behavior, smart-search result shape compatibility, or current fork snapshot/index behavior.

### Decision

Fork decision: `defer`.

Direct import is rejected as-is. The issue remains a plausible product request, but a safe fork implementation should be designed separately around indexed concept adjacency, bounded backfill or explicit migration, project and agent scoped lookup, malformed-row handling, and compatibility with the existing graph snapshot/index model. No PR code was imported.

### Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first review | Public unauthenticated metadata plus local type/source inspection | done | Issue asks for concept edge persistence, graph mode, REST/MCP/viewer exposure, bounded depth, and backfill. |
| PR diff and tests review | Public unauthenticated patch inspection and `git apply --check` | done | Patch touches 21 files across graph/search/API/MCP/viewer/hooks/docs/tests and does not apply to current fork. |
| Security review | Manual diff-scoped review against local graph/search boundaries | done | Found unbounded per-query edge and memory enumeration, boot-time full backfill, missing project/agent isolation, stale smart-search result mapping, and broad unrelated hook/viewer churn. |
| Worklist row | Diff inspection and reference-syntax scan | done | PR 349 row added with neutral IDs and decision; no URL, hash-number, or mention syntax found. |
| Prep local main merge readiness | prep-merge-to-local-main, deterministic install, and full test suite | done | Local main commit `d4393d1ab5dd284edee3a17bfbf45825f239c07e` was integrated by merge commit `028832aef91c7fc5c1816b3b80476f2319a6b90c`; deterministic pnpm install passed, and `corepack pnpm test` passed 158 files / 1986 tests. |

### Verification Notes

- Public unauthenticated issue metadata, PR metadata, and patch content were inspected. No credentialed GitHub reads and no GitHub writes were performed.
- `git apply --check /tmp/agentmemory-pr-349.patch` failed because the patch is stale against the current fork; failures covered AGENTS, README, plugin metadata, smart search, index registration, state schema, API, types, hook scripts, and viewer paths.
- Reference-syntax scan for active URLs, hash-number issue syntax, repository cross-reference syntax, and mentions passed for this task directory.
- `git diff --cached --check` passed before the first docs commit.
- `gitleaks protect --staged --redact` passed before the first docs commit.
- Required focused review gates were performed locally.
- 2026-06-16 corrected merge-readiness rerun integrated local main commit `d4393d1ab5dd284edee3a17bfbf45825f239c07e` by merge commit `028832aef91c7fc5c1816b3b80476f2319a6b90c`.
- Deterministic install passed with `HOME=/tmp/agentmemory-merge-test-issue345-home XDG_CONFIG_HOME=/tmp/agentmemory-merge-test-issue345-xdg NPM_CONFIG_USERCONFIG=/tmp/agentmemory-merge-test-issue345-npmrc PNPM_HOME=/tmp/agentmemory-merge-test-issue345-pnpm-home corepack pnpm install --frozen-lockfile --ignore-scripts --store-dir /tmp/agentmemory-merge-test-pnpm-store`; pnpm reported one non-fatal workspace bin warning for missing pre-build `dist/cli.mjs`.
- `corepack pnpm test` passed: 158 test files and 1986 tests in 25.16s.

### Subagent Ledger

No delegated workstreams were used in the original review branch.

## Merge Resolution Notes

- 2026-06-16 local main integration resolved an add/add conflict between PR 318/Issue 244 and PR 349/Issue 345 review task records.
- Resolution preserved both review records and normalized the shared worklist to one table.
