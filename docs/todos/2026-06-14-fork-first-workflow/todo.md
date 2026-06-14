# Fork-First Workflow Task

Task id: `2026-06-14-fork-first-workflow`

## Scope

Establish a documented fork-first development workflow for this repository, using `docs/adr/` for durable decisions and `adr-tools` for ADR creation and summaries.

## Sprint Contract

Goal: make the local repository ready to treat the user's fork as the primary development line while still regularly syncing from the original upstream repository.

Scope:
- Initialize ADR storage under `docs/adr/` with `adr-tools`.
- Record the fork-first workflow decision as an ADR.
- Document the operational Git workflow for fork development, upstream synchronization, and upstream PR preparation.
- Reconfigure local remotes only after review and implementation approval.

Non-goals:
- No push, deploy, publication, or remote state change without explicit current-turn confirmation.
- No force-push, history rewrite, rebase of published fork history, or cleanup of existing worktrees.
- No source-code behavior changes.

Acceptance criteria:
- `docs/adr/` exists and `adr list` works from the repository root.
- A dedicated ADR records the fork-first decision and its consequences.
- A recipe documents day-to-day commands for fork work, upstream sync, and upstream PR branches.
- Local remote changes, if executed, leave `origin` pointing at the fork and `upstream` pointing at the original repository.
- Verification evidence is recorded before final handoff.

Intended verification:
- `/Users/A1538552/_projects/_tools/adr-tools/src/adr list`
- `/Users/A1538552/_projects/_tools/adr-tools/src/adr generate toc`
- `git status -sb`
- `git remote -v`
- `git branch -vv`
- `git worktree list --porcelain`
- `git diff --check`
- `rg -n "origin|upstream|fork|docs/adr" docs/adr docs/recipes docs/todos/2026-06-14-fork-first-workflow`
- `gitleaks protect --staged --redact` before any commit

Known boundaries:
- Remote pushes require explicit current-turn confirmation.
- If a remote rename collides with existing remote names or unexpected URLs, stop and re-plan.
- If `git push -u origin main:main` would be non-fast-forward or destructive, stop and ask.
- If upstream sync produces conflicts, stop with the conflict state recorded instead of improvising a resolution.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| ADR baseline initialized | `adr list` | Done | `adr init docs/adr` created `docs/adr/0001-record-architecture-decisions.md`; `.adr-dir` contains `docs/adr`. |
| Fork workflow plan written | Plan self-review and `/review-plan` | Done | Revision `fork-first-workflow-plan-r3` accepted by all three review lanes. |
| Fork-first ADR recorded | `adr list`, ADR content review | Pending | Planned via `adr new "Use fork-first development workflow"`. |
| Operational recipe documented | `git diff --check`, command review | Pending | Planned under `docs/recipes/fork-workflow.md`. |
| Local remote convention applied | `git remote -v`, branch config, `git branch -vv` | Pending | Must wait for plan review and implementation approval. |
| Fork main published | `git push -u origin main:main`, `git status -sb` | Pending | Requires explicit current-turn confirmation before push. |

## Progress Notes

- 2026-06-14: User confirmed the fork-first direction and requested `writing-plans`, `/review-plan`, `docs/adr`, and `adr-tools`.
- 2026-06-14: Read `/Users/A1538552/.agents/instructions/global.md`; it requires durable decisions under `docs/adr/` and recommends `/Users/A1538552/_projects/_tools/adr-tools/src/adr`.
- 2026-06-14: `docs/adr` and `.adr-dir` were missing; initialized with `/Users/A1538552/_projects/_tools/adr-tools/src/adr init docs/adr`.

## Plan Review Ledger

| ID | Severity | Reviewer | Plan reference | Evidence | Failure mode | Recommended change | Verification needed | Status | Revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CMR-001 / FFW-001 | Important | correctness; git sequencing | Task 4 and Task 5 branch tracking | Remote renaming would move current `main` tracking from old `origin/main` to `upstream/main`; push-deferred path did not restore fork tracking. | Local remotes could look fork-first while local `main` still tracks the original repository. | Add local branch-tracking configuration after remote rename and verify `branch.main.remote`, `branch.main.merge`, `git status -sb`, and `git branch -vv`. | Verify `main` tracks `origin/main` or explicitly shows `origin/main` as gone until fork publication. | accepted-fixed | fork-first-workflow-plan-r2 |
| CMR-002 / FFW-R1-002 | Important | correctness; approval gates | Recipe upstream PR push block | `git push origin upstream-pr/<short-topic>` was in the same copyable command block as local PR prep. | Future agents/users could publish without explicit current-turn confirmation. | Split PR branch push into a separate block preceded by explicit confirmation wording. | Search generated recipe so every `git push` is immediately preceded by confirmation language. | accepted-fixed | fork-first-workflow-plan-r2 |
| FFW-R1-001 | Important | approval gates | Task 4 remote rename | Task 4 changed local `.git/config` with `git remote rename` without its own confirmation gate. | Plan approval could be mistaken for permission to mutate future fetch/push semantics. | Add a stop-for-confirmation step before `git remote rename` and branch tracking config. | Record before/after `git remote -v`, branch tracking, and confirmation evidence. | accepted-fixed | fork-first-workflow-plan-r2 |
| FFW-R1-003 | Minor | approval gates | Task 4 evidence | Task 4 matrix cited `git branch -vv`, but Task 4 did not run it. | Task state could claim branch evidence before collecting it. | Add `git branch -vv` and branch config checks to Task 4 verification. | Confirm evidence text matches commands run. | accepted-fixed | fork-first-workflow-plan-r2 |
| FFW-R2-001 | Important | git sequencing | Recipe fetch command blocks | `git fetch origin upstream` and `git fetch upstream origin` fetch one remote with the second token as a refspec, not two remotes. | Durable recipe would give users copyable commands that fail. | Replace multi-remote-looking fetch lines with separate `git fetch origin` and `git fetch upstream` commands. | Re-read recipe blocks and optionally dry-run separate fetches after remotes exist. | accepted-fixed | fork-first-workflow-plan-r3 |

## Review Acceptance

- Accepted revision: `fork-first-workflow-plan-r3`
- Review lanes: correctness and missed requirements; approval gates and ADR policy; implementation feasibility and Git verification.
- Result: all three lanes returned `ACCEPT` for revision r3.
- Residual risks: implementation still requires separate current-turn confirmation before local Git config changes and before any push; network or authentication can still fail during fetch or push.

## Commit Prep Notes

- 2026-06-14: `git status -sb` showed only `.adr-dir`, `docs/adr/`, and `docs/todos/2026-06-14-fork-first-workflow/` as untracked.
- 2026-06-14: `git diff --check` passed before staging.
- 2026-06-14: No remote rename, push, upstream merge, or source-code change was performed for this planning commit.
