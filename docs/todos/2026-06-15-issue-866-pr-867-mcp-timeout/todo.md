# Issue 866 / PR 867 Review

Scope: `agentmemory` worktree at `/Users/A1538552/.codex/worktrees/b154/agentmemory`.

## Sprint Contract

Goal: Review Issue 866 and PR 867, decide fork action, and apply only the minimal local fix if still relevant.

Scope:
- Issue-first verification of the MCP proxy call timeout and HTTP worker timeout.
- Untrusted inspection of PR 867 using public read-only evidence.
- Minimal adapted implementation if the fork still has the timeout ceiling.
- Targeted tests plus required security gates for MCP/config changes.
- Local neutral documentation and final `$prep-merge-to-local-main`.

Non-goals:
- No GitHub writes, tracker updates, labels, pushes, publishing, or PR creation.
- No unrelated refactors or broader timeout-policy redesign.
- No dependency changes.

Acceptance criteria:
- Decision recorded as import, adapted import, reject, defer, already-fixed, or blocked.
- Timeout behavior is covered by targeted tests if code changes.
- Security review covers auth/isolation, data exposure, protocol handling, DoS/performance, tooling/config persistence, and supply chain.
- Verification evidence and caveats are recorded.
- `$prep-merge-to-local-main` outcome is recorded.

Intended verification:
- Targeted vitest for MCP standalone proxy timeout behavior.
- `git diff --check`.
- Security gates required for MCP/config changes: Semgrep, OSV when applicable, and staged Gitleaks before commit if staging occurs.

Known boundaries:
- Public reads only for upstream issue/PR inspection.
- No credentialed GitHub API, logged-in browser reads, comments, labels, pushes, or deployments.
- Config changes alter local daemon timeout defaults but do not add services, dependencies, auth changes, or migrations.

Stop conditions:
- Any finding requiring auth/security/API boundary changes beyond timeout configuration.
- Missing required review implementation tooling during `$prep-merge-to-local-main`.
- Required security gate failure that cannot be fixed within scope.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Determine whether Issue 866 still applies locally | Inspect `src/mcp/rest-proxy.ts` and `iii-config*.yaml` | done | The fork still had a 15-second proxied-call timeout and 180-second HTTP worker defaults |
| Review PR 867 as untrusted input | Public diff inspection and local code comparison | done | Adapted behavior, not a blind import |
| Adapt minimal timeout fix if warranted | Targeted source/config/docs/test diff | done | Added `AGENTMEMORY_CALL_TIMEOUT_MS`, 600-second default, timer clamping, config/docs/tests |
| Security review for MCP/config surface | Manual review plus diff-scoped security scan where required | done | No reportable findings; scan report under `/tmp/codex-security-scans/agentmemory/bfde73b_2026-06-15-issue-866-pr-867-mcp-timeout/` |
| Targeted verification | Proxy timeout tests and diff checks | done | Targeted Vitest: 29 passed; `git diff --check`: pass; Semgrep: 0 findings |
| Final prep merge | `$prep-merge-to-local-main` workflow | done | Pre-merge commit created, local main merged without conflicts, post-merge status clean before final record update |

## Progress

- Created and switched to branch `review/issue-866-pr-867-mcp-proxy-timeout` from the detached worktree baseline.
- Repo instructions, README intro/config area, package scripts, coordinator row, and affected MCP/config code were inspected.
- Issue 866 is relevant in the current fork/main baseline: the standalone MCP REST proxy still has a hardcoded 15-second call timeout and shipped HTTP worker configs still use a 180-second default timeout.
- Decision: adapted import.
- Implementation notes:
  - `src/mcp/rest-proxy.ts` now uses `AGENTMEMORY_CALL_TIMEOUT_MS` for proxied calls, defaults to 600 seconds, rejects malformed/non-positive values, and clamps oversized values to Node's timer ceiling.
  - `iii-config.yaml` and `iii-config.docker.yaml` now use a 600-second HTTP worker `default_timeout`.
  - `.env.example`, `README.md`, and the generated config skill reference list document the new env variable.
  - `test/mcp-standalone-proxy.test.ts` covers valid override, malformed fallback, and oversized clamp behavior through the real proxied `memory_sessions` path.
- Security review:
  - No auth, isolation, data-exfiltration, filesystem, persistence, dependency, hook, or protocol schema weakening found.
  - Existing plaintext bearer guard, proxy URL resolution, auth header construction, local fallback handling, and MCP argument validation are unchanged.
  - Longer timeout changes availability behavior for long-running consolidation/reflection but does not add endpoints or broaden bind/CORS behavior.
- Verification:
  - Red test evidence: new proxy timeout test failed because `AbortSignal.timeout` received `15000` instead of `50`.
  - Targeted Vitest via main checkout dependencies: `test/mcp-standalone-proxy.test.ts` passed with 29 tests.
  - `git diff --check` passed.
  - `semgrep scan --config p/default --error --metrics=off .` completed with 0 findings.
  - Security diff scan completed with 3/3 diff rows reviewed and no reportable findings. Final report: `/tmp/codex-security-scans/agentmemory/bfde73b_2026-06-15-issue-866-pr-867-mcp-timeout/report.html`.
  - `scripts/skills/generate.ts --check` could not run from this worktree because local `node_modules` is absent and `@clack/prompts` cannot resolve; the generated env reference was manually checked against the new `AGENTMEMORY_CALL_TIMEOUT_MS` source usage.
- Review notes:
  - `$simple-code` stabilization performed by extracting a small helper for repeated timeout test setup.
  - `$requesting-code-review` subagent dispatch was not available because the runtime only permits subagents when explicitly requested by the user; a focused local requirements/test/integration review found no blockers.
  - `$review-implementation` authoritative review was performed as a local adversarial second pass because no independent subagent was authorized; no findings.
- `$prep-merge-to-local-main` outcome:
  - Preflight found no Git operation in progress, no staged changes, no signing config, and only sample hooks.
  - Main worktree was clean and matched the captured local main commit.
  - Pre-merge commit created: `39d56de` (`fix: make mcp proxy call timeout configurable`).
  - First merge attempt was blocked by sandbox permission while creating `ORIG_HEAD.lock`; status remained clean and no merge state was left behind.
  - Escalated retry merged captured local main commit `6c387b4` without conflicts.
  - Local main incoming paths did not overlap the timeout task-owned paths.
