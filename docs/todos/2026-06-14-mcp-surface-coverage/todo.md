# MCP Surface Coverage Task

## Scope

Root agentmemory TypeScript/Vitest project on branch `coverage/mcp-surface`.

Primary source surface:

- `src/mcp/server.ts`
- `src/mcp/standalone.ts`
- `src/mcp/rest-proxy.ts`
- `src/mcp/transport.ts`
- `src/mcp/in-memory-kv.ts`
- `src/mcp/tools-registry.ts`

Test surface:

- `test/mcp-*.test.ts`
- `test/tool-count-consistency.test.ts`
- `test/consistency.test.ts`

## Assumptions

- The current worktree is already isolated and started detached at `ec446b7`; the task branch is local only.
- No fetch, pull, push, deploy, external publication, or MCP/API contract change is approved.
- Existing npm-based scripts are the project-native checks for this repo despite the broader pnpm default.
- `package-lock.json`, `node_modules/`, and `coverage/` are ignored local artifacts and not task-owned changes.

## Sprint Contract

- **Goal:** Raise scoped V8 coverage for `src/mcp/**` above 80% for lines, statements, and functions, with branches above 80% where practical, then commit the scoped result.
- **Scope:** Add behavior and boundary tests around MCP server handler registration, tool argument validation/payload shaping, resources/prompts contracts, standalone proxy/local fallback edges, and transport framing edges.
- **Non-goals:** Add/remove MCP tools, alter REST/MCP externally visible contracts, change global coverage thresholds unless the full repo coverage gate proves stable, modify dependencies, or touch non-MCP production surfaces.
- **Acceptance criteria:** Scoped MCP coverage is >80% for lines/statements/functions and either >80% for branches or remaining branch gaps are explicitly recorded; targeted MCP tests pass; `npm test`, `npm run coverage`, `npm run lint`, and `npm run skills:check` pass or any limitation is recorded; mandatory security scans for touched MCP/test surfaces are run before commit.
- **Intended verification:** Targeted red/green Vitest runs for new tests, scoped MCP coverage command, `npm test`, `npm run coverage`, `npm run lint`, `npm run skills:check`, Semgrep for MCP/code changes, and staged Gitleaks before commit.
- **Known boundaries:** Do not change MCP tool/API contract without the AGENTS.md consistency checklist and explicit current-turn approval. Do not fetch/pull/push/deploy.
- **Stop conditions:** Coverage cannot exceed 80% without changing externally visible behavior; required scanners are unavailable or report unresolved findings; full repo checks fail for reasons unrelated to task-owned changes and cannot be safely isolated.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| MCP server tool validation and payload tests | Targeted Vitest red/green on new `test/mcp-server-surface.test.ts` cases | Passing | First run failed on a test assumption for `memory_file_history` plain text output; corrected test and reran: `test/mcp-server-surface.test.ts` passed 102/102 |
| MCP resources/prompts contract tests | Targeted Vitest red/green and scoped coverage | Passing | Covered endpoint registration, auth, resource read/list boundaries, prompt validation, prompt fallback, and decoded URI paths |
| Standalone/proxy and local fallback edge tests | Existing proxy/standalone tests plus new focused cases | Passing | Added proxy export/audit, generic non-content proxy wrapping, local export/audit, and unexpected tools/list fallback cases; targeted standalone/proxy/transport run passed 76/76 |
| Transport parser edge tests | `test/mcp-transport.test.ts` targeted run | Passing | Added LF-framed parsing, malformed header recovery, incomplete frame buffering, and `createStdioTransport` start/write/stop coverage |
| Full project verification | `npm test`, `npm run coverage`, `npm run lint`, `npm run skills:check`, scanners | Passing | Targeted MCP tests passed 11 files / 221 tests; `npm test` passed 145 files / 1797 tests; `npm run coverage` passed with global coverage thresholds and `src/mcp` at statements 92.07%, branches 81.4%, functions 92.92%, lines 92.65%; `npm run lint` passed; `npm run skills:check` passed; Semgrep completed with 0 findings; staged Gitleaks found no leaks |

## Progress

