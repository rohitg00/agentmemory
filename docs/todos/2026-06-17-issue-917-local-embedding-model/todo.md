# Issue 917 Local Embedding Model Dimensions

## Sprint Contract

Goal: Decide and implement the locally actionable parts of upstream PR 943 for the fork's local embedding provider.

Scope:
- Inspect current local embedding provider behavior against Issue 917 / upstream PR 943.
- Preserve the fork's existing `LOCAL_EMBEDDING_MODEL` contract and multilingual default.
- Add focused tests before production code for local model precedence, known local model dimensions, dimension override validation, and transformer pipeline options.
- Update user-facing embedding configuration docs only where behavior changes.
- Run the mandatory GitHub feature-loop local push-prep phase without remote writes.

Non-goals:
- No PR, issue comment, push, publish, deployment, migration, or remote Git state change.
- No direct PR against `rohitg00/agentmemory`.
- No broad embedding provider refactor.
- No new dependencies or package manager config changes.
- No auth, REST, MCP, schema, export/import, hook, or iii-engine behavior changes.

Acceptance criteria:
- Validity decision is documented from repo evidence and independent read-only subagent evidence.
- `LOCAL_EMBEDDING_MODEL` remains supported and takes precedence for local embeddings.
- `EMBEDDING_MODEL` is accepted as a compatibility fallback for local embeddings when `LOCAL_EMBEDDING_MODEL` is unset.
- Known local embedding models can report non-384 dimensions without relying on vector mismatch errors.
- `OPENAI_EMBEDDING_DIMENSIONS` can explicitly override local provider dimensions and rejects invalid values.
- The local transformer pipeline is loaded with `{ local_files_only: true, quantized: false }`.
- README and `.env.example` describe the local model and dimension knobs without claiming unsupported behavior.
- Focused tests and project-native checks cover the changed surface.
- Mandatory local GitHub push-prep phase runs or records a blocker.

Intended verification:
- Red and green targeted Vitest for `test/embedding-provider.test.ts`.
- `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts` for the focused embedding provider suite.
- `corepack pnpm run build` for TypeScript/declaration output after changing the provider pipeline signature.
- `corepack pnpm test` before final readiness when dependencies are available.
- `git diff --check`.
- Required security gates for code/config/docs changes: Semgrep for the touched code/config/doc surface, OSV if dependency surfaces change, and staged Gitleaks before commit.

Known boundaries:
- This changes the local embedding provider's declared dimensions for selected local models. It does not migrate existing vector data.
- Dimension changes can make existing stored vectors incompatible until users rebuild or regenerate embeddings. The existing dimension guard prevents silent mixed-dimension vectors.
- `local_files_only: true` may require selected models to be pre-cached locally. This is an intentional adapted subset from PR 943 and must be documented plainly.
- Public GitHub reads are permitted for current metadata/diff. Fetch, pull, push, PR creation, issue comments, publishing, or credentialed/session actions remain unapproved.
- Preserve unrelated dirty work.

Stop conditions:
- A required fix would require persistence migration, schema/API changes, dependency changes, remote writes, or deleting/discarding user work.
- Validation reveals the provider cannot support configurable dimensions without broader vector-index redesign.
- Required security checks report unresolved findings or tools are unavailable without an acceptable substitute.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Validity decision | Local code/docs inspection plus read-only subagent | complete | Current provider already uses `LOCAL_EMBEDDING_MODEL` and multilingual default, but still hardcodes `dimensions = 384` and omits PR 943 pipeline options. Subagent Boyle independently reached the same partial-actionability decision. |
| Model env compatibility | Failing then passing local provider tests | complete | RED full-suite run failed as expected on local provider cases; GREEN `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts` passed 43/43. |
| Known local dimensions | Failing then passing local provider tests | complete | `Xenova/bge-large-zh-v1.5` reports 1024 and `Xenova/multilingual-e5-base` reports 768 in focused tests. |
| Dimension override validation | Failing then passing local provider tests | complete | `OPENAI_EMBEDDING_DIMENSIONS=512` override and invalid values are covered by focused tests. |
| Transformer pipeline options | Failing then passing local provider tests | complete | Focused tests assert local `pipeline()` receives `{ local_files_only: true, quantized: false }`. |
| Docs | README and `.env.example` inspection | complete | README and `.env.example` now document primary `LOCAL_EMBEDDING_MODEL`, fallback `EMBEDDING_MODEL`, dimension override, and local cache/offline behavior. Stale README `384-dimensional` restriction was removed. |
| Build/type contract | `corepack pnpm run build` | complete | Build completed successfully in ~7s with tsdown declaration generation. |
| GitHub push prep | `$github-push-prepare` local branch-prep phase | complete | Local `origin/main` base `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831` was already an ancestor of commit `f4e4f343`; no base merge needed. Fetch/push/PR creation were not run. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Validity investigation | Repo instructions, git state, embedding provider/config/tests/docs, issue/PR metadata | no | Validity decision with files, commands, evidence, uncertainty, risks | complete: partially valid/actionable, not direct import | Product decision around non-384 local embeddings remains the main risk. |
| Pre-implementation plan review | `docs/todos/2026-06-17-issue-917-local-embedding-model/plan.md` and source context | no | High/Medium plan findings or `ACCEPT` | complete: Bacon found two valid Medium plan gaps; plan updated | None. |
| Final focused review | Task-owned diff after implementation | no | Security/test/maintainability findings or `ACCEPT` | complete: security, test coverage, and maintainability reviewers returned `ACCEPT` | Reviewers relied on main-thread verification evidence and did not rerun commands. |

