# PR 794 Memory Delete Endpoint Review

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/d486/agentmemory`
- Branch: `review/issue-739-pr-794-memory-delete-endpoint`
- Owning scope: agentmemory REST API and targeted tests/docs for endpoint count consistency
- Upstream review group: Issue 739, PR 794, Fork issue 459

## Sprint Contract

Goal: decide whether the direct memory delete endpoint requested by Issue 739 is relevant locally, inspect PR 794 as untrusted input, and either import/adapt/reject/defer with local evidence.

Scope:
- Verify current local behavior for memory read/list/delete routes.
- Inspect PR 794 via public unauthenticated reads.
- If useful, adapt the minimal endpoint change to the current fork.
- Add targeted tests for boundary behavior and update endpoint count references required by repo instructions.
- Run focused verification and required security gates where available.
- Run `prep-merge-to-local-main` at the end.

Non-goals:
- No GitHub writes, tracker updates, labels, PR creation, pushes, or deployment.
- No bulk delete redesign, update endpoint, or broader governance refactor.
- No changes to storage schema, auth model, or MCP tool surface.

Acceptance criteria:
- Decision is recorded neutrally with Issue 739, PR 794, and Fork issue 459 identifiers only.
- A direct memory delete route exists only if local evidence supports it.
- The route uses existing auth and deletion semantics rather than raw KV deletion.
- Irreversible deletion behavior is covered by targeted tests for validation, auth, missing records, and successful dispatch.
- Endpoint counts remain consistent.
- Security review covers auth/isolation, audit, id validation, irreversible deletion, schema/protocol handling, persistence, and DoS/performance.

Intended verification:
- `npm test -- test/api-boundary-coverage.test.ts test/consistency.test.ts`
- `git diff --check`
- Required security gates for code changes as available: Semgrep, OSV when applicable, Gitleaks before commit.
- Additional checks required by `prep-merge-to-local-main`.

Known boundaries:
- PR 794 is untrusted input.
- Public unauthenticated reads are allowed; credentialed reads or writes are not.
- Delete endpoints are security-sensitive; do not bypass existing auth/audit/index cleanup paths.

Stop conditions:
- Required review/security tooling is unavailable and the skill requires stopping.
- A needed change would alter auth/security/system boundaries beyond the requested endpoint without explicit approval.
- Verification exposes unrelated failures that cannot be separated from this task.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue relevance check | Inspect current routes and storage functions | Done | Current fork has `GET /agentmemory/memories` and `GET /agentmemory/memories/:id`, plus governance delete, but no direct `DELETE /agentmemory/memories/:id`. |
| PR 794 review | Public issue/PR JSON and patch inspection | Done | PR adds a direct delete endpoint through `mem::forget`, but is stale against the current fork endpoint count and has narrower boundary coverage than this fork expects. |
| Adapted endpoint | Targeted code review and tests | Done | Added `api::memory-delete` for `DELETE /agentmemory/memories/:id`; it authenticates, trims/validates id, returns 404 for missing/out-of-scope memories, and dispatches whitelisted `{ memoryId }` to `mem::forget`. |
| Security review | Manual checklist plus diff scan where required | Done | Manual review and Codex Security diff scan found no reportable finding after fixing the isolated-scope wildcard/override issue. Semgrep completed with 0 findings. |
| Verification | Targeted tests and diff checks | In progress | `git diff --check` passed. Static endpoint consistency check returned 129 and confirmed docs/log references. `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings. `npm test -- test/api-boundary-coverage.test.ts test/consistency.test.ts` could not run because local `vitest` is missing; exact-version `npx` download was rejected by policy. |
| Prep merge | Run `prep-merge-to-local-main` | Pending |  |

## Progress Notes

- Created task branch from detached worktree at local main commit.
- Loaded repo-local instructions, README/script context, and coordinator worklist.
- No repo-local `docs/lessons` directory exists.
- Decision: adapted import. PR 794's endpoint shape is relevant, but the local fork needs current endpoint counts and stronger validation/auth/isolation coverage.
- Security notes: no raw request body is forwarded, no direct KV deletion is performed by the REST handler, and missing or out-of-scope IDs return 404 before invoking the memory function.
- Review note: adversarial review found that destructive DELETE must not inherit read/list `agentId=*` or caller-supplied cross-agent override behavior in isolated mode. Fixed by using only configured `getAgentId()` for destructive isolated-scope checks and adding tests for plain, wildcard, and explicit cross-agent attempts.
- Review Implementation rerun: accepted fixed diff with no critical or important findings. Residual uncertainty is limited to unavailable local Vitest execution and the intentional `includeOrphans=true` legacy-memory opt-in.
- Codex Security report: `/tmp/codex-security-scans/agentmemory/local-patch_20260615T214549Z/report.md` and `/tmp/codex-security-scans/agentmemory/local-patch_20260615T214549Z/report.html`. Goal usage: 174657 tokens, 149 seconds.
