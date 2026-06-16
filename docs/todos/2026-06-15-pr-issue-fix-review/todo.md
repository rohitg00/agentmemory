# PR Issue Fix Review Group

Scope: `src/triggers/api.ts`, `test/api-session-start.test.ts`, `README.md`, and this review task record.

## Sprint Contract

Goal: issue-first review of Issue 244 and PR 318, then decide whether the fork should import, adapt, reject, defer, mark already-fixed, or block the change.

Non-goals:
- Do not write to GitHub, create comments, update labels, push branches, create pull requests, or update tracker state.
- Do not import unrelated PR behavior or broaden session metadata beyond the reviewed endpoint.
- Do not change persistence schema, auth requirements, hook wiring, external services, dependencies, or endpoint counts.

Acceptance criteria:
- Issue 244 is understood before judging PR 318.
- PR 318 diff and tests are checked against current fork code.
- Hook/session metadata parsing treats request payloads as untrusted.
- The decision is recorded with evidence and residual risk.
- Worklist row for PR 318 is updated using neutral IDs only.
- Targeted verification and required security gates are run or blockers are recorded.
- `prep-merge-to-local-main` is run at the end with its gates.

Intended verification:
- `npm test -- test/api-session-start.test.ts test/opencode-auto-context.test.ts test/observe-implicit-session.test.ts`
- `git diff --check`
- Lint or targeted type/build check if dependency state allows it.
- Diff-scoped security review for API protocol/persistence handling.

Known boundaries:
- Public unauthenticated reads are allowed for issue and PR evidence.
- Credentialed GitHub reads, logged-in browser reads, GitHub writes, pushes, tracker updates, comments, labels, and pull request creation are out of scope.
- Session labels are persisted user-provided metadata, so only bounded strings should be accepted.

Stop conditions:
- Stop before auth, schema, migration, storage-boundary, remote-write, dependency, or hook-install changes outside the reviewed scope.
- Stop if required security gates report unresolved high-impact findings.

## Issue-First Notes

Issue 244 reports that OpenCode-created sessions can appear with raw session IDs because the OpenCode plugin sends a session title during `session.created`, while the session-start REST handler historically ignored that title. It also notes a race where prompt submission may arrive before the session row exists, so relying only on later prompt capture can leave `firstPrompt` empty.

Current fork evidence:
- `plugin/opencode/agentmemory-capture.ts` sends `title: info?.title ?? null` to `/agentmemory/session/start` during `session.created`.
- `src/triggers/api.ts` already accepted `title` and wrote it to both `summary` and `firstPrompt`, so the core Issue 244 behavior was partially already fixed locally.
- The current fork did not accept explicit `summary` and `firstPrompt` fields from session-start payloads.

## Decision

Fork decision: adapt.

Rationale: PR 318's core `title` fallback is already present, but the PR adds a small useful API behavior: clients may provide distinct `summary` and `firstPrompt` values. The adapted fork implementation keeps that behavior and hardens the boundary by accepting only strings, trimming, normalizing whitespace, and bounding persisted preview sizes.

Rejected parts:
- No raw PR import because current fork already has agent attribution behavior in the same endpoint and local memory-search changes nearby.
- No extra endpoint, schema, dependency, or hook wiring changes.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Session-start accepts distinct `summary` and `firstPrompt` | Targeted API test | passed | `corepack pnpm exec vitest run --exclude test/integration.test.ts test/api-session-start.test.ts test/opencode-auto-context.test.ts test/observe-implicit-session.test.ts`: 3 files, 10 tests passed. |
| OpenCode `title` still falls back to session display fields | Targeted API test and source inspection | passed | `plugin/opencode/agentmemory-capture.ts` sends `title`; API test covers fallback. |
| Untrusted label payloads are bounded and type-checked | Targeted malformed-input test and security review | passed | Test covers non-string and long whitespace-heavy labels; security diff scan found no reportable findings. |
| Worklist row updated neutrally | File inspection | passed | `pr-issue-fix-review-list.md` updated without URLs or hash refs. |

## Review Notes

- The requested existing task directory was absent from local `main` and this branch, so this task record and worklist were created in the requested path.
- Issue and PR metadata were read from public unauthenticated sources and treated as untrusted review evidence.
- `corepack pnpm install --no-lockfile --ignore-scripts` was used only to materialize ignored `node_modules/` for local verification because the worktree had no lockfile and no dependency directory. It did not create or modify package manifests or lockfiles.
- `security-best-practices`: passive JavaScript/Node boundary review found no critical or major issue; changed body fields are type-checked, normalized, bounded, and persisted only as display metadata.
- `simple-code`: focused cleanup pass over the changed API helper and tests found no behavior-preserving simplification that would reduce complexity without weakening boundary validation.
- `requesting-code-review`: subagent dispatch was not run because the available subagent tool requires an explicit user request for subagents; local focused review checked requirements fit, test coverage, integration risk, and task-scope drift.
- `review-implementation`: local adversarial review found no blocking correctness, scope, or verification issue. Residual risk is limited to runtime behavior depending on a live iii engine, which was not needed for this boundary-level unit coverage.
- `codex-security:security-diff-scan`: no reportable findings. Markdown and HTML report were written under `/tmp/codex-security-scans/agentmemory/60099a3_20260616T025912Z/`; goal usage was 66983 tokens and 104 seconds.

## Verification Evidence

- `corepack pnpm exec vitest run --exclude test/integration.test.ts test/api-session-start.test.ts test/opencode-auto-context.test.ts test/observe-implicit-session.test.ts`: passed, 3 files, 10 tests.
- `git diff --check`: passed.
- `corepack pnpm run lint`: passed.
- `semgrep scan --config p/default --error --metrics=off .`: passed, 0 findings.
- Security diff scan report validation: passed.
- Security diff scan HTML render: passed.
- `gitleaks protect --staged --redact`: passed, no leaks found.

## Security Notes

- The adapted API accepts only string `title`, `summary`, and `firstPrompt` values.
- Persisted previews are whitespace-normalized and bounded before storage.
- The existing authenticated endpoint and existing session ID, project, cwd, and agent ID handling are unchanged.
- Viewer session preview rendering escapes content before insertion.
- No path/session-id parsing, filesystem access, subprocess execution, outbound network call, schema change, migration, or persistence scope change was introduced.
