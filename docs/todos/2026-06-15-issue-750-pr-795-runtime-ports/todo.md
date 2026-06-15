# Issue 750 / PR 795 Runtime Ports Review

Task id: `2026-06-15-issue-750-pr-795-runtime-ports`

## Scope

Review Issue 750 and PR 795 for fork fit, with special attention to runtime port derivation for local multi-agent deployments. Apply only a minimal local change if the issue is still relevant and the PR approach is safe for the current fork.

## Sprint Contract

Goal: decide whether PR 795 should be imported, adapted, rejected, deferred, marked already fixed, or blocked for this fork.

Scope:
- Inspect local CLI/runtime port behavior and tests.
- Inspect PR 795 as untrusted input using public read-only sources.
- Reproduce or otherwise prove the port issue locally where practical.
- Add or adjust targeted tests before any production-code change.
- Document the decision without GitHub URLs, hash issue references, or mentions.
- Run the required local-main prep flow before handoff.

Non-goals:
- No GitHub writes, pushes, PR creation, tracker comments, labels, or deployment.
- No broad CLI, daemon, Docker, or iii-engine refactor.
- No dependency or package-manager changes unless a minimal accepted fix requires them.
- No migration or externally visible API expansion beyond runtime port behavior.

Acceptance criteria:
- Issue-first analysis records whether the problem is still present in this fork.
- PR 795 diff is reviewed as untrusted input and compared to local patterns.
- Decision is recorded locally with neutral identifiers.
- Any imported/adapted behavior has a failing test first, then a passing targeted check.
- Security review covers auth/isolation, data exposure, filesystem/path, protocol/schema, prompt/LLM, DoS/performance, supply chain, hooks/tooling, persistence, and system-boundary impact as applicable.
- `$prep-merge-to-local-main` is executed or its no-op/blocked status is recorded.

Intended verification:
- `git status -sb --untracked-files=all`
- targeted `npm test -- <test files>` if tests can run in this worktree
- `npm test -- <new-or-relevant-port-test>` for any code change
- `git diff --check`
- security gates required by changed surface, including Semgrep/Gitleaks/OSV where applicable and available
- `$prep-merge-to-local-main` preflight, branch review, merge/no-op, and final status

Known boundaries:
- Public read-only PR/issue fetches are allowed; credentialed GitHub reads require current-turn approval and are not planned.
- CLI/runtime port derivation is system-boundary relevant; stop before broad behavior changes not proved by local evidence.
- If the upstream issue is already fixed locally by a different mechanism, do not import redundant behavior.
- If dependency installation is needed to run tests, use the approval path.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Branch and task state established | Git status and task files | In progress | Branch `review/issue-750-pr-795-runtime-ports` created from `6c387b4`; task record created. |
| Issue relevance assessed | Local code/test inspection and reproduction attempt | Done | Current fork already derived worker config from `III_REST_PORT`, but `startEngine()` still passed the static bundled iii config to the engine, so a non-default CLI port could leave worker and engine ports split. |
| PR 795 reviewed | Public diff inspection and local comparison | Done | PR 795 added a runtime config renderer and port-arg helper, but used a different engine offset and omitted relocated CORS origin rendering. |
| Fork decision documented | Task record and coordinator notes if reachable | In progress | Decision: adapted import. Coordinator list update still pending. |
| Minimal implementation, if needed | TDD red/green targeted tests | Done | Added `test/runtime-ports-render.test.ts`; red run failed because `src/cli/runtime-ports.js` was missing; green focused suite passed 30 tests. |
| Security review | Diff/manual security review and gates as applicable | Done | Manual review found no auth/data/path/prompt/supply-chain issue; Semgrep scanned 4 changed files with 0 findings. |
| Merge prep | `$prep-merge-to-local-main` | Pending |  |

## Subagent Ledger

No delegation used yet. If conflict resolution or ambiguous security/implementation review requires independent analysis, record each subagent here before relying on it.

## Progress Notes