## Progress

- Worktree: `/Users/A1538552/.codex/worktrees/993e/agentmemory`.
- Initial git state: clean detached checkout at `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`.
- Branch created locally: `issue/917-local-embedding-model-dimensions`.
- Public upstream PR metadata: PR 943 is open, unmerged, head `ff9f7e54dc327cde92c4fdc3ad058838827b307e`; patch changes only `src/providers/embedding/local.ts`.
- Validity decision: adapted import. The old hardcoded model premise is stale in this fork, but dimension resolution, override validation, `EMBEDDING_MODEL` compatibility fallback, and transformer load options remain actionable if implemented without removing `LOCAL_EMBEDDING_MODEL`.
- Pre-code review: subagent Bacon found two valid Medium gaps. Plan updated to include the later README stale `384-dimensional` mention and `corepack pnpm run build` verification for the TypeScript/declaration contract.
- Dependency setup: `corepack pnpm install --frozen-lockfile --ignore-scripts --store-dir /tmp/agentmemory-issue917-pnpm-store` completed with scripts disabled. pnpm warned that `packages/mcp/node_modules/.bin/agentmemory` could not link `dist/cli.mjs` before build; later `corepack pnpm run build` generated `dist/cli.mjs`.
- RED: `corepack pnpm test -- --exclude test/integration.test.ts test/embedding-provider.test.ts` accidentally invoked the full suite because package-script argument forwarding inserted an extra `--`. It failed with 7 intended local-provider failures: missing local pipeline options, ignored `EMBEDDING_MODEL`, fixed 384 dimensions, missing local dimension override, and missing invalid dimension validation.
- GREEN focused: `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts` passed 1 file / 43 tests.
- `git diff --check`: passed with no output.
- Build/type verification: `corepack pnpm run build` passed. Build generated transient plugin artifact diffs; those task-caused build artifacts were restored so the working tree remains scoped to source/docs/tests/task state.
- Full verification: `corepack pnpm test` passed 171 files / 2232 tests in 98.25s.
- Security scan: `semgrep scan --config p/default --error --metrics=off src/providers/embedding/local.ts test/embedding-provider.test.ts README.md .env.example docs/todos/2026-06-17-issue-917-local-embedding-model/todo.md docs/todos/2026-06-17-issue-917-local-embedding-model/plan.md` passed with 0 findings across 6 files. OSV not run because no dependency, lockfile, container, vendored, or package-manager surfaces changed.
- Passive `$security-best-practices`: no matching non-web TypeScript/Node reference file was available; applied general secure-default review for env input, data egress, filesystem/cache behavior, and vector dimension persistence. No critical or major issue found.
- Final reviewers:
  - Test coverage reviewer: `ACCEPT`; key behavior covered, table not exhaustively tested but representative non-384 entries are sufficient for this diff.
  - Security/boundary reviewer: `ACCEPT`; no remote embedding auto-enable, no dependency/auth/REST/MCP/schema/hook changes, local-file mode reduces model-download/data-egress risk.
  - Maintainability/integration reviewer: `ACCEPT`; diff preserves `LOCAL_EMBEDDING_MODEL` precedence and remains scoped.
- Commit: `f4e4f343403021743ac0ec9dddb79ff1a488d1f7` (`fix: configure local embedding dimensions`).
- GitHub push-prep local phase:
  - Branch: `issue/917-local-embedding-model-dimensions`.
  - PR base used: local `refs/remotes/origin/main` at `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`; freshness unverified because `git fetch origin main` was not approved.
  - Branch diff from base: `.env.example`, `README.md`, task plan/todo docs, `src/providers/embedding/local.ts`, `test/embedding-provider.test.ts`.
  - Base integration: no-op; captured base is already an ancestor of `HEAD`.
  - Post-commit verification: `git diff --check 0cd8711303473b5cc1cd3ac7fd8739a2d40f8831...HEAD` passed; focused Vitest passed 43/43; `corepack pnpm run build` passed; `corepack pnpm test` passed 171 files / 2232 tests; Semgrep on changed surface passed with 0 findings.
  - Build regenerated transient plugin script artifacts; they were restored after verification. Final status is clean.
  - Remote writes not run. Next commands if approved later:
    - `git fetch origin main`
    - `git push -u origin issue/917-local-embedding-model-dimensions`
    - `gh pr create --base main --head issue/917-local-embedding-model-dimensions`
