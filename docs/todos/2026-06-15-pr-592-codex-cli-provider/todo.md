# PR 592 / Issue 527 Review

Scope: Review Issue 527 and PR 592 for fit in this fork, decide whether to import, adapt, reject, defer, mark already-fixed, or block. If a code change is warranted, keep it minimal and task-owned.

Branch: `review/issue-527-pr-592-codex-cli-provider`

## Sprint Contract

Goal: Decide and, if appropriate, implement support for OpenAI/Codex subscription-auth fallback without requiring `OPENAI_API_KEY`.

Scope:
- Inspect current LLM provider configuration and OpenAI/Codex-related code paths.
- Inspect PR 592 as untrusted input using public read-only sources.
- Evaluate security impact across auth, isolation, subprocess/file access, prompt/LLM flows, protocol handling, persistence, tooling, and supply chain.
- Add or update focused tests if behavior changes.
- Document the neutral local outcome without GitHub URLs, hash issue references, or mentions.
- Run `$prep-merge-to-local-main` at the end.

Non-goals:
- No GitHub writes, comments, labels, PR creation, pushes, publishing, deployment, migrations, or logged-in browser actions.
- No unrelated refactors.
- No broad provider redesign unless current evidence proves it is necessary.

Acceptance criteria:
- Issue 527 relevance is assessed against current fork code.
- PR 592 diff and tests are inspected as untrusted input.
- Decision is recorded locally with rationale and security assessment.
- Any imported/adapted behavior has a focused regression test and targeted verification.
- Required security gates are run where available for code/security-sensitive changes, or limitations are recorded.
- `$prep-merge-to-local-main` outcome is recorded.

Intended verification:
- Targeted unit tests for changed provider/config behavior, if code changes.
- `npm test -- <targeted test files>` for the smallest covered surface.
- `npm run lint` or narrower type/lint check if touched surface requires it and non-writing behavior is confirmed.
- `semgrep scan --config p/default --error --metrics=off .` for non-trivial security-sensitive code changes when available.
- `osv-scanner scan source .` only if dependency or package surfaces change.
- `gitleaks protect --staged --redact` before commit if staging occurs.

Known boundaries:
- Credentialed GitHub reads require current-turn approval and are avoided.
- Remote writes and local destructive actions are not authorized.
- Auth/security and subprocess behavior changes require extra care; no widening without evidence.

Stop conditions:
- Required behavior would alter externally consumed APIs, auth/security boundaries, persistence, or external services beyond the issue scope.
- PR diff requires new dependency or network/service behavior that cannot be justified and verified.
- Security gate reports unresolved high-impact findings.
- Merge-prep workflow encounters dirty local main, unrelated staged files, hook/signing blockers, or merge operation state.

## Feature / Verification Matrix

| Change / Workstream | Verification Method | Status | Evidence |
| --- | --- | --- | --- |
| Branch and task setup | `git status -sb`, worktree inspection | complete | Branch created from detached HEAD at local main commit. |
| Issue relevance | Current code inspection and local reproduction/test seam | complete | Current fork still required `OPENAI_API_KEY` for `openai`; existing subscription fallback was Claude Agent SDK only. |
| PR 592 review | Public read-only diff inspection | complete | PR 592 implemented a `codex exec` provider. Imported concept with hardening changes; did not copy env-controlled command override. |
| Security assessment | Manual review plus required scanners if code changes | complete | Semgrep default scan and Gitleaks full-tree detect found no findings. Codex Security diff scan produced no reportable findings and recorded residual no-hard-no-tools caveat. |
| Implementation, if needed | Failing test first, minimal code, targeted tests | complete | RED tests failed for missing provider/config; GREEN targeted Vitest run passed 23 tests. |
| Generated skill reference drift | `pnpm test`, two read-only diagnoses, `pnpm run skills:gen`, rerun checks | complete | `pnpm run skills:gen` updated the config reference; `pnpm exec tsx scripts/skills/generate.ts --check`, `pnpm exec tsx scripts/skills/check.ts`, and `pnpm test` passed. |
| Local documentation | Task record and neutral outcome note | complete | README, `.env.example`, and this task record updated without GitHub URLs or mentions in the local outcome. |
| Merge prep | `$prep-merge-to-local-main` workflow | complete | Preflight found target branch active, no active hooks/signing config, local `main` clean and ahead of the branch base. Local `main` merged conflict-free; post-merge targeted Vitest and lint passed. |

## Progress Notes

