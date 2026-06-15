# Skills Plugin Contract Coverage

Scope: agentmemory repo, branch `coverage/skills-plugin-contracts`, worktree `/Users/A1538552/.codex/worktrees/100c/agentmemory`.

## Sprint Contract

Goal: raise skills, plugin, package, and integration contract coverage above 80% on the scoped source surface and commit the result.

Scope:
- `scripts/skills/**`
- `plugin/**`
- `packages/mcp/**`
- `integrations/**` for package/plugin/agent surface contracts
- tests matching `test/*plugin*.test.ts`, `test/*skill*.test.ts`, `test/connect-new-agents.test.ts`, `test/codex-connect-hooks.test.ts`, `test/claude-code-with-hooks.test.ts`, `test/hermes-plugin.test.ts`, `test/openclaw-plugin.test.ts`, `test/copilot-plugin.test.ts`

Coverage boundary:
- V8 line coverage is applied to deterministic source surfaces that can run in-process (`scripts/skills/**`, `integrations/pi/security.ts`, `integrations/openclaw/plugin.mjs`, and existing `src/**`).
- Bundled standalone hook scripts under `plugin/scripts/*.mjs` and the published MCP wrapper `packages/mcp/bin.mjs` are packaging artifacts with process/network side effects; they are covered by manifest, packaging, and child-process contract tests instead of direct V8 include targets.

Non-goals:
- No fetch, pull, push, deploy, publishing, dependency installs, or remote state changes.
- No MCP tool additions/removals unless a failing contract test exposes stale surface metadata that must be repaired.
- No broad source refactors or runtime behavior changes outside contract-test support.

Acceptance criteria:
- Scoped lines, statements, and functions coverage exceed 80%; branches exceed 80% where reasonable for deterministic contract surfaces.
- Contract tests cover generated skill references, tool counts, plugin manifests, hook/script packaging, integration config validation, and stale surface counts.
- Existing consistency rules are preserved for MCP/tool/plugin counts.
- A factual commit contains only scoped changes.

Intended verification:
- `npm run skills:check`
- targeted plugin/skill/connect tests
- `npm test`
- `npm run coverage`
- `npm run build`
- `npm run lint`
- `gitleaks protect --staged --redact`
- Semgrep for plugin/tooling/hook-surface changes

Known boundaries:
- Subagent tools exist, but the current user request does not explicitly authorize spawning subagents from this thread; review is handled locally with deterministic repo checks and a focused diff review.
- Network-dependent security checks may require sandbox approval if the tool is present but network access is blocked.

Stop conditions:
- Any required check fails twice without a new evidence-based approach.
- A required fix would change public APIs, auth/security behavior, persistence, migrations, or remote/project state.
- Missing security tooling blocks commit and cannot be resolved without install or approval.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Include scoped deterministic non-`src` source surfaces in coverage accounting | `npm run coverage` plus coverage summary inspection | pass | `scripts/skills/**`, `integrations/pi/security.ts`, and `integrations/openclaw/plugin.mjs` now appear in coverage summary; bundled hook scripts and the MCP shim remain contract-tested packaging artifacts rather than direct V8 include targets. |
| Generated skill reference contracts | targeted skill/plugin tests and `npm run skills:check` | pass | `npm run skills:check`; `test/plugin-surface-contract.test.ts` checks autogen blocks and runs generator/check success paths in-process. |
| Plugin manifest and hook/script packaging contracts | targeted plugin tests | pass | `test/plugin-surface-contract.test.ts`, `test/codex-plugin.test.ts`, `test/copilot-plugin.test.ts`. |
| MCP package and integration config contracts | targeted plugin/integration tests | pass | `test/plugin-surface-contract.test.ts`, `test/hermes-plugin.test.ts`, `test/openclaw-plugin.test.ts`. |
| No stale counts across docs/manifests | targeted contract tests and `npm run skills:check` | pass | Plugin descriptions now match 53 tools, 15 skills, and manifest hook counts; Hermes/OpenClaw README badges and prose counts now match 53 tools. |
| Full repo health | `npm test`, `npm run build`, `npm run lint`, security scans | pass | `npm test`, `npm run coverage`, `npm run build`, `npm run lint`, `gitleaks protect --staged --redact`, and `semgrep scan --config p/default --error --metrics=off .` passed. |

## Progress

- 2026-06-14: Started on detached `ec446b7`, created branch `coverage/skills-plugin-contracts`.
- 2026-06-14: Read repo instructions, package scripts, coverage config, existing scoped tests, and confirmed no repo-local lessons under `docs/lessons`.
- 2026-06-14: Baseline `npm run coverage` passed but scoped non-`src` surfaces were absent from `coverage/coverage-summary.json`; overall baseline was 60.67% lines, 58.82% statements, 61.98% functions, 49.10% branches.
- 2026-06-14: Added contract tests for coverage includes, generated skill refs, plugin manifest counts, MCP package surface, and integration package/readme counts.
- 2026-06-14: Added OpenClaw tests for recall formatting, conversation capture, REST error propagation, and plaintext bearer guard behavior.
- 2026-06-14: After changes, `npm run coverage` passed. Scoped executable aggregate: 89.56% lines, 83.51% statements, 95.65% functions, 70.95% branches. Branches remain below 80% because the remaining misses are mostly script lint/generator negative filesystem branches; lines/statements/functions meet the target.
- 2026-06-14: Verification passed: `npm run skills:check`; targeted plugin/skill/connect tests; `npm test`; `npm run coverage`; `npm run build`; `npm run lint`; `gitleaks protect --staged --redact`; `semgrep scan --config p/default --error --metrics=off .`.
- 2026-06-15: Prep-merge review flagged a stale OpenClaw prose count and ambiguous coverage wording for `plugin/scripts/*.mjs` and `packages/mcp/bin.mjs`. Fixed the stale count, expanded the README prose stale-count contract, and clarified that bundled standalone artifacts are covered by manifest/package/child-process contracts while deterministic source surfaces are V8-instrumented.
