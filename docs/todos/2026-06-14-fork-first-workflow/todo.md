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
| ADR baseline initialized | `adr list` | Done | In worktree `/Users/A1538552/.codex/worktrees/f5bb/agentmemory`, `adr list` returned `docs/adr/0001-record-architecture-decisions.md`; `.adr-dir` contains `docs/adr`. |
| Fork workflow plan written | Plan self-review and `/review-plan` | Done | Revision `fork-first-workflow-plan-r3` accepted by all three review lanes. |
| Fork-first ADR recorded | `adr list`, `adr generate toc` | Done | ADR 2 created with `adr new`; TOC generated at `docs/adr/README.md`. |
| Operational recipe documented | Markdown fence check, exact-content review, command review | Done | Fence check returned `Markdown fences balanced`; exact-content review matched the requested recipe; command review found separate fetch commands, push confirmation gates, upstream PR branch commands, and rerere guidance. |
| Local remote convention applied | `git remote -v`, branch config, `git branch -vv` | Done | `origin` points to `https://github.com/wbugitlab1/agentmemory.git`, `upstream` points to `https://github.com/rohitg00/agentmemory.git`, and `branch.main.remote` / `branch.main.merge` are `origin` / `refs/heads/main`. |
| Fork main published | `git push -u origin main:main`, `git rev-list`, `git branch -vv` | Done | User approved the push; at Task 5 completion, `git push -u origin main:main` updated fork `origin/main` from `f6f9e3c` to `cd006e9`, `origin/main...main` returned `0 0`, and `main` tracked `origin/main`. |

## Progress Notes

- 2026-06-14: User confirmed the fork-first direction and requested `writing-plans`, `/review-plan`, `docs/adr`, and `adr-tools`.
- 2026-06-14: Read `/Users/A1538552/.agents/instructions/global.md`; it requires durable decisions under `docs/adr/` and recommends `/Users/A1538552/_projects/_tools/adr-tools/src/adr`.
- 2026-06-14: `docs/adr` and `.adr-dir` were missing; initialized with `/Users/A1538552/_projects/_tools/adr-tools/src/adr init docs/adr`.
- 2026-06-14: Baseline in worktree `/Users/A1538552/.codex/worktrees/f5bb/agentmemory`: `git status -sb` returned `## fork-implementation`; no tracked source files were modified.
- 2026-06-14: Baseline remotes matched expected fork-first pre-implementation state: `fork` fetch/push `https://github.com/wbugitlab1/agentmemory.git`; `origin` fetch/push `https://github.com/rohitg00/agentmemory.git`.
- 2026-06-14: `git worktree list --porcelain` confirmed this worktree at `/Users/A1538552/.codex/worktrees/f5bb/agentmemory` on `refs/heads/fork-implementation` with HEAD `cd006e96cb4069cea0f23cf17b4b7f489b2acb2c`; additional worktrees are user-managed.
- 2026-06-14: `/Users/A1538552/_projects/_tools/adr-tools/src/adr list` returned `docs/adr/0001-record-architecture-decisions.md`.
- 2026-06-14: Created ADR 2 with `VISUAL=true EDITOR=true /Users/A1538552/_projects/_tools/adr-tools/src/adr new "Use fork-first development workflow"`, which returned `docs/adr/0002-use-fork-first-development-workflow.md`; generated `docs/adr/README.md`; verified `adr list` returned ADR 1 and ADR 2.
- 2026-06-14: Final verification for Task 2: `adr list` returned ADR 1 and ADR 2; `git diff --check` passed; `git status -sb --untracked-files=all` showed only the task record plus new ADR 2 and ADR README.
- 2026-06-14: Task 3 fence check returned `Markdown fences balanced` for `docs/recipes/fork-workflow.md`.
- 2026-06-14: Task 4 Step 1 gate check in worktree `fork-implementation`: `git status -sb --untracked-files=all` showed only task-owned documentation changes; `git remote -v` still showed `origin` as the original repository and `fork` as the user's fork; `git branch -vv` showed this worktree on `fork-implementation` and `main` checked out in the primary worktree. Stopped before any local Git config change pending explicit current-turn confirmation.
- 2026-06-14: User confirmed Task 4 local Git config change with "tu es". Ran `git remote rename origin upstream`, `git remote rename fork origin`, `git fetch upstream`, `git fetch origin`, `git config branch.main.remote origin`, and `git config branch.main.merge refs/heads/main`. Verification showed `origin=https://github.com/wbugitlab1/agentmemory.git`, `upstream=https://github.com/rohitg00/agentmemory.git`, `branch.main.remote=origin`, `branch.main.merge=refs/heads/main`, and `main` tracking `origin/main` ahead by 41. No push was performed.
- 2026-06-14: Task 4 subagent reviews passed. Spec review confirmed the remote/tracking convention and found no Task 4 push marker; quality review confirmed `main` is still 41 commits ahead of `origin/main`, Task 5 remains pending, and no source files changed.
- 2026-06-14: User confirmed Task 5 push with "yes". Ran `git push -u origin main:main`, which updated fork `origin/main` from `f6f9e3c` to `cd006e9` and set `main` to track `origin/main`. Verification showed `git rev-list --left-right --count origin/main...main` returned `0 0`, `branch.main.remote=origin`, and `branch.main.merge=refs/heads/main`.
- 2026-06-14: During `/prep-merge-to-local-main`, local `main` had advanced to `1176e5f` with commits `58b68b4` and `1176e5f`; `origin/main` and `fork-implementation` remained at `cd006e9`, so `git rev-list --left-right --count origin/main...main` returned `0 2` before merging local `main` into this branch. This is current prep-merge evidence, not a contradiction of the earlier Task 5 push evidence.

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

## Final Review Notes

- ADR verification: `/Users/A1538552/_projects/_tools/adr-tools/src/adr list` returned ADR 1 and ADR 2; `/Users/A1538552/_projects/_tools/adr-tools/src/adr generate toc` output listed both records.
- Documentation verification: `git diff --check` passed for tracked diffs; direct Markdown formatting checks passed for `docs/adr/0002-use-fork-first-development-workflow.md`, `docs/adr/README.md`, `docs/recipes/fork-workflow.md`, and this task record.
- Git remote verification: `git remote -v` shows `origin=https://github.com/wbugitlab1/agentmemory.git` and `upstream=https://github.com/rohitg00/agentmemory.git`; `branch.main.remote=origin`; `branch.main.merge=refs/heads/main`.
- Push status: user approved `git push -u origin main:main`; at Task 5 completion, fork `origin/main` matched then-local `main` at `cd006e9` with `git rev-list --left-right --count origin/main...main` returning `0 0`. During prep-merge, current local `main` is `1176e5f`, so it is two commits ahead of `origin/main` and will be merged locally before any future publication decision.
- Source test status: `npm test` was not run because this implementation changed only documentation and local Git configuration; no source file or upstream merge changed runtime behavior.
- Residual risks: this worktree is `fork-implementation`, not `main`; the implementation docs are being prepared for a local prep-merge commit before integration. Other existing branches that tracked the old `origin/main` now track `upstream/main` after the remote rename, which is expected for upstream-oriented branches but should be considered before using them.