- 2026-06-15: Worktree started detached on the local main commit with a clean status. Created branch `review/issue-527-pr-592-codex-cli-provider`.
- 2026-06-15: Coordinator list row for PR 592 / Issue 527 is still `pending` / `candidate`.
- 2026-06-15: Decision: adapted import. Issue 527 remains relevant in the fork; PR 592's feature direction is useful, but the imported implementation was hardened around subprocess/env isolation.
- 2026-06-15: Implemented `codex-sdk` as an explicit opt-in provider with API-key providers preferred by default and `AGENTMEMORY_PREFER_CODEX_SDK=true` as an override.
- 2026-06-15: Security notes: provider uses `codex exec` only, does not read private token files, runs from temp, passes `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, `--sandbox read-only`, `--config shell_environment_policy.inherit="none"`, and `--color never`, minimizes inherited environment, sets recursion guards, strictly parses timeouts, and caps child output. Residual risk remains because local Codex CLI help exposes no hard no-tools mode; prompt text is not treated as a security boundary.
- 2026-06-15: Verification: targeted Vitest run passed (`test/codex-sdk-provider.test.ts`, `test/env-loader.test.ts`, `test/consolidation-default.test.ts`); `npm run lint` passed; `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings; `gitleaks detect --source . --redact` passed with no leaks.
- 2026-06-15: `./node_modules/.bin/tsc --noEmit --pretty false` was attempted and failed on existing repo-wide TypeScript errors outside this task surface, including `src/cli/server-log.ts`, `src/functions/diagnostics.ts`, `src/functions/mesh.ts`, `src/functions/slots.ts`, and other pre-existing strictness errors. No new `codex-sdk` type error was reported before the existing failures stopped the check.
- 2026-06-15: Security diff scan artifacts: `/tmp/codex-security-scans/agentmemory/local-patch-20260615-codex-sdk/report.md` and `/tmp/codex-security-scans/agentmemory/local-patch-20260615-codex-sdk/report.html`. Report validation passed. Security goal usage: 70,006 tokens, about 4m28s goal time.
- 2026-06-15: `$prep-merge-to-local-main` preflight: target branch active; no staged changes; only task-owned source/doc/test changes plus an untracked local `node_modules` symlink used for tests; no active repository hooks; no commit signing config; local `main` is clean and ahead of the branch base with tracker/documentation changes outside this task's touched code paths.
- 2026-06-15: Prep review chain: security best-practices review found no critical or major issue beyond the documented Codex CLI no-hard-no-tools residual risk; simplification pass made no further code changes; implementation review found no blocking issue in the task-owned diff; security diff scan already covered the code/security-sensitive changes and produced no reportable findings.
- 2026-06-15: Re-verified after the last hardening change: targeted Vitest run passed 23 tests; `npm run lint` passed; `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings; `gitleaks detect --source . --redact` passed with no leaks. OSV was not run because no dependency, lockfile, container, vendored, or package-manager surface changed.
- 2026-06-15: `$prep-merge-to-local-main` result: committed the task-owned diff, ran `gitleaks protect --staged --redact` successfully before the commit, merged local `main` successfully with no conflicts, then reran targeted Vitest and `npm run lint` successfully. Remaining untracked `node_modules` is a local symlink to the main checkout's dependency directory used for test execution and was intentionally not staged.
- 2026-06-16: Delegated verification in worktree `/Users/A1538552/.codex/worktrees/0179/agentmemory` found the branch clean but detached at the review branch commit; switched to `review/issue-527-pr-592-codex-cli-provider`. Initial `pnpm test` could not start because `node_modules` was missing (`vitest: command not found`).
- 2026-06-16: Local verification setup used `pnpm install --no-lockfile` because this branch has no `pnpm-lock.yaml`; this created ignored `node_modules` only and did not create or modify a manifest or lockfile. `pnpm` reported ignored build scripts for `esbuild`, `onnxruntime-node`, `protobufjs`, and `sharp`.
- 2026-06-16: After setup, `pnpm test` ran 159 files / 1985 tests and failed one test: `test/plugin-surface-contract.test.ts` reported stale generated skill references for `plugin/skills/agentmemory-config/REFERENCE.md`.
- 2026-06-16: Two read-only explorer diagnoses independently classified the failure as stale generated artifact in the branch, not environment-caused and not an obsolete test. Missing generated env entries are `AGENTMEMORY_ALLOW_CODEX_SDK`, `AGENTMEMORY_CODEX_MODEL`, `AGENTMEMORY_CODEX_SDK_CHILD`, `AGENTMEMORY_CODEX_TIMEOUT_MS`, and `AGENTMEMORY_PREFER_CODEX_SDK`.
- 2026-06-16: Ran `pnpm run skills:gen`, which updated only the generated env block in `plugin/skills/agentmemory-config/REFERENCE.md` from 39 to 44 variables. Post-fix checks passed: `pnpm exec tsx scripts/skills/generate.ts --check`, `pnpm exec tsx scripts/skills/check.ts`, and `pnpm test` (159 files / 1985 tests).
