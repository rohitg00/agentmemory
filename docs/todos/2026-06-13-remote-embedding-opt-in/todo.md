# Remote Embedding Opt-In Todo

Scope: agentmemory repository in `/Users/A1538552/.codex/worktrees/8812/agentmemory`.

Source request: Security Finding 03, "Remote-Embeddings aktivieren sich automatisch ueber vorhandene Provider-Keys."

## Consensus

- Privacy/impact reviewer: VALID. Generic provider keys can select remote embedding providers, and memory, observation, rebuild, and search query text can reach remote APIs.
- API compatibility reviewer: VALID. Preferred fix is to require explicit `EMBEDDING_PROVIDER=<provider>` for remote embeddings, with documentation cleanup. Do not make `local` implicit in this fix because that can trigger existing persisted vector-index dimension guard failures for users with remote vectors.

## Sprint Contract

Goal: Prevent silent remote embedding activation from generic provider keys while preserving explicit remote and local embedding selection.

Scope:
- Provider detection and provider construction for text embeddings.
- Focused regression tests for key-only, local, and explicit remote provider cases.
- Main docs and shipped configuration guidance affected by the embedding opt-in behavior.

Non-goals:
- No dependency additions.
- No vector index migration or persisted-state rewrite.
- No push, deploy, merge, or remote state change.
- No broad generated translation rewrite unless directly needed by verification.

Acceptance criteria:
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `VOYAGE_API_KEY`, `COHERE_API_KEY`, or `OPENROUTER_API_KEY` alone does not create a text embedding provider.
- `EMBEDDING_PROVIDER=local` creates the local provider.
- `EMBEDDING_PROVIDER=<remote>` plus the matching key creates the matching remote provider.
- Docs no longer claim generic provider keys silently activate embeddings or that local is the implicit runtime default.
- Focused tests pass.

Intended verification:
- Red/green focused provider tests in `test/embedding-provider.test.ts`.
- Search for stale embedding auto-detection guidance in touched docs.
- Run targeted test command for embedding provider coverage.
- Run broader repo-native checks as feasible after the fix.
- If committing, stage intended files and run `gitleaks protect --staged --redact` first.

Known boundaries:
- This changes behavior for users who relied on key-only remote embeddings. They must set `EMBEDDING_PROVIDER=<provider>` after this fix.
- Startup already handles vector dimension mismatch; this fix avoids adding an implicit local default that could force more mismatch failures.

Stop conditions:
- A test or repo evidence shows public API behavior requires key-only embedding activation.
- The fix would require dependencies, migrations, pushes, deploys, or remote state changes.
- Verification fails twice for the same unclear reason.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
|---|---|---|---|
| Disable key-only remote embedding auto-selection | Failing then passing provider test | Passed | RED: `vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts` failed because `GEMINI_API_KEY` returned `GeminiEmbeddingProvider`; GREEN: 17/17 passed after the fix. |
| Preserve explicit local provider selection | Focused provider test | Passed | `EMBEDDING_PROVIDER=local` covered in `test/embedding-provider.test.ts`; targeted suite passed. |
| Preserve explicit remote provider selection | Focused provider tests | Passed | Explicit `EMBEDDING_PROVIDER=gemini/openai/voyage/cohere/openrouter` cases covered; targeted suite passed. |
| Normalize and reject malformed embedding provider values | Focused provider tests | Passed | `EMBEDDING_PROVIDER=" OpenAI "` normalizes to `openai`; blank and unknown values return no provider; direct `detectEmbeddingProvider()` status-path test covered. |
| Update affected documentation | Stale-reference search and diff review | Passed | Exact stale-phrase scan returned no matches; broader scan only found new opt-in text and valid non-embedding auto-detection references. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
|---|---|---:|---|---|---|
| Privacy validity / impact | Read-only source-to-sink review | No | Validity, impact, line evidence | VALID; memory, observation, rebuild, and query text can reach remote APIs | Medium privacy issue, high potential where users trust offline docs |
| API compatibility / fix strategy | Read-only compatibility review | No | Recommended fix and test/doc scope | VALID; require explicit `EMBEDDING_PROVIDER` for remote providers | Key-only vector-search users must opt in explicitly |

## Progress

- [x] Confirmed worktree and git state.
- [x] Completed two read-only subagent reviews before edits.
- [x] Recorded consensus and Sprint Contract.
- [x] Write failing tests.
- [x] Implement provider detection fix.
- [x] Update docs.
- [x] Run verification.
- [x] Record final review notes.

## Review Notes

- Fix strategy: `detectEmbeddingProvider()` now only honors non-empty `EMBEDDING_PROVIDER`; provider keys alone leave text embeddings disabled.
- Focused verification passed with the main checkout's existing Vitest binary because this isolated worktree has no installed dependencies: `vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/consolidation-default.test.ts` passed 26/26.
- Full non-integration suite attempted with the same binary. Current result: 116 test files passed, 18 failed; failures are dominated by this isolated worktree not resolving packages such as `iii-sdk`, `@clack/prompts`, and `zod`, plus one unrelated `pre-tool-use-project` assertion. No dependency install was performed.
- Stale embedding-contract search returned no matches after docs updates. A broader scan found one Portuguese LLM-provider auto-detection sentence, which is still valid because LLM provider auto-detection was not changed.
- `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings.
- `gitleaks detect --source . --redact` passed with no leaks found.
- Final review:
  - Security/Privacy, Test Coverage, and Maintainability reviewers first found one shared Important issue: stale key-only embedding guidance remained in CLI/viewer/localized README surfaces.
  - Fixed by updating CLI/viewer hints plus localized embedding sections and Gemini rows.
  - All three reviewers re-checked the updated diff and returned ACCEPT.
- Prep-merge review chain:
  - API compatibility reviewer found a missing `CHANGELOG.md` migration note for users relying on key-only remote embeddings; fixed under `Unreleased / Security`.
  - Testing reviewer found the new provider tests still imported config before sandboxing `HOME`; fixed by dynamic module imports after a temporary HOME/USERPROFILE is active.
  - Red-team reviewer found malformed `EMBEDDING_PROVIDER` values could make status APIs report embeddings while the factory returned `null`; fixed by normalizing supported provider names and rejecting blank/unknown values in `detectEmbeddingProvider()`.
  - Security/privacy and maintainability reviewers returned no additional findings.
- Updated focused verification passed: `vitest run --exclude test/integration.test.ts test/embedding-provider.test.ts test/consolidation-default.test.ts` passed 29/29 after the prep-review fixes and cleanup pass.
- Staged pre-commit checks passed: `git diff --cached --check` and `gitleaks protect --staged --redact` found no issues.
- No dependency install, push, deploy, or merge was performed.