- [x] Goal created.
- [x] Branch `coverage/mcp-surface` created in isolated worktree.
- [x] Local dependencies installed from existing package metadata.
- [x] Baseline scoped MCP coverage measured.
- [x] Failing tests written and observed.
- [x] Implementation fixes, if any, completed. No production changes were needed; only a test assumption was corrected.
- [x] Scoped coverage target met.
- [x] Full verification completed.
- [x] Commit-ready staged diff prepared; commit hash will be reported in the handoff.

## Coverage Evidence

Baseline scoped MCP coverage command:

```bash
npx --no-install vitest run test/mcp-env-placeholder.test.ts test/mcp-project-scope.test.ts test/mcp-prompts.test.ts test/mcp-resources.test.ts test/mcp-standalone-proxy.test.ts test/mcp-standalone.test.ts test/mcp-surface-default.test.ts test/mcp-transport.test.ts test/tool-count-consistency.test.ts test/consistency.test.ts --exclude test/integration.test.ts --coverage --coverage.include='src/mcp/**/*.ts' --coverage.reporter=text --coverage.reporter=json-summary --coverage.reportsDirectory=coverage/mcp-baseline --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 --coverage.thresholds.statements=0
```

Baseline result: statements 50.57%, branches 38.4%, functions 66.37%, lines 51.86%.

After scoped MCP coverage command:

```bash
npx --no-install vitest run test/mcp-env-placeholder.test.ts test/mcp-project-scope.test.ts test/mcp-prompts.test.ts test/mcp-resources.test.ts test/mcp-server-surface.test.ts test/mcp-standalone-proxy.test.ts test/mcp-standalone.test.ts test/mcp-surface-default.test.ts test/mcp-transport.test.ts test/tool-count-consistency.test.ts test/consistency.test.ts --exclude test/integration.test.ts --coverage --coverage.include='src/mcp/**/*.ts' --coverage.reporter=text --coverage.reporter=json-summary --coverage.reportsDirectory=coverage/mcp-after --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 --coverage.thresholds.statements=0
```

After result: statements 91.97%, branches 81.03%, functions 92.92%, lines 92.54%.

## Review Notes

- The diff is test-only plus this task record; no MCP tool, REST endpoint, resource, prompt, or externally visible behavior contract was changed.
- The first new server-surface test run failed because `memory_file_history` returns plain context text, not JSON. The test was corrected to assert the existing contract and payload forwarding separately.
- Focused simplification pass kept the new coverage split across existing MCP test files plus one dedicated server-surface file; no shared test helper was extracted because the helpers are local to one harness and reuse would add indirection without reducing current duplication materially.
- No dependency, lockfile, production source, MCP tool registry, REST endpoint, resource, prompt, plugin, or package metadata changed. OSV was not run because this diff did not change dependency files, lockfiles, container images, vendored code, or package surfaces.
- Acceptance criteria are met by the staged diff: scoped MCP coverage exceeds 80% for lines/statements/functions/branches, required repo checks passed, and no externally visible MCP behavior was changed.

## Verification Evidence

- `npx --no-install vitest run test/mcp-env-placeholder.test.ts test/mcp-project-scope.test.ts test/mcp-prompts.test.ts test/mcp-resources.test.ts test/mcp-server-surface.test.ts test/mcp-standalone-proxy.test.ts test/mcp-standalone.test.ts test/mcp-surface-default.test.ts test/mcp-transport.test.ts test/tool-count-consistency.test.ts test/consistency.test.ts --exclude test/integration.test.ts` passed 11 files / 221 tests.
- `npm test` passed 145 files / 1797 tests.
- `npm run coverage` passed; global summary statements 61.28%, branches 52.38%, functions 63.26%, lines 63.14%; `src/mcp` summary statements 92.07%, branches 81.4%, functions 92.92%, lines 92.65%.
- `npm run lint` passed.
- `npm run skills:check` passed; 15 skills checked.
- `semgrep scan --config p/default --error --metrics=off .` completed with 0 findings.
- `git diff --check` passed.
- `gitleaks protect --staged --redact` scanned about 51.89 KB and found no leaks.

## Delegation Boundaries

No subagents are used for the initial implementation because the immediate bottleneck is integrated test design against one registered MCP handler surface. If independent final review becomes useful after the diff stabilizes, it will be recorded here.
