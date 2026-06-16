# Issue 712 / PR 801 Review

Scope: review Issue 712 and PR 801 for the current fork, decide whether to import or adapt the claimed fix, verify the decision, and prepare the branch for local main.

## Sprint Contract

Goal: determine whether the iii console installer shell incompatibility is still relevant locally and apply the smallest safe fix if needed.

Scope:
- Issue-first investigation of the installer command and user-facing install hints.
- Public, read-only inspection of PR 801 as untrusted input.
- Minimal code or test changes only when local evidence shows the issue remains relevant.
- Neutral local documentation using `Issue 712`, `PR 801`, and `Fork issue 454`.

Non-goals:
- No GitHub writes, pushes, PR creation, tracker comments, or labels.
- No unrelated installer, iii-engine, prompt, or onboarding refactors.
- No dependency changes.

Acceptance criteria:
- Decision recorded as import, adapted import, reject, defer, already-fixed, or blocked.
- Relevant code paths and PR diff reviewed.
- Security impact checked for subprocess, network installer, shell, path, auth, persistence, and tooling surfaces.
- Reproduction evidence covers the behavior; no code change means no new regression test is needed.
- `$prep-merge-to-local-main` run or explicitly recorded as no-op/blocked per its skill.

Intended verification:
- Reproduce the shell behavior with a minimal installer script using `set -o pipefail` under `sh` and `bash`.
- If code changes are made, run targeted tests covering the generated iii console install command and manual hint.
- Run applicable static/security checks for changed subprocess/network-installer code.
- Run prep-merge preflight and merge-local-main workflow.

Known boundaries:
- Public read-only upstream/PR inspection only.
- No credentialed GitHub API or logged-in browser reads without approval.
- No remote writes or branch push.

Stop conditions:
- Required scanner reports high-impact findings that are not fixed or accepted.
- Correct fix would require changing auth, data storage, package-manager policy, or wider installer boundaries.
- Hook/signing inspection blocks a commit or merge.

## Feature / Verification Matrix

| Change or decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue relevance | Inspect local installer command and reproduce shell behavior | Complete | `dash -c 'set -o pipefail'` reproduces the Ubuntu-class failure; public `console/main/install.sh` is Bash-specific. Current local `src/cli.ts` uses `iii/main/install.sh`, whose current public script is POSIX `sh` with `set -eu`, not `pipefail`. |
| PR 801 review | Public diff inspection | Complete | PR 801 changes `src/cli.ts` from `sh` to `bash`, adds a text-based regression test, and is open/unmerged. It is stale against the current fork because the local command is now version-pinned and Windows-aware. |
| Minimal fix if relevant | Targeted unit test and implementation | Complete | Decision: reject as-is / defer. No code import: changing only `sh` to `bash` on the current `iii/main` command does not address the current fork's possible installer-target mismatch, and switching to `console/main` would broaden behavior beyond PR 801. |
| Security review | Manual diff review plus required gates where available | Complete | No code imported. Reviewed subprocess/network-installer surface: remote `curl | shell`, shell selection, version pin, PATH/file writes, auth/token exposure, persistence via shell rc edits, and DoS/download behavior. No new security exposure introduced by this branch. |
| Prep merge | `$prep-merge-to-local-main` workflow | Pending |  |

## Progress Notes

- Working directory: `/Users/A1538552/.codex/worktrees/a136/agentmemory`
- Branch: `review/issue-712-pr-801-iii-console-installer-bash`
- Initial status: clean after branch creation.
- Coordinator worklist row found and marks `PR 801` / `Issue 712` as `pending` and `candidate`.
- Public Issue 712 evidence: original report shows `sh: set: Illegal option -o pipefail` on Ubuntu-class `/bin/sh`; a later public comment reports a separate repeated-prompt problem because detection looks for `iii-console` while the current local command installs `iii`.
- Public PR 801 evidence: one-commit diff changes the old unpinned installer command to `bash`, checks `bash`, runs `bash -lc`, and adds a source-text test. It does not preserve the current fork's version pin or Windows-specific hint, and it does not address the `iii` versus `iii-console` target mismatch.
- Local issue-first conclusion: the shell incompatibility is real for the Bash-specific `console/main` installer, proven by `dash -c 'set -o pipefail'`, but the current fork path no longer calls that Bash-specific script. The current public `iii/main` installer is POSIX `sh` and contains `set -eu`, so the exact PR 801 change is not justified locally.
- Decision: reject as-is / defer. A separate, explicitly scoped design should decide whether the prompt should detect `iii`, invoke `iii console`, or call the separate `iii-console` installer. That would change install target and persistence behavior and is broader than PR 801.

## Review Notes

- Security best-practices pass: docs-only branch diff; no new code, dependency, auth, network, persistence, hook, or tooling behavior introduced. The reviewed PR surface remains sensitive because it concerns `curl | shell`; no import means no new executable surface is added.
- Simple-code pass: no cleanup edit needed; the only task-owned change is this local review note.
- Focused code-review pass: no subagent was spawned because the available subagent tool requires explicit user authorization for subagents. Self-review found no critical or important finding on the docs-only diff.
- Review-implementation pass: self adversarial review inspected scope, correctness of recorded evidence, boundary safety, verification notes, and neutral-reference constraints. No findings.
- Security diff scan: skipped for branch diff because it only adds task documentation and does not touch security-sensitive executable/configuration surface. The external PR diff was manually reviewed for subprocess/network-installer risk.

## Verification Evidence

- `dash -c 'set -o pipefail'` exits with `dash: 1: set: Illegal option -o pipefail`, matching the Ubuntu-class symptom.
- `bash -c 'set -o pipefail'` exits 0, confirming the shell-specific behavior.
- Public `console/main/install.sh` starts with Bash and `set -euo pipefail`; public `iii/main/install.sh` starts with POSIX `sh` and `set -eu`.
- `git diff --check -- docs/todos/2026-06-16-issue-712-pr-801-iii-console-installer-bash/todo.md` exits 0.
- Neutral-reference search found no GitHub URLs, hash-issue references, or mentions in this task file.
