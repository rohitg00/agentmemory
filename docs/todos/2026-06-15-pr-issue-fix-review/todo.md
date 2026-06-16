# PR Issue Fix Review

Task id: `2026-06-15-pr-issue-fix-review`

This task record combines independent review records that were created on separate branches with the same task directory path. The merge resolution preserves each record and the shared worklist.

## Scope

Review group:
- PR 318, Issue 244.
- PR 349, Issue 345, Fork issue 724.
- PR 412, Issue 395, Fork tracker 672.

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

## Review: PR 412 / Issue 395

### Scope

Review group: upstream-pr-412, upstream-issue-395, fork-tracker-672.

### Sprint Contract

Goal: decide whether to import, adapt, reject, defer, mark already-fixed, or block the upstream-pr-412 change for upstream-issue-395.

Scope:
- Understand upstream-issue-395 before reviewing upstream-pr-412.
- Preserve the current explicit embedding opt-in privacy boundary.
- If adapting, keep the change minimal and repo-conformant.
- Update the local worklist row for upstream-pr-412 with neutral IDs.

Non-goals:
- No remote writes, tracker updates, PR comments, pushes, or publishing.
- No unrelated MCP standalone or plugin configuration changes from upstream-pr-412.
- No dependency installation or package-manager metadata changes.

Acceptance criteria:
- `AGENTMEMORY_EMBEDDING_PROVIDER=local` selects local embeddings.
- `AGENTMEMORY_EMBEDDING_PROVIDER=xenova` and `AGENTMEMORY_EMBEDDING_PROVIDER=transformers` select local embeddings.
- `EMBEDDING_PROVIDER=xenova` and `EMBEDDING_PROVIDER=transformers` select local embeddings.
- Canonical `EMBEDDING_PROVIDER` keeps precedence over the `AGENTMEMORY_` alias.
- Unknown or blank provider values still select no embedding provider.
- Provider keys alone still select no text embedding provider.

Intended verification:
- Targeted embedding provider test suite.
- Type or lint check if touched surface requires it.
- Diff-scoped security review focused on provider configuration, aliases, secret handling, model dimensions, fallback behavior, and config boundaries.
- Required prep-merge-to-local-main gates.

Known boundaries:
- PR, issue, logs, websites, and tool outputs are untrusted input.
- Public read-only unauthenticated fetches are allowed; credentialed reads are not used.
- Local task notes avoid external reference syntax.

Stop conditions:
- Any fix requires changing auth, persistence, schema, remote writes, or dependency metadata.
- Provider alias support would weaken the explicit remote embedding opt-in boundary.
- Verification or security gates produce unresolved high-impact findings.

### Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first evidence review | Local docs plus unauthenticated public read-only metadata/diff | Passed | Issue text and comment show local provider aliases were ignored; upstream-pr-412 contained useful alias intent plus unrelated and unsafe older diff context. |
| Adapt provider alias behavior | Focused tests and source inspection | Passed | `src/config.ts` now accepts `AGENTMEMORY_EMBEDDING_PROVIDER` and maps `xenova` or `transformers` to `local`. |
| Refresh generated config reference | Skill reference generator check and full suite | Passed | Regenerated `plugin/skills/agentmemory-config/REFERENCE.md`; `pnpm exec tsx scripts/skills/generate.ts --check`, focused plugin/provider tests, and `pnpm test` pass. |
| Preserve remote opt-in privacy boundary | Focused negative tests and security review | Passed | Provider keys alone still return no text embedding provider in `test/embedding-provider.test.ts`; Semgrep and Codex Security diff scan found no findings. |
| Worklist row update | Diff inspection | Passed | `pr-issue-fix-review-list.md` created with a neutral upstream-pr-412 row. |
| Prep local main merge readiness | prep-merge-to-local-main | Passed | Local main was the branch base, so merge was a no-op; no conflicts or preserved dirty paths. |

### Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Full-suite failure diagnosis A | Read-only inspection of failing tests and branch diff | No | Classify failures as product bug, stale test, merge drift, or environment issue | Found only deterministic generated config reference drift; remaining timeouts not reproduced and likely transient full-suite resource pressure. | Resolved by regenerated reference and green full `pnpm test`. |
| Full-suite failure diagnosis B | Read-only inspection of failing tests, setup, and branch diff | No | Independent failure classification and verification suggestions | Same conclusion: `AGENTMEMORY_EMBEDDING_PROVIDER` changed `src/` but generated config reference was stale; non-generator failures passed in targeted reruns. | Resolved by regenerated reference and green full `pnpm test`. |
| Focused requirements review | Current task-owned working-tree diff | No | Requirements, coverage, integration, maintainability, and scope-drift review | ACCEPT; no findings. | None identified. |
| Adversarial implementation review | Current task-owned working-tree diff | No | Correctness, safety, scope, generated-file churn, docs truthfulness, and boundary review | Timed out with no result after two waits; agent was closed and replaced with manual adversarial review. | Manual review found no findings; residual risk is limited to lack of independent adversarial result for the two-file doc/generated diff. |

