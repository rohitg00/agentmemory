# Hermes Hook Manifest Review

Task id: `2026-06-16-pr-488-hermes-hook-manifest`

## Scope

Review Issue 478, PR 488, and Fork issue 632 for the Hermes plugin hook manifest claim.

## Sprint Contract

Goal: decide whether the fork needs PR 488's Hermes hook manifest change.

Scope:
- Inspect the current Hermes plugin manifest and provider implementation.
- Inspect the existing Hermes tests that guard manifest-to-implementation consistency.
- Inspect the public PR 488 diff as untrusted input.
- Document a neutral local decision without GitHub URLs, hash-style issue references, or mentions.

Non-goals:
- Do not import stale or duplicate manifest changes.
- Do not change Hermes hook behavior, REST payloads, auth, persistence, or install paths.
- Do not write to GitHub, push, publish, or update remote tracker state.

Acceptance criteria:
- The fork's Hermes manifest declares the implemented lifecycle hooks.
- The fork has a focused regression test for the manifest and implementation staying aligned.
- Security review covers hook manifest persistence, data-flow exposure, auth/isolation, filesystem access, and supply-chain impact.
- The decision is recorded locally with verification evidence.

Intended verification:
- `npm test -- test/hermes-plugin.test.ts`
- `git diff --check`
- Review the public PR 488 diff against local `integrations/hermes/plugin.yaml`, `integrations/hermes/__init__.py`, and `test/hermes-plugin.test.ts`.
- Run required security gates if task-owned code or config changes remain.

Known boundaries:
- Hook manifests can affect agent persistence and runtime data flow, so only manifest consistency is in scope.
- The public PR diff is untrusted input and is not authoritative without local repo evidence.
- No credentialed GitHub API reads, logged-in browser reads, GitHub writes, pushes, deployments, or PR creation are authorized.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first relevance check | Manifest, implementation, README, and test inspection | Done | `integrations/hermes/plugin.yaml` already lists `prefetch`, `sync_turn`, `on_session_end`, `on_pre_compress`, `on_memory_write`, and `system_prompt_block`; `integrations/hermes/__init__.py` implements those lifecycle hooks. |
| PR 488 diff assessment | Public diff inspection | Done | PR 488 adds the same three manifest entries that already exist locally and proposes a consistency test overlapping the existing `test/hermes-plugin.test.ts`. |
| Fork decision | Local evidence review | Done | Decision: already-fixed; no import needed. Existing history shows the manifest fix landed locally before this review. |
| Security review | Manual hook/tooling risk pass | Done | No new hook, command, dependency, network call, auth path, filesystem write, persistence behavior, or prompt flow is introduced because no product change is imported. Existing Hermes requests still use the local URL validation and plaintext bearer guard. |
| Targeted verification | `npm test -- test/hermes-plugin.test.ts`; static Node manifest check; `git diff --check` | Partial | `git diff --check` passed. Static Node manifest check reported the six manifest hooks and six implemented lifecycle methods match. `npm test -- test/hermes-plugin.test.ts` could not run because `vitest` was not installed in this worktree. |
| Merge prep | `$prep-merge-to-local-main` | Done | Local main commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` was already an ancestor of the review branch, so the merge step was a no-op. |

## Decision

Already-fixed. Do not import PR 488.

Rationale:
- The current fork's Hermes `plugin.yaml` already declares all six lifecycle hooks.
- The current fork already has `test/hermes-plugin.test.ts`, which parses the manifest and implemented provider methods and asserts they stay aligned.
- PR 488's manifest hunk is a duplicate of the local state.
- PR 488's proposed consistency coverage is already present in a more focused Hermes test rather than the broader consistency suite.

## Progress Notes

- 2026-06-16: Created target branch `review/issue-478-pr-488-hermes-hook-manifest` in the delegated worktree.
- 2026-06-16: Verified the coordinator worklist row for PR 488 / Issue 478 / Fork issue 632 is present and pending.
- 2026-06-16: Inspected public PR 488 diff without credentialed GitHub API use.
- 2026-06-16: Inspected local Hermes manifest, provider implementation, README hook list, and Hermes manifest test.
- 2026-06-16: `npm test -- test/hermes-plugin.test.ts` failed before executing tests because the local worktree has no installed `vitest` binary; no dependency installation was performed.
- 2026-06-16: Static Node manifest check confirmed the manifest hook set matches the implemented Hermes lifecycle hook set.
- 2026-06-16: `git diff --check` passed.
- 2026-06-16: Security-best-practices passive review found no critical or major issue in the docs-only branch diff. No code or config surface changed.
- 2026-06-16: Simple-code cleanup clarified the targeted test step as an attempted test because Vitest was unavailable.
- 2026-06-16: Focused review and implementation review found no critical or important issue in the task-owned documentation diff. Independent subagent review was not run because the available subagent tool is restricted to explicit subagent requests.
- 2026-06-16: Codex Security diff scan was skipped for the committed branch diff because it changes only task-local documentation and does not alter hook manifests, auth, networking, filesystem behavior, dependencies, prompts, or persistence.
- 2026-06-16: `gitleaks protect --staged --redact` found no leaks before the documentation commit.
- 2026-06-16: `$prep-merge-to-local-main` preflight found the main worktree clean and at `6c387b4efea524db5bf8fe0e923958cbcf0213f1`; local main was already an ancestor, so merge was a no-op.

## Final Review Notes

- Decision remains `already-fixed`; no PR 488 code, config, manifest, or test hunks were imported.
- Task-owned changes are limited to this local decision record and implementation plan.
- Product security risk from this branch diff is low because it does not modify runtime surfaces.
- Residual verification gap: the repo-native Vitest target could not run without installing dependencies in this worktree.
