# Issue 809 OpenRouter Embedding Dimensions

Scope: `agentmemory` fork worktree at `/Users/A1538552/.codex/worktrees/8541/agentmemory`.

Branch: `review/issue-809-pr-856-openrouter-embedding-dimensions`.

## Sprint Contract

Goal: validate Issue 809 and adapt the smallest safe OpenRouter embedding-dimension fix for this fork.

Scope:
- `src/providers/embedding/openrouter.ts`
- `test/embedding-provider.test.ts`
- `.env.example`
- `README.md` embedding configuration references

Non-goals:
- No remote issue, label, PR, push, deploy, migration, dependency, version, MCP tool, REST endpoint, KV scope, or audit-operation changes.
- No broad upstream import from PR 856 or PR 811.

Acceptance criteria:
- OpenRouter embedding provider keeps 1536 dimensions by default.
- `OPENROUTER_EMBEDDING_DIMENSIONS` accepts positive integers and rejects invalid values.
- Configured non-default dimensions are exposed via `provider.dimensions`.
- OpenRouter request bodies include `dimensions` only when explicitly configured.
- Local docs mention the new environment variable.

Intended verification:
- Red/green targeted regression: `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run test/embedding-provider.test.ts`
- `npm run build`
- `npm run lint`
- `npm test`
- Security gates according to scope before commit: Semgrep, OSV, staged Gitleaks.

Known boundaries:
- This changes outbound request shape only for explicitly configured OpenRouter embedding dimensions.
- No API/CLI/MCP tool counts change.

Stop conditions:
- Any change requiring auth, secrets, schema migration, new external services, dependency changes, or remote state updates.
- Required security scanner findings or unavailable mandatory gates without current-turn acceptance.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| OpenRouter dimensions env override | Targeted regression tests | passed | Red: `./node_modules/.bin/vitest run test/embedding-provider.test.ts` failed 3 OpenRouter tests against hardcoded provider. Green: same command passed 25 tests. |
| Conditional `dimensions` request body | Targeted regression tests | passed | Red/green covered configured and unset/blank request bodies. |
| Env/docs update | Diff inspection and grep | passed | `rg -n "OPENROUTER_EMBEDDING_(MODEL|DIMENSIONS)|OpenRouter" ...` showed consistent OpenRouter model/dimensions references in `.env.example`, README, provider, and tests. |
| Security review | Manual scope review plus Semgrep/OSV/Gitleaks gates | partial | Semgrep passed with 0 findings. OSV passed with no issues after `-r --allow-no-lockfiles`, but found no package sources because this repo has no lockfiles in the worktree. Diff-scoped security scan found no candidate finding. Gitleaks pending after staging. |

## Candidate Comparison

Issue disposition: open upstream; relevant to this fork because local `OpenRouterEmbeddingProvider` still hardcodes `dimensions = 1536`.

PR 856 disposition: adapt. Smaller diff: `.env.example`, `src/providers/embedding/openrouter.ts`, `test/embedding-provider.test.ts`; 81 additions and 1 deletion. Correct core behavior but sends `dimensions` on every OpenRouter embedding request, which is broader than necessary.

PR 811 disposition: partially adapt. Larger diff: `.env.example`, `README.md`, `src/providers/embedding/openrouter.ts`, `test/embedding-provider.test.ts`; 137 additions and 5 deletions. Better compatibility posture because it only sends `dimensions` when configured, but imports more test/doc churn than needed.

Fork decision: adapt a minimal local patch: PR 856 scope, plus PR 811's conditional request-body behavior and README coverage.

Baseline evidence:
- Current local provider declares `readonly dimensions = 1536`.
- Current request body contains only `model` and `input`.
- `.env.example` and README document OpenAI embedding dimensions but not OpenRouter embedding dimensions.

Security assessment:
- Surface touches outbound OpenRouter embedding networking.
- No new endpoint, auth path, secret storage, filesystem, subprocess, dependency, persistence, schema, MCP, REST, hook, or package-manager surface.
- Request body adds a numeric field only when explicitly configured and validated as a positive integer.

## Progress

- [x] Read active instructions, worklist row, fork workflow docs, package scripts, and affected provider/tests/docs.
- [x] Created branch `review/issue-809-pr-856-openrouter-embedding-dimensions`.
- [x] Compared public unauthenticated Issue 809 / PR 856 / PR 811 metadata and diffs.
- [x] Write failing regression tests.
- [x] Implement minimal provider and docs patch.
- [ ] Run verification and security gates.
- [ ] Run prep-merge-to-local-main.

## Commands

- `npx vitest run test/embedding-provider.test.ts --runInBand` failed before test execution because the isolated worktree had no `node_modules`, `npx` attempted a temporary install, and this Vitest CLI does not support `--runInBand`.
- Created untracked local verification symlink `node_modules -> /Users/A1538552/_projects/_tools/agentmemory/node_modules`; do not stage.
- `./node_modules/.bin/vitest run test/embedding-provider.test.ts` red result: failed 3 OpenRouter tests, 22 passed.
- `./node_modules/.bin/vitest run test/embedding-provider.test.ts` green result: 25 passed.
- `git diff --check` passed.
- `npm run build` passed. It emitted existing tsdown warnings about deprecated `external`/`inlineOnly`, plugin timings, and ineffective dynamic imports; it generated ignored `dist/` and plugin script map/declaration artifacts.
- `npm run lint` passed.
- `npm test` passed: 157 test files, 1978 tests.
- `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings.
- `osv-scanner scan source .` failed with no package sources under this OSV CLI.
- `osv-scanner scan source -r --allow-no-lockfiles .` passed with no issues and no package sources found.
- Codex Security diff scan, compact local-patch mode: changed files `.env.example`, `README.md`, `src/providers/embedding/openrouter.ts`, `test/embedding-provider.test.ts`; no candidate finding survived discovery. The provider keeps the existing HTTPS OpenRouter URL, existing bearer header path, existing timeout wrapper, and adds only a validated positive integer JSON field when explicitly configured.
- Removed task-owned untracked `node_modules` symlink after test/build/lint verification.

## Review Notes

- `security-best-practices` passive secure-default review: no critical or major issue. The changed value is external input from env but is constrained to decimal positive safe integers before it can affect outbound JSON.
- `simple-code` pass: no cleanup change needed beyond tightening numeric parsing to decimal digits plus safe integer.
- `requesting-code-review`: independent subagent dispatch was not run because the active Codex subagent tool allows spawning only when the user explicitly requests subagents or parallel agent work. Fallback: local focused review performed against the task-owned diff.
- `review-implementation`: no findings. Scope matches Issue 809, tests cover default, configured, blank, request body, and invalid-value behavior. No MCP/REST/version/KV/audit/hook/plugin count rule is triggered.