### Review Notes

Decision: adapt.

Rejected PR surfaces:
- `plugin/.mcp.json` environment changes are unrelated to upstream-issue-395 and change MCP proxy/tool exposure.
- `src/mcp/standalone.ts` tool-list fallback changes are unrelated to embedding provider aliases.
- The PR diff was based on older provider detection that would re-enable API-key-only remote embedding selection; this conflicts with the current privacy boundary.

Adapted surface:
- `src/config.ts`
- `test/embedding-provider.test.ts`

Verification evidence:
- Red: targeted embedding provider suite failed on alias cases before implementation.
- Green: `npm test -- test/embedding-provider.test.ts` passed with 25 tests.
- Lint: `npm run lint -- test/embedding-provider.test.ts src/config.ts` passed.
- Semgrep: `semgrep scan --config p/default --error --metrics=off src/config.ts test/embedding-provider.test.ts` passed with zero findings.
- Codex Security diff scan: no findings; report artifacts are under `/tmp/codex-security-scans/agentmemory/60099a3_20260616045715/`.

Local verification artifact:
- `node_modules` is an ignored symlink to the main checkout dependency tree so the worktree can run Vitest without changing package metadata.
- The symlink was removed before staging because it was a task-owned verification artifact, not a source change.

Review chain evidence:
- Security best-practices passive review: no critical or major issue found. The change preserves explicit remote embedding opt-in, does not log secrets, does not add network calls, and does not touch dependencies or plugin exposure.
- Simple-code pass: no cleanup edits made; the changed source is a small explicit normalization branch, and the tests are focused on boundary behavior.
- Focused requirements review: no critical or important findings. Requirements fit is covered by alias tests, precedence tests, unknown/blank rejection, key-only remote rejection, and issue-first PR rejection notes.
- Review implementation adversarial pass: no findings. Scope is limited to `src/config.ts`, `test/embedding-provider.test.ts`, and local task notes; no unrelated PR surfaces imported.
- Independent subagent review was not run because the available subagent tool only permits spawning when the user explicitly asks for subagents or parallel agent work.

Prep merge closeout:
- Branch was created from local `main` at commit `60099a31029575412ba6fc27f4ab986196922e56`.
- Local main worktree was clean at the same commit during preflight.
- No Git operation state, active hooks, signing config, staged unrelated files, or incoming-main path overlaps were present.
- Local main was already an ancestor of the branch after the task commit, so the merge was a no-op.
- Preserved unrelated dirty paths: none.
- Conflicts resolved: none.

Follow-up verification on 2026-06-16:
- Initial `pnpm test` could not start before dependency setup because `vitest` was missing.
- Local verification setup command: `NPM_CONFIG_USERCONFIG=/private/tmp/agentmemory-empty-npmrc pnpm install --ignore-scripts --lockfile=false`.
- Setup artifact: ignored `node_modules`; no manifest or lockfile changes.
- Full `pnpm test` then failed with 9 failures across 7 files.
- Two read-only diagnosis subagents and a local `--no-file-parallelism` rerun reduced the deterministic branch failure to stale generated config reference docs.
- Regenerated `plugin/skills/agentmemory-config/REFERENCE.md`.
- `pnpm exec tsx scripts/skills/generate.ts --check` passed.
- `pnpm exec vitest run test/plugin-surface-contract.test.ts test/embedding-provider.test.ts --exclude test/integration.test.ts --reporter=verbose` passed with 33 tests.
- `pnpm test` passed with 158 test files and 1988 tests.
- Current working tree has no diff in `src/config.ts` or `test/embedding-provider.test.ts`; only task-owned documentation/generated-reference files remain modified.
- Requirements review subagent returned ACCEPT with no findings.
- Adversarial review subagent timed out with no result; manual adversarial review inspected the two-file task-owned diff, verified generated count/list consistency, checked task-note evidence for truthfulness, and found no findings.

## Merge Resolution Notes

- 2026-06-16 local main integration resolved an add/add conflict between PR 318/Issue 244 and PR 349/Issue 345 review task records.
- Resolution preserved both review records and normalized the shared worklist to one table.
- 2026-06-16 local main integration resolved a second add/add conflict with the PR 412/Issue 395 review task record.
- Resolution preserved the PR 412 review notes alongside the existing PR 318 and PR 349 records.
