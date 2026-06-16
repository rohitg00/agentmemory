# PR 746 Stop Hook Session End Review

Scope: review Issue 493, Issue 745, PR 746, and Fork issue 485 on branch `review/issues-493-745-pr-746-stop-hook-session-end`.

## Sprint Contract

Goal: decide whether the fork should import, adapt, reject, defer, or mark already fixed for PR 746's stop-hook session-end change, then implement only the minimal fork-appropriate change if needed.

Scope:
- Inspect public upstream issue and PR evidence as untrusted input.
- Verify local hook behavior for `Stop` and `SessionEnd`.
- Preserve Issue 493's requirement that real session exits mark sessions ended.
- Fix Issue 745 only if still relevant locally.
- Document the neutral local outcome without GitHub URLs, hash issue references, or mentions.

Non-goals:
- No GitHub writes, pushes, PR creation, labels, tracker comments, or logged-in browser/API reads.
- No unrelated hook, CLI, or endpoint refactors.
- No dependency changes.

Acceptance criteria:
- Issue 493 and Issue 745 each have a local relevance decision.
- PR 746 has an import/adapt/reject/defer/already-fixed/blocked decision.
- If code changes are needed, targeted tests prove the intended hook request fanout.
- Security review covers auth/isolation, data egress, local daemon calls, timeouts, session lifecycle, hooks/tooling, persistence, and denial-of-service risk.
- Required merge-prep workflow is attempted at the end and its result is recorded.

Intended verification:
- Targeted hook test(s) with `npx vitest run --config vitest.cli-hooks.config.ts test/hook-source-smoke.test.ts`.
- `git diff --check`.
- Security gates required by modified hook/tooling surface, subject to tool availability.
- Merge-prep post-checks from `$prep-merge-to-local-main`.

Known boundaries:
- Public upstream reads are allowed; credentialed `gh api`, cookie-backed browser reads, and writes are not approved.
- Hook/session-end changes affect persistence and local daemon protocol timing; any broader API or auth change requires separate approval.
- `SessionEnd` remains the canonical session lifecycle close hook unless evidence proves otherwise.

