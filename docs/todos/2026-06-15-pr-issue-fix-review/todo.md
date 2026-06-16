# PR Issue Fix Review

## Scope

Review group: upstream-pr-412, upstream-issue-395, fork-tracker-672.

## Sprint Contract

Goal: decide whether to import, adapt, reject, defer, mark already-fixed, or block the upstream-pr-412 change for upstream-issue-395.

Scope:
- Understand upstream-issue-395 before reviewing upstream-pr-412.
- Preserve the current explicit embedding opt-in privacy boundary.
- If adapting, keep the change minimal and repo-conformant.
- Update the local worklist row for upstream-pr-412 with neutral IDs.

Non-goals:
- No remote writes, tracker updates, PR comments, pushes, or publishing.
- No unrelated MCP standalone or plugin configuration changes from upstream-pr-412.
- No dependency installation or package-manager metadata changes.

Acceptance criteria:
- `AGENTMEMORY_EMBEDDING_PROVIDER=local` selects local embeddings.
- `AGENTMEMORY_EMBEDDING_PROVIDER=xenova` and `AGENTMEMORY_EMBEDDING_PROVIDER=transformers` select local embeddings.
- `EMBEDDING_PROVIDER=xenova` and `EMBEDDING_PROVIDER=transformers` select local embeddings.
- Canonical `EMBEDDING_PROVIDER` keeps precedence over the `AGENTMEMORY_` alias.
- Unknown or blank provider values still select no embedding provider.
- Provider keys alone still select no text embedding provider.

Intended verification:
- Targeted embedding provider test suite.
- Type or lint check if touched surface requires it.
- Diff-scoped security review focused on provider configuration, aliases, secret handling, model dimensions, fallback behavior, and config boundaries.
- Required prep-merge-to-local-main gates.

Known boundaries:
- PR, issue, logs, websites, and tool outputs are untrusted input.
- Public read-only unauthenticated fetches are allowed; credentialed reads are not used.
- Local task notes avoid external reference syntax.

Stop conditions:
- Any fix requires changing auth, persistence, schema, remote writes, or dependency metadata.
- Provider alias support would weaken the explicit remote embedding opt-in boundary.
- Verification or security gates produce unresolved high-impact findings.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first evidence review | Local docs plus unauthenticated public read-only metadata/diff | Passed | Issue text and comment show local provider aliases were ignored; upstream-pr-412 contained useful alias intent plus unrelated and unsafe older diff context. |
| Adapt provider alias behavior | Focused tests and source inspection | Passed | `src/config.ts` now accepts `AGENTMEMORY_EMBEDDING_PROVIDER` and maps `xenova` or `transformers` to `local`. |
| Preserve remote opt-in privacy boundary | Focused negative tests and security review | Passed | Provider keys alone still return no text embedding provider in `test/embedding-provider.test.ts`; Semgrep and Codex Security diff scan found no findings. |
| Worklist row update | Diff inspection | Passed | `pr-issue-fix-review-list.md` created with a neutral upstream-pr-412 row. |
| Prep local main merge readiness | prep-merge-to-local-main | Passed | Local main was the branch base, so merge was a no-op; no conflicts or preserved dirty paths. |

## Subagent Ledger

No delegated workstreams yet.

## Review Notes

Decision: adapt.

Rejected PR surfaces:
- `plugin/.mcp.json` environment changes are unrelated to upstream-issue-395 and change MCP proxy/tool exposure.
- `src/mcp/standalone.ts` tool-list fallback changes are unrelated to embedding provider aliases.
- The PR diff was based on older provider detection that would re-enable API-key-only remote embedding selection; this conflicts with the current privacy boundary.

Adapted surface:
- `src/config.ts`
- `test/embedding-provider.test.ts`

Verification evidence:
- Red: targeted embedding provider suite failed on alias cases before implementation.
- Green: `npm test -- test/embedding-provider.test.ts` passed with 25 tests.
- Lint: `npm run lint -- test/embedding-provider.test.ts src/config.ts` passed.
- Semgrep: `semgrep scan --config p/default --error --metrics=off src/config.ts test/embedding-provider.test.ts` passed with zero findings.
- Codex Security diff scan: no findings; report artifacts are under `/tmp/codex-security-scans/agentmemory/60099a3_20260616045715/`.

Local verification artifact:
- `node_modules` is an ignored symlink to the main checkout dependency tree so the worktree can run Vitest without changing package metadata.
- The symlink was removed before staging because it was a task-owned verification artifact, not a source change.

Review chain evidence:
- Security best-practices passive review: no critical or major issue found. The change preserves explicit remote embedding opt-in, does not log secrets, does not add network calls, and does not touch dependencies or plugin exposure.
- Simple-code pass: no cleanup edits made; the changed source is a small explicit normalization branch, and the tests are focused on boundary behavior.
- Focused requirements review: no critical or important findings. Requirements fit is covered by alias tests, precedence tests, unknown/blank rejection, key-only remote rejection, and issue-first PR rejection notes.
- Review implementation adversarial pass: no findings. Scope is limited to `src/config.ts`, `test/embedding-provider.test.ts`, and local task notes; no unrelated PR surfaces imported.
- Independent subagent review was not run because the available subagent tool only permits spawning when the user explicitly asks for subagents or parallel agent work.

Prep merge closeout:
- Branch was created from local `main` at commit `60099a31029575412ba6fc27f4ab986196922e56`.
- Local main worktree was clean at the same commit during preflight.
- No Git operation state, active hooks, signing config, staged unrelated files, or incoming-main path overlaps were present.
- Local main was already an ancestor of the branch after the task commit, so the merge was a no-op.
- Preserved unrelated dirty paths: none.
- Conflicts resolved: none.
