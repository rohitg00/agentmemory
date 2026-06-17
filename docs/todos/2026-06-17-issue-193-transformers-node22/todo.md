# Issue 193 Transformers Node 22

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/5c1b/agentmemory`
- Branch: `github-pr/issue-193-transformers-node22-ce60bba`
- GitHub issue: fork issue #193, mirrored from upstream issue #479
- Owning scope: local embedding/runtime compatibility for `@xenova/transformers` usage in text embeddings, CLIP image embeddings, and reranking

## Assumptions

- User approval is not granted for fetch, pull, push, PR creation, PR merge, publish, deploy, migrations, destructive cleanup, or remote state changes.
- User approval is not granted for dependency, lockfile, provider contract, or runtime contract changes unless separately requested and approved.
- A code-only compatibility change is preferred if it avoids dependency and lockfile changes while preserving existing provider selection behavior.
- No durable spec exists; the current user request and this task record are the source of truth.

## Sprint Contract

Goal: Fix or clearly bound issue #193, where `@xenova/transformers@2.17.2` on Node.js 22+ can send ONNX WASM fallback through a worker URL path that fails with `blob:nodedata:`.

Scope:
- Investigate the current `@xenova/transformers` load paths used by local embeddings, CLIP image embeddings, and reranking.
- Prefer a code-only compatibility shim that configures the bundled ONNX backend before pipeline creation.
- Add focused tests proving the compatibility configuration is applied before local, CLIP, and reranker pipeline creation.
- Keep README/API/tool counts and dependency manifests unchanged unless an approval blocker is reached.

Non-goals:
- No migration to `@huggingface/transformers` v3 without approval.
- No dependency, lockfile, or package-manager policy change without approval.
- No health/viewer failure-rate reporting for embedding failures in this task.
- No fetch, push, PR creation, or remote issue update in this thread.

Acceptance criteria:
- Local text embeddings, CLIP image embeddings, and reranker all load transformers through one shared compatibility path.
- On Node.js, the compatibility path disables ONNX WASM threading by setting `env.backends.onnx.wasm.numThreads = 1` before calling `pipeline`.
- Existing model selection and explicit embedding-provider opt-in behavior remain unchanged.
- Tests fail before implementation and pass after implementation.
- Targeted repo-native verification passes or blockers are recorded with evidence.

Intended verification:
- `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts`
- `corepack pnpm exec eslint src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts`
- `corepack pnpm exec tsc --noEmit` as a baseline comparison check; full pass is not assumed on this branch.
- `semgrep scan --config p/default --error --metrics=off .`
- `gitleaks protect --staged --redact` after staging and before commit.
- Additional targeted command if dependency setup or generated-doc drift blocks full checks.

Known boundaries:
- `corepack pnpm install --frozen-lockfile --ignore-scripts` was used only to materialize pinned dependencies for verification; no manifest or lockfile change is intended.
- Direct runtime import of `@xenova/transformers` in this worktree currently fails because `sharp` was installed with scripts ignored; that is a verification setup limitation, not the reported Node 22 worker error.
- The lockfile still contains nested `onnxruntime-node@1.14.0` and `onnxruntime-web@1.14.0` under `@xenova/transformers@2.17.2`; changing that requires approval.

Stop conditions:
- A fix requires dependency, lockfile, provider/runtime contract, Node engine, or package-manager policy changes.
- Tests show the code-only compatibility path cannot be applied before pipeline construction.
- Verification repeatedly fails for reasons not attributable to this task and no targeted substitute proves the changed surface.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Shared Xenova compatibility loader | Focused tests assert `numThreads` is forced to `1` before pipeline creation | Done | RED: focused Vitest failed 4 expected `numThreads` assertions with value `4`; GREEN: `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts` passed 47 tests |
| Local text embedding loader uses shared path | `test/embedding-provider.test.ts` focused test | Done | Local provider model tests pass through mocked `loadTransformers()`; compatibility test observes `numThreads=1` |
| CLIP text and image embedding loader uses shared path | `test/embedding-provider.test.ts` focused tests | Done | CLIP text and `embedImage()` tests pass through mocked `loadTransformers()` and assert expected pipeline tasks |
| Reranker loader uses shared path | `test/reranker.test.ts` focused test | Done | Reranker path test observes `numThreads=1` and expected `text-classification` pipeline args |
| No dependency/lockfile change | `git diff --name-status package.json pnpm-lock.yaml` | Done | No output |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Pre-implementation plan review | `docs/todos/2026-06-17-issue-193-transformers-node22/plan.md`, relevant provider/test files | No | High/Medium findings only | Complete | Valid Medium findings were fixed in plan before implementation |
| Implementation | `src/providers/transformers.ts`, `src/providers/embedding/local.ts`, `src/providers/embedding/clip.ts`, `src/state/reranker.ts`, `test/embedding-provider.test.ts`, `test/reranker.test.ts` | Yes | TDD patch and targeted verification | Complete | Code-only fix implemented; no dependency or lockfile change |
| Final review | Task-owned diff | No | Security/test/maintainability findings | Complete | Security, test coverage, and maintainability accepted after re-review |

## Progress

- 2026-06-17: Read repo-local `AGENTS.md`, README excerpt, package scripts, package metadata, lockfile, issue #193 public API body, and relevant provider/test files.
- 2026-06-17: Created branch `github-pr/issue-193-transformers-node22-ce60bba` from detached HEAD `ce60bba`.
- 2026-06-17: Materialized pinned dependencies with `corepack pnpm install --frozen-lockfile --ignore-scripts`; no git-tracked changes resulted.
- 2026-06-17: Root-cause evidence: `onnxruntime-web@1.14.0` uses threaded WASM when `numThreads > 1`; that path creates `Blob` worker URLs. Setting `numThreads = 1` disables `useThreads` in the installed `wasm-factory.ts`.
- 2026-06-17: Pre-implementation review round found valid Medium issues in the initial plan: tests had to assert `numThreads` at `pipeline()` call time, the reranker test needed a local fixture, CLIP image embedding needed direct coverage, and full `tsc --noEmit` is a known baseline comparison check rather than an expected-pass gate. Updated `plan.md` accordingly.
- 2026-06-17: Second pre-implementation review found a valid Medium issue: the shared `TransformersModule` type was too broad for strict CLIP assignments. Updated `plan.md` to make `loadTransformers()` generic and keep a CLIP-local narrowed module type.
- 2026-06-17: Final pre-implementation review found a valid Medium process gap: mandatory Semgrep and staged Gitleaks gates were missing before commit. Updated `plan.md` and intended verification accordingly.
- 2026-06-17: RED verification: `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts` failed 4 new expected assertions because `wasm.numThreads` remained `4`.
- 2026-06-17: Implemented `src/providers/transformers.ts`, routed local embeddings, CLIP embeddings, and reranker through `loadTransformers()`, and kept provider-specific type narrowing.
- 2026-06-17: GREEN verification: `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts` passed 47 tests.
- 2026-06-17: Focused lint: `corepack pnpm exec eslint src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts` passed.
- 2026-06-17: Baseline comparison: `corepack pnpm exec tsc --noEmit` exited 2 with existing diagnostics outside task-owned files; no diagnostics were reported for `src/providers/transformers.ts`, `src/providers/embedding/local.ts`, `src/providers/embedding/clip.ts`, `src/state/reranker.ts`, `test/embedding-provider.test.ts`, or `test/reranker.test.ts`.
- 2026-06-17: Security gate: `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings, 507 rules, 671 targets scanned. Because the broad Semgrep command reports only git-tracked targets, also ran `semgrep scan --config p/default --error --metrics=off src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts`, which passed with 0 findings across 6 task-owned files.
- 2026-06-17: Final review: security accepted; test coverage accepted. Maintainability found valid Medium issues: missing real `loadTransformers()` integration coverage and stale task-state matrix/ledger. Added a direct `@xenova/transformers` mock test for real `loadTransformers()` and updated this task record.
- 2026-06-17: Maintainability re-review accepted the `loadTransformers()` integration test and updated task-state record; no remaining High/Medium findings.