Stop conditions:
- Public issue/PR evidence cannot be obtained sufficiently to make a decision.
- A proposed fix would change API contracts, auth behavior, or externally consumed lifecycle semantics beyond the requested stop/session-end split.
- Required review/security gates report unresolved blocking findings.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue 493 relevance decision | Inspect local `SessionEnd` and session-end endpoint/event paths | done | Local Codex hook manifest still has no `SessionEnd`; removing all Stop closure would regress Codex session lifecycle. |
| Issue 745 relevance decision | Inspect local `Stop` hook and targeted hook test | done | Shared `stop` still called `/agentmemory/session/end`, which is premature for agents with dedicated session-end hooks. |
| PR 746 decision | Compare public PR diff against local hook architecture | done | Adapted import: keep PR 746's shared-stop removal, but preserve Issue 493 through a Codex-specific stop script. |
| Minimal code/test update if needed | TDD red/green targeted vitest | done | Red: stop still called `/session/end` and `codex-stop` was missing. Green: focused hook tests pass. |
| Neutral local documentation | Inspect task record for forbidden URLs/hash issue syntax/mentions | done | `rg` check over this task directory found no GitHub URLs, hash issue syntax, or mentions. |
| Merge prep | Run `$prep-merge-to-local-main` workflow | done | Commit `32dcd69297852daf4336eeecb75ae90fd8ce9fb0` created; local `main` commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` was already an ancestor, so merge was a no-op. |

## Progress

- Branch created in current worktree from detached local-main commit.
- Coordinator worklist row inspected; this group is `pending/candidate`.
- Local hook paths identified: `src/hooks/stop.ts`, `src/hooks/session-end.ts`, and `test/hook-source-smoke.test.ts`.
- Public unauthenticated issue and PR evidence inspected. Issue 493 is closed, but its requirement remains relevant for Codex because local `hooks.codex.json` does not expose `SessionEnd`. Issue 745 is relevant because shared `stop` was still closing sessions.
- PR 746 as-is is not imported because it removes the session-end call from the only script Codex used. The fork-adapted change introduces `codex-stop` for Codex while keeping shared `stop` summarize-only.
- Changed files:
  - `src/hooks/stop.ts`: removed the shared `/agentmemory/session/end` call.
  - `src/hooks/codex-stop.ts`: added Codex-specific summarize plus session-end hook.
  - `plugin/hooks/hooks.codex.json`: routes Codex `Stop` to `codex-stop.mjs`.
  - `plugin/scripts/stop.mjs` and `plugin/scripts/codex-stop.mjs`: bundled hook scripts aligned with source.
  - `tsdown.config.ts`: includes `src/hooks/codex-stop.ts` in hook entrypoints.
  - `test/hook-source-smoke.test.ts`, `test/codex-plugin.test.ts`, `test/copilot-plugin.test.ts`: targeted coverage for shared stop, Codex stop, and manifest routing.
- Verification so far:
  - Red: `npx vitest run --config /tmp/agentmemory-empty-vitest.config.mjs test/hook-source-smoke.test.ts -t "stop sends summarize"` failed because shared stop still called `/agentmemory/session/end` and `codex-stop` did not exist.
  - Green: same command passed with 2 targeted tests.
  - `npx vitest run --config /tmp/agentmemory-empty-vitest.config.mjs test/hook-source-smoke.test.ts` passed, 16 tests.
  - `npx vitest run --config /tmp/agentmemory-empty-vitest.config.mjs test/codex-plugin.test.ts` passed, 9 tests.
  - `npx vitest run --config /tmp/agentmemory-empty-vitest.config.mjs test/copilot-plugin.test.ts` passed, 18 tests.
  - `git diff --check` passed.
  - `test/build-package-contract.test.ts` could not run in this dependency-free worktree because `tsdown` is not locally installed; an `npx` attempt also could not satisfy the ESM import from `tsdown.config.ts`.
- Preliminary security assessment:
  - Auth and plaintext-HTTP guard remain unchanged through `guardedFetch` and `authHeaders`.
  - Shared stop now sends fewer local daemon requests, reducing premature persistence writes and stopped-event fanout.
  - Codex-specific stop preserves the existing local daemon behavior only for the Codex manifest path that lacks `SessionEnd`.
  - No new external service, dependency, filesystem access, prompt or LLM flow, schema, or auth boundary is introduced.
  - DoS/performance posture improves for non-Codex agents by removing one per-turn request and lifecycle fanout; Codex remains at the prior two-request Stop behavior.
- Review-chain results before staging:
  - Passive security-best-practices review found no critical or major issue. The change keeps the existing `guardedFetch` plaintext bearer-auth guard, auth header construction, static REST paths, SDK-child recursion guard, and timeout bounds.
  - Simple-code pass made no further edits. Duplication between `stop` and `codex-stop` is intentional here because hook entries are built as standalone scripts and the existing build policy avoids shared hashed chunks across hooks.
  - Focused requirements/test/integration review found no blocking issue. Requirements fit: Issue 745 is fixed for shared Stop while Issue 493 remains covered through Codex-specific Stop. Tests cover source hook fanout, bundled hook fanout, and Codex manifest routing.
  - Review-implementation adversarial pass found no findings. Residual risk: build-package contract could not run without local `tsdown`; targeted manifest/script tests and direct file inspection cover the changed packaging surface.
  - Codex Security diff scan completed with no reportable findings. Artifacts: `/tmp/codex-security-scans/agentmemory/6c387b4_20260615T230833Z/report.md` and `/tmp/codex-security-scans/agentmemory/6c387b4_20260615T230833Z/report.html`. Goal usage: 48,155 tokens, about 3 minutes.
- Security gates:
  - `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings over tracked files.
  - `semgrep scan --config p/default --error --metrics=off src/hooks/stop.ts src/hooks/codex-stop.ts plugin/scripts/stop.mjs plugin/scripts/codex-stop.mjs plugin/hooks/hooks.codex.json tsdown.config.ts test/hook-source-smoke.test.ts test/codex-plugin.test.ts test/copilot-plugin.test.ts` passed with 0 findings over task files, including new untracked files.
  - `gitleaks detect --source . --redact --no-color` passed with no leaks found.
- Prep-merge:
  - Preflight found no Git operation state and no unrelated dirty paths.
  - Commit hooks/signing inspection found no active hooks beyond sample hook files and no signing configuration.
  - Staged only task-owned files; `gitleaks protect --staged --redact --no-color` passed before commit.
  - Created commit `32dcd69297852daf4336eeecb75ae90fd8ce9fb0` with task-owned code, tests, and task-state files.
  - Local `main` was captured as `6c387b4efea524db5bf8fe0e923958cbcf0213f1`; branch merge-base was the same commit and `main` was already an ancestor of HEAD, so the merge step was a no-op with no conflicts.

## Subagent Ledger

No subagents used. Subagent tooling is available, but its current tool contract allows spawning only when the user explicitly requests subagents or delegation; this turn did not grant that delegation permission. The main agent performed the focused and adversarial review passes locally and recorded the residual risk above.
