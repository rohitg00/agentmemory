# Issue 195 Encrypted State Storage

Scope: repository task state for `wbugitlab1/agentmemory#195`, mirrored from upstream issue 482.

## Sprint Contract

Goal: determine whether encrypted state storage support is already present, and either implement a safe scoped fix or document the approval blocker for a real encryption implementation.

Scope:
- Inspect repo-local state storage architecture and public issue data.
- Preserve the iii-engine-backed storage boundary.
- Add only documentation/design-spike evidence unless explicit approval is granted for security, persistence, schema, migration, encryption, or data-format boundary changes.

Non-goals:
- Do not implement AES-256-GCM encryption, key management, tenant key isolation, or storage migrations in this turn without explicit current-turn approval.
- Do not bypass iii-engine with a standalone SQLite adapter.
- Do not fetch, pull, push, create a PR, publish, deploy, or change remote issue state without separate approval.

Acceptance criteria:
- Public issue data and repo evidence are recorded.
- Current state-at-rest posture is documented for operators.
- Any real implementation blocker is explicit and tied to the exact boundary that needs approval.
- The changed surface is verified with focused repo-native checks or documented blockers.
- GitHub feature-loop local PR prep is completed or blocked with evidence.

Intended verification:
- `git diff --check -- README.md SECURITY.md docs/todos/2026-06-17-issue-195-encrypted-state-storage/todo.md docs/todos/2026-06-17-issue-195-encrypted-state-storage/plan.md`
- `corepack pnpm exec vitest run test/engine-launch.test.ts test/build-runtime.test.ts`
- Security-gate commands required by the final prep phase, with blockers recorded if tools or approvals are unavailable.

Known boundaries:
- `StateKV` calls iii-engine `state::*` through `iii-sdk`.
- `iii-config.yaml`, `iii-config.docker.yaml`, `src/cli/build-runtime.ts`, and `src/cli/engine-launch.ts` route state into iii-engine `file_based` stores.
- App-level encryption would change persisted value format, key lifecycle, recovery/error behavior, and possibly tenant isolation semantics.

Stop conditions:
- Stop before code changes that alter auth, security, storage, schema, migration, encryption, or data formats.
- Stop before remote writes or fresh fetch/pull/push.
- Stop if verification requires private registry credentials or unavailable required security tooling.

## Evidence

- Public fork issue: `wbugitlab1/agentmemory#195`, title `Encrypted state storage support for enterprise deployment`, state `open`, created `2026-06-14T18:28:52Z`, mirrored from upstream issue 482.
- Public upstream issue number `rohitg00/agentmemory#195` is a different open CPU-bound worker-thread issue, so the fork issue is the correct task source.
- `src/state/kv.ts` directly wraps `sdk.trigger()` calls to `state::get`, `state::set`, `state::update`, `state::delete`, and `state::list`.
- `iii-config.yaml` uses `iii-state` adapter `kv` with `store_method: file_based` and `file_path: ./data/state_store.db`.
- `README.md` documents the default native state directory under `~/.agentmemory/data`.
- `rg` found no existing AES/GCM/encrypted state storage support in repo docs or source.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|-|-|-|-|
| Confirm whether issue #195 maps to encrypted storage | Public GitHub API lookup and upstream page check | Done | Fork issue #195 title/body match encryption request; upstream #195 is unrelated CPU issue. |
| Confirm local implementation state | Read `src/state/kv.ts`, state config, runtime config renderers, README/SECURITY | Done | Storage is iii-engine file-based state; no encryption support found. |
| Document current state-at-rest posture | Markdown diff review and whitespace check | Done | `README.md` and `SECURITY.md` now state that agentmemory does not encrypt iii-engine state files itself. |
| Record approval blocker for real encryption | Task record, plan, and docs note boundary | Done | This file, `plan.md`, `README.md`, and `SECURITY.md` carry the stop condition. |
| GitHub feature-loop prep | Required local PR-prep checks, commit, and handoff | Done | Local commits created on `github-pr/issue-195-encrypted-storage-ce60bba0`; push/PR not run without approval. |

## Subagent Ledger

| Workstream | Allowed scope | Edits allowed | Expected output | Result | Residual risk |
|-|-|-|-|-|-|
| Plan review | `docs/todos/2026-06-17-issue-195-encrypted-state-storage/plan.md`, issue evidence, README/SECURITY context | No | High/Medium findings on scope, acceptance, verification, and unsafe boundary changes | Medium findings fixed: matrix status, staged Gitleaks plan step, GitHub feature-loop sequencing | None after fixes. |
| Final docs review | Task-owned diff only | No | Findings on documentation accuracy, security wording, and verification gaps | ACCEPT: no Critical/Important actionable findings | No independent residual blocker. |

## Progress

- 2026-06-17: Inspected local instructions, git status, branch/worktree state, public issue data, and storage architecture.
- 2026-06-17: Created local branch `github-pr/issue-195-encrypted-storage-ce60bba0` from `ce60bba0`.
- 2026-06-17: Real encryption implementation classified as requiring explicit approval before any security/persistence/data-format change.
- 2026-06-17: Added README/SECURITY storage-encryption posture docs and updated plan after pre-implementation review findings.
- 2026-06-17: Verified `git diff --check` on task-owned docs (exit 0).
- 2026-06-17: Verified `corepack pnpm exec vitest run test/engine-launch.test.ts test/build-runtime.test.ts` (2 files, 17 tests passed).
- 2026-06-17: `corepack pnpm exec prettier --check ...` was not usable because Prettier is not a project dependency; replaced with `git diff --check` in the plan.
- 2026-06-17: Staged task-owned files only and verified `gitleaks protect --staged --redact` (no leaks found).
- 2026-06-17: Created local commit `117889fa` (`docs: clarify state encryption posture`).
- 2026-06-17: Used existing local `origin/main` ref `ce60bba0682e7e8fdfcc62250a2491d1e6a20e5c`; no fetch was run, so freshness is unverified.
- 2026-06-17: Base merge was a no-op because the local `origin/main` ref is already an ancestor of the branch.
- 2026-06-17: `codex-security:security-diff-scan` was skipped for the stable diff because it contains only Markdown documentation/task-state files and no executable, configuration, dependency, schema, or storage-format change; passive security review, focused implementation review, `git diff --check`, targeted vitest, and staged Gitleaks covered the changed surface.