## Review Notes

- Sprint Contract status: met for code-only compatibility scope. No dependency, lockfile, provider replacement, Node engine, health endpoint, viewer, fetch, push, or PR changes were made.
- Verification evidence:
  - `corepack pnpm exec vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/reranker.test.ts`: PASS, 47 tests.
  - `corepack pnpm exec eslint src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts`: PASS.
  - `corepack pnpm exec tsc --noEmit`: BASELINE BLOCKED, exit 2 with unrelated diagnostics outside task-owned files.
  - `semgrep scan --config p/default --error --metrics=off .`: PASS, 0 findings.
  - `semgrep scan --config p/default --error --metrics=off src/providers/transformers.ts src/providers/embedding/local.ts src/providers/embedding/clip.ts src/state/reranker.ts test/embedding-provider.test.ts test/reranker.test.ts`: PASS, 0 findings.
  - `gitleaks protect --staged --redact`: PASS, no leaks found.
  - `git diff --name-status package.json pnpm-lock.yaml`: PASS, no output.
- Residual risks:
  - Full runtime import of the real `@xenova/transformers` package in this worktree is still limited by `--ignore-scripts` dependency setup leaving `sharp` native bindings unavailable; mocked tests cover the code path without model downloads or native package builds.
  - Full `tsc --noEmit` remains blocked by unrelated baseline diagnostics in existing files.
