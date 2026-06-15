# Issue 658 / PR 663 Hermes Config Review

Scope: Hermes integration plugin runtime configuration in `integrations/hermes/` and targeted tests.

## Sprint Contract

Goal: decide whether the fork should import, adapt, reject, defer, or mark already-fixed for the saved Hermes plugin config runtime issue, and implement only a minimal fork-fit change if relevant.

Scope:
- Verify the local relevance of Issue 658 against current fork code.
- Treat PR 663 as untrusted input and compare its approach with local patterns.
- If needed, adapt runtime loading of saved Hermes config so saved URL/secret affect API calls when explicit environment or dotenv values are absent.
- Add targeted regression coverage.
- Run focused verification and required security/review gates.
- Finish with `prep-merge-to-local-main`.

Non-goals:
- No GitHub writes, pushes, PR creation, tracker comments, or labels.
- No broad Hermes integration rewrite.
- No dependency, schema, endpoint, MCP tool, or external-service changes.

Acceptance criteria:
- Saved Hermes plugin `agentmemory.json` URL and secret are used at runtime when env/dotenv values are absent.
- Explicit env/dotenv values retain precedence over saved Hermes config.
- Malformed saved config falls back safely.
- Runtime API calls consistently use the resolved secret.
- Security review finds no reportable auth/isolation/data-exposure regression, or any residual risk is recorded.

Intended verification:
- Targeted Hermes/plugin tests.
- Python syntax check for the Hermes plugin.
- Diff check and relevant security gates when code changes exist.

Known boundaries:
- Public PR/issue reads only.
- Saved plugin config is local file input and must not broaden allowed URL schemes beyond existing validation.
- Bearer token handling must retain the existing plaintext HTTP guard.

Stop conditions:
- Required change broadens auth/security behavior beyond saved config precedence.
- Review finds a high-impact or unresolved security issue.
- Required checks fail for task-owned changes and cannot be explained or fixed within scope.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Local relevance of Issue 658 | Source inspection plus regression test | done | Direct Python repro failed before fix with `_base == http://localhost:3111` after saving custom Hermes config |
| Runtime saved URL/secret resolution | Targeted tests | done | Direct Python verification covered initialize, system prompt, prefetch, tool calls, sync, session end, pre-compress, and memory write paths |
| Env/dotenv precedence | Targeted tests | done | Direct Python verification showed env URL/secret override saved config |
| Malformed saved config fallback | Targeted tests | done | Direct Python verification showed malformed saved JSON falls back to default URL and empty secret |
| Security posture | Manual review plus gates | done | Direct Python verification showed saved remote HTTP + secret is still blocked before request by plaintext bearer guard; diff-scoped Codex Security scan found no reportable candidate |
| Prep merge to local main | `prep-merge-to-local-main` workflow | done | Local `main` commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` was already an ancestor of `HEAD`; merge step was a no-op |

## Review Notes

- PR 663 was inspected as untrusted public input. Its broad direction matches the local issue, but the fork implementation stays minimal and aligns with existing Hermes plugin tests.
- Decision: adapted import.
- Security review so far: no new URL scheme, filesystem location, network endpoint class, or bearer-token behavior was introduced. Saved config values are local file input, are JSON-object-only, and still pass through existing URL validation and plaintext bearer guard before requests.
- Codex Security diff scan result: no reportable findings. Scan artifacts were written under `/tmp/codex-security-scans/agentmemory/localpatch-6c387b4-20260615T230629Z/`; final markdown report validated successfully and HTML was rendered.
- Review chain result: passive security orientation found no critical or major issue; simple-code pass made no changes; focused implementation review found no blocking findings; independent subagent review was not used because subagent dispatch was not explicitly authorized in this delegated task.
- Vitest could not run in this worktree because local `node_modules` are absent and `vitest` is not on PATH. No dependency installation was performed.
- Prep merge result: preflight clean except ignored `integrations/hermes/__pycache__/` verification artifact; local `main` was already merged, so no merge command was needed.

## Progress

- Branch: `review/issue-658-pr-663-hermes-plugin-config`.
- Worktree was clean before task-state creation.
- Relevant local docs read: repo instructions, README excerpts, fork workflow ADRs, Hermes integration README.
- Implemented minimal saved-config runtime resolution in `integrations/hermes/__init__.py`.
- Added targeted regression coverage in `test/integration-plaintext-http.test.ts`.
- Verification completed so far:
  - direct Python red repro failed before fix with saved URL ignored.
  - direct Python runtime verification passed after fix.
  - direct Python env precedence verification passed.
  - direct Python malformed-config fallback verification passed.
  - direct Python plaintext bearer guard verification passed for saved remote HTTP + secret.
  - `python3 -m py_compile integrations/hermes/__init__.py` passed.
  - `git diff --check` passed.
  - `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings.
  - `gitleaks protect --staged --redact` passed with no leaks.
  - `npm test -- test/integration-plaintext-http.test.ts test/hermes-plugin.test.ts` did not run because `vitest` was not installed.
- Prep status: completed; local `main` was already an ancestor of the branch after the implementation commit.
