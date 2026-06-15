# Issue 715 / PR 800 Review

## Scope

Owning scope: repository source and tests for ID generation in `src/state/schema.ts`.

Coordinator row: PR 800, Issue 715, Fork issue 455. Upstream status was read from public unauthenticated JSON and the coordinator worklist. No credentialed reads, GitHub writes, tracker updates, labels, pushes, or PR creation are in scope.

## Sprint Contract

Goal: decide whether PR 800 should be imported into the fork, and apply only the minimal source/test/doc changes if still useful.

Scope:
- Validate the issue against current fork behavior.
- Inspect PR 800 as untrusted input.
- If accepted, adjust `generateId()` to avoid a bare global `crypto` dependency.
- Add focused regression coverage for ID generation when `globalThis.crypto` is unavailable.
- Record a neutral local review result without GitHub URLs, hash issue references, or mentions.
- Run `$prep-merge-to-local-main` at the end.

Non-goals:
- Change the supported Node engine range.
- Edit built `dist/` output directly.
- Change ID format, prefixes, timestamp layout, storage schema, auth, MCP, REST, hooks, persistence, package manager, or dependency versions.
- Write to GitHub or fork tracker state.

Acceptance criteria:
- Issue-first relevance is documented against current fork state.
- PR 800 diff is inspected and treated as untrusted input.
- Any implementation is minimal and covered by a targeted failing-then-passing test.
- Security review covers the touched surface and records no unhandled risk or a clear blocker.
- Required verification and security gates are run or their limits are recorded.
- `$prep-merge-to-local-main` is run or its no-op/blocker is documented according to the skill.

Known boundaries:
- The current fork declares Node `>=20.0.0`, so Node 16 runtime compatibility is not an active package contract.
- The touched code is shared ID generation used by state-changing functions, so uniqueness and format must be preserved.
- `dist/` is build output and must not be hand-edited.

Stop conditions:
- Any change would broaden runtime support, change schemas, or affect auth/security boundaries.
- GitHub credentialed reads or writes become necessary without current-turn approval.
- Required security tooling reports an unresolved finding or cannot run and cannot be accepted in this turn.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first diagnosis | Inspect `src/state/schema.ts`, `package.json`, public Issue 715 JSON, local reproduction by removing `globalThis.crypto` | complete | `generateId()` used `crypto.randomUUID()`; package requires Node `>=20.0.0`; local reproduction raised `ReferenceError: crypto is not defined` |
| PR 800 review | Public PR JSON and diff inspection | complete | PR 800 changes only `src/state/schema.ts`, importing `randomUUID` from `node:crypto` and replacing the global call |
| Minimal adapted import | Test-first implementation in `test/schema-fingerprint.test.ts` and `src/state/schema.ts` | complete | Added regression test for missing `globalThis.crypto`; imported `randomUUID` from `node:crypto`; preserved ID format |
| Security review | Manual diff review plus required gates where applicable | complete | Semgrep on changed code/test: 0 findings; Codex Security diff scan: no candidates; no auth/isolation/data-flow/path/protocol/prompt/DoS/supply-chain/hook/persistence boundary weakening found |
| Merge prep | `$prep-merge-to-local-main` workflow | pending |  |

## Subagent Ledger

No subagents used so far. The task is a narrow one-file source change plus one focused test; deterministic local checks are expected to be sufficient unless merge-prep introduces conflict uncertainty.

## Progress

- Created branch `review/issue-715-pr-800-randomuuid-node-compat` from detached local main commit.
- Read repo instructions, README, package scripts, coordinator worklist, affected source, public Issue 715 JSON, and public PR 800 JSON/diff.
- Reproduced the current source failure with `delete globalThis.crypto` before importing `src/state/schema.ts` and calling `generateId("x")`.
- Added a focused regression test in `test/schema-fingerprint.test.ts`.
- Applied the minimal source fix in `src/state/schema.ts`.
- Direct harness after the fix produced a valid `obs_<timestamp>_<12hex>` ID without `globalThis.crypto`.
- `npm test -- test/schema-fingerprint.test.ts` could not execute because local dependencies are absent and `vitest` is not installed.
- `git diff --check` passed.
- `semgrep scan --config p/default --error --metrics=off src/state/schema.ts test/schema-fingerprint.test.ts` passed with 0 findings.
- Codex Security diff scan artifacts: `/tmp/codex-security-scans/agentmemory/6c387b4_20260615T204241Z_issue715_pr800`; discovery reviewed `src/state/schema.ts` and emitted no candidates.
- `$requesting-code-review` subagent dispatch was skipped because the available subagent tool requires explicit user authorization for subagents; a focused self-review was performed instead.
- `$review-implementation` adversarial self-pass found no critical, important, or minor findings in the task-owned diff.

## Review Notes

PR 800 is acceptable as a minimal source-level fix, but in this fork the decision is best described as an adapted import: keep the exact source fix, add fork-local regression coverage, and do not alter the declared Node engine range.

Security review notes:
- Auth/isolation: unchanged; no request handling or scope checks touched.
- Data exfiltration: unchanged; the patch does not add logging, transport, or reads.
- Path/file access: unchanged.
- Protocol/schema handling: ID string shape preserved; no storage schema migration.
- Prompt/LLM flows: unchanged.
- DoS/performance: neutral to positive availability impact by removing a missing-global failure mode; random generation cost remains one UUID per ID.
- Supply chain: no dependency or lockfile changes.
- Hooks/tooling/persistence: persistence identifiers keep the same format and entropy class.