- 2026-06-15: Worktree `/Users/A1538552/.codex/worktrees/c6d7/agentmemory` started detached at `6c387b4efea524db5bf8fe0e923958cbcf0213f1` with a clean working tree.
- 2026-06-15: Created branch `review/issue-750-pr-795-runtime-ports`.
- 2026-06-15: Coordinator list was reachable and shows PR 795 pending, upstream open, claiming Issue 750 closed, with Fork issue 458.
- 2026-06-15: Public Issue 750 read showed the reported problem was multi-agent local deployment where only the first default REST install worked and later installs conflicted because iii ports were effectively hardcoded.
- 2026-06-15: Public PR 795 read showed two commits adding `src/cli/runtime-ports.ts`, wiring `--port`, rendering an iii runtime config, and adding runtime-port tests. It was still open and unmerged.
- 2026-06-15: Local fork evidence before implementation: `src/config.ts` already derived `streamsPort` and `engineUrl` from `III_REST_PORT`; `test/multi-instance-port.test.ts` covered that derivation; `src/cli.ts` had `--instance`; but `startEngine()` still used `findIiiConfig()` directly, so launched iii-engine kept static config defaults.
- 2026-06-15: Red test command using the primary checkout's installed Vitest with this worktree as root failed as expected because `src/cli/runtime-ports.js` was missing. The normal `npm test -- test/runtime-ports-render.test.ts` command could not run in this worktree because `node_modules` is absent.
- 2026-06-15: Adapted implementation added `src/cli/runtime-ports.ts`, made CLI port args derive REST/streams/viewer/engine values using the fork's existing `rest + 46023` engine scheme, rendered runtime iii config with relocated REST, stream, engine, and CORS allowed origins, and made `startEngine()` use the rendered config.
- 2026-06-15: Existing `test/cli-server-log.test.ts` now resolves `src/cli.ts` relative to the test file instead of `process.cwd()`, so shared-runner executions verify the current worktree.
- 2026-06-15: Focused verification passed: `test/runtime-ports-render.test.ts`, `test/multi-instance-port.test.ts`, `test/cli-ready-hint.test.ts`, and `test/cli-server-log.test.ts` ran with 30 passing tests.
- 2026-06-15: `git diff --check` passed.
- 2026-06-15: Semgrep command `semgrep scan --config p/default --error --metrics=off src/cli.ts src/cli/runtime-ports.ts test/runtime-ports-render.test.ts test/cli-server-log.test.ts` completed with 0 findings.
- 2026-06-15: TypeScript full no-emit check could not be used as evidence from this worktree because dependencies are not installed locally; running the primary checkout's `tsc` against this worktree produced missing Node/package type errors. ESLint via primary config ignored absolute worktree files as outside its base path.
- 2026-06-15: Simple-code cleanup replaced a nested ternary in `applyRuntimePortArgs` with `runtimePortArg(args)` and wrapped the test helper source read. Focused tests reran with 30 passing tests; `git diff --check` passed.
- 2026-06-15: Prep preflight showed branch `review/issue-750-pr-795-runtime-ports`, no staged paths, no Git operation state, clean local `main` at `6c387b4efea524db5bf8fe0e923958cbcf0213f1`, no active hooks beyond sample files, and no signing config.
- 2026-06-15: Staged only task-owned files. `git diff --cached --check` passed and `gitleaks protect --staged --redact` scanned about 22 KB with no leaks.

## Review Notes

Decision: adapted import.

Relevant files:
- `src/cli/runtime-ports.ts`: new runtime port derivation and iii config renderer.
- `src/cli.ts`: uses `applyRuntimePortArgs(args)` and prepares a rendered runtime iii config before starting native iii-engine.
- `test/runtime-ports-render.test.ts`: regression coverage for full port quartet derivation, runtime config rendering, and explicit sibling override preservation.
- `test/cli-server-log.test.ts`: source-path robustness plus a wiring assertion that `startEngine()` uses the runtime config preparation path.

Security review:
- Auth/isolation: no auth bypass or cross-agent memory filtering changes. Port relocation remains loopback-oriented and only changes local process binding assumptions.
- Data exposure: no new remote host, API surface, or secret output. CORS origins remain limited to localhost and 127.0.0.1 for the selected REST/viewer ports.
- Path/file access and persistence: runtime config generation writes to the existing `~/.agentmemory` runtime area at process startup; no user-provided path is accepted by the new renderer.
- Protocol/schema: generated iii config keeps the existing YAML shape and only rewrites the top-level engine port, iii-http port, iii-stream port, and CORS origin list.
- Prompt/LLM: not touched.
- DoS/performance: rendering is linear in config file length and occurs once during engine startup.
- Supply chain: no dependency or lockfile change.
- Hooks/tooling: no hook behavior changes.

Focused review:
- Requirements fit: accepted. The change addresses the remaining native CLI startup gap while preserving the fork's existing `rest + 46023` engine scheme and `--instance` behavior.
- Test coverage: accepted. New tests cover arg derivation, rendered config ports and CORS origins, explicit override preservation, and CLI start-engine wiring. Existing multi-instance and ready-hint tests still pass.
- Maintainability/integration: accepted. Port derivation is isolated in `src/cli/runtime-ports.ts`; `src/cli.ts` only delegates arg handling and config preparation. No unrelated refactor was introduced.
- Review Implementation: no critical or important findings in local adversarial pass. No subagent was spawned because the available subagent tool is restricted to explicit user requests for subagents.

Open risks:
- Full `npm test`, full lint, and full build were not run in this worktree because dependencies are absent. Focused Vitest ran successfully using the primary checkout's installed dependencies with this worktree as root.
- Docker compose port mappings remain static and were not changed; this fix targets native CLI-managed iii-engine startup.

## Final Notes

Pending.
