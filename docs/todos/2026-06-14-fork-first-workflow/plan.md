# Fork-First Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a documented fork-first workflow where the user's fork is the primary development line and the original repository remains the regularly merged upstream.

**Architecture:** Durable decisions live in `docs/adr/` and are created with `adr-tools`; operational commands live in `docs/recipes/fork-workflow.md`. Git remotes use the standard convention `origin` = user fork and `upstream` = original repository, with all remote writes gated by explicit current-turn confirmation.

**Tech Stack:** Git, adr-tools, Markdown documentation, existing npm/vitest verification only when source changes or upstream merges occur.

---

## Current Evidence

- Working directory: `/Users/A1538552/_projects/_tools/agentmemory`
- Current branch before planning: `main`
- Current state before planning: `main...origin/main [ahead 40]`
- Current remotes before implementation:
  - `origin` fetch/push: `https://github.com/rohitg00/agentmemory.git`
  - `fork` fetch/push: `https://github.com/wbugitlab1/agentmemory.git`
- `docs/adr/` was missing before this task and was initialized with:

```bash
/Users/A1538552/_projects/_tools/adr-tools/src/adr init docs/adr
```

- The initialization created:
  - `.adr-dir`
  - `docs/adr/0001-record-architecture-decisions.md`

## File Structure

- `.adr-dir`: existing ADR directory pointer created by `adr init docs/adr`; keep content exactly `docs/adr`.
- `docs/adr/0001-record-architecture-decisions.md`: existing baseline ADR created by `adr-tools`; do not hand-edit unless verification finds corruption.
- `docs/adr/0002-use-fork-first-development-workflow.md`: new ADR created by `adr new`, then filled with the fork-first decision.
- `docs/adr/README.md`: generated ADR table of contents from `adr generate toc`.
- `docs/recipes/fork-workflow.md`: operational workflow with commands for daily fork work, upstream sync, and upstream PR preparation.
- `docs/todos/2026-06-14-fork-first-workflow/todo.md`: task state, evidence, approval gates, and final review notes.
- `docs/todos/2026-06-14-fork-first-workflow/plan.md`: this implementation plan.
- `.git/config`: local-only remote configuration changed by `git remote rename`; this is not a tracked project file.

## Task 1: Confirm Baseline Before Edits

**Files:**
- Modify: `docs/todos/2026-06-14-fork-first-workflow/todo.md`

- [ ] **Step 1: Confirm repository status**

Run:

```bash
git status -sb
```

Expected:

```text
## main...origin/main [ahead 40]
?? .adr-dir
?? docs/adr/
?? docs/todos/2026-06-14-fork-first-workflow/
```

If any tracked source files are modified, inspect them with `git diff --stat` and stop unless they are task-owned changes.

- [ ] **Step 2: Confirm remote URLs**

Run:

```bash
git remote -v
```

Expected before remote implementation:

```text
fork    https://github.com/wbugitlab1/agentmemory.git (fetch)
fork    https://github.com/wbugitlab1/agentmemory.git (push)
origin  https://github.com/rohitg00/agentmemory.git (fetch)
origin  https://github.com/rohitg00/agentmemory.git (push)
```

If either URL differs, stop and update this plan before remote changes.

- [ ] **Step 3: Confirm worktree ownership**

Run:

```bash
git worktree list --porcelain
```

Expected: the primary worktree is `/Users/A1538552/_projects/_tools/agentmemory` on `refs/heads/main`; any additional worktrees are user-managed and must not be moved, deleted, repurposed, or cleaned by this task.

- [ ] **Step 4: Confirm ADR tooling**

Run:

```bash
/Users/A1538552/_projects/_tools/adr-tools/src/adr list
```

Expected output includes:

```text
docs/adr/0001-record-architecture-decisions.md
```

- [ ] **Step 5: Record baseline evidence**

Update `docs/todos/2026-06-14-fork-first-workflow/todo.md` under `Progress Notes` with the exact command outcomes from Steps 1-4.

## Task 2: Record Fork-First Decision As An ADR

**Files:**
- Create: `docs/adr/0002-use-fork-first-development-workflow.md`
- Create: `docs/adr/README.md`
- Modify: `docs/todos/2026-06-14-fork-first-workflow/todo.md`

- [ ] **Step 1: Create the ADR file with adr-tools**

Run:

```bash
VISUAL=true EDITOR=true /Users/A1538552/_projects/_tools/adr-tools/src/adr new "Use fork-first development workflow"
```

Expected:

```text
docs/adr/0002-use-fork-first-development-workflow.md
```

If the file number is not `0002`, use the path printed by the command in the remaining steps and update this plan before continuing.

- [ ] **Step 2: Replace the generated ADR body with the accepted decision**

Edit `docs/adr/0002-use-fork-first-development-workflow.md` to exactly this content, preserving the actual file number if `adr-tools` produced a different one:

````markdown
# 2. Use fork-first development workflow

Date: 2026-06-14

## Status

Accepted

## Context

This repository has accumulated local changes that are useful for our work but are not guaranteed to be accepted promptly by the original upstream project. The current local `main` is ahead of the original repository and the repository already has two remotes: the original repository at `https://github.com/rohitg00/agentmemory.git` and the user's fork at `https://github.com/wbugitlab1/agentmemory.git`.

We still want to contribute generally useful fixes upstream, but we cannot let our local development cadence depend on upstream maintainers accepting every pull request.

## Decision

We will treat the user's fork as the primary development line for this workspace. Local Git remotes will use the standard convention:

- `origin` points to `https://github.com/wbugitlab1/agentmemory.git`
- `upstream` points to `https://github.com/rohitg00/agentmemory.git`

The fork's `main` branch is the integration branch for our maintained version. Upstream changes are integrated into the fork with normal merge commits from `upstream/main`; published fork history must not be rebased or rewritten.

Pull requests to the original project are prepared on small branches created from `upstream/main`. Those branches should contain the minimal commits needed for the upstream contribution, not the full fork integration history.

Remote writes, including pushes to the fork, require explicit current-turn confirmation before execution.

## Consequences

We can continue developing independently even when upstream pull requests are delayed or rejected.

Routine upstream synchronization becomes an explicit maintenance activity: fetch upstream, merge `upstream/main` into the fork `main`, run verification, and push to the fork only after confirmation.

Merge conflicts may recur because our fork can intentionally diverge from upstream. Enable Git rerere locally where useful, but do not use force-pushes or rebases to hide divergence.

Upstream contribution work needs extra discipline: fixes intended for the original project should be isolated on branches based on `upstream/main`, while fork-only policy, packaging, or operational changes remain on the fork line.
````

- [ ] **Step 3: Generate ADR table of contents**

Run:

```bash
/Users/A1538552/_projects/_tools/adr-tools/src/adr generate toc > docs/adr/README.md
```

Expected: `docs/adr/README.md` lists ADR 1 and ADR 2.

- [ ] **Step 4: Verify ADR list**

Run:

```bash
/Users/A1538552/_projects/_tools/adr-tools/src/adr list
```

Expected output includes:

```text
docs/adr/0001-record-architecture-decisions.md
docs/adr/0002-use-fork-first-development-workflow.md
```

- [ ] **Step 5: Record ADR evidence**

Update `docs/todos/2026-06-14-fork-first-workflow/todo.md`:

````markdown
| Fork-first ADR recorded | `adr list`, `adr generate toc` | Done | ADR 2 created with `adr new`; TOC generated at `docs/adr/README.md`. |
````

## Task 3: Document Operational Fork Workflow

**Files:**
- Create: `docs/recipes/fork-workflow.md`
- Modify: `docs/todos/2026-06-14-fork-first-workflow/todo.md`

- [ ] **Step 1: Create the fork workflow recipe**

Create `docs/recipes/fork-workflow.md` with this exact content:

````markdown
# Fork Workflow

This repository is maintained as a fork-first workspace.

## Remote Roles

- `origin`: the maintained fork, `https://github.com/wbugitlab1/agentmemory.git`
- `upstream`: the original repository, `https://github.com/rohitg00/agentmemory.git`

Do not push to `upstream`. Do not force-push published fork history.

## Daily Fork Work

```bash
git switch main
git status -sb
git fetch origin
git fetch upstream
```

Develop normal changes on branches from `main` unless the branch is specifically intended as an upstream pull request.

## Sync From Upstream

```bash
git switch main
git status -sb
git fetch upstream
git fetch origin
git merge upstream/main
npm test
```

If tests pass and the merge should be published, ask for explicit current-turn confirmation before running:

```bash
git push origin main
```

If the merge conflicts, stop and resolve the conflict as a normal task with task-state notes and verification. Do not rebase `main` to avoid conflicts.

## Prepare An Upstream Pull Request

```bash
git fetch upstream
git fetch origin
git switch -c upstream-pr/<short-topic> upstream/main
git cherry-pick <commit-sha>
npm test
```

If the upstream PR branch should be published, ask for explicit current-turn confirmation before running:

```bash
git push origin upstream-pr/<short-topic>
```

Only cherry-pick the minimal commits that should be proposed to the original project. Fork-only policy, packaging, or operational changes stay on the fork line.

## Local Conflict Memory

Git rerere can reduce repeated merge conflict work:

```bash
git config rerere.enabled true
```

This setting is local. It does not change project files or remote state.

## Approval Gates

Ask for explicit current-turn confirmation before any push, remote publication, pull request creation, force operation, branch deletion, history rewrite, or change to remote/project/account state.
````

- [ ] **Step 2: Check Markdown fences**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
path = Path("docs/recipes/fork-workflow.md")
text = path.read_text()
if text.count("```") % 2:
    raise SystemExit("unbalanced Markdown fences")
print("Markdown fences balanced")
PY
```

Expected:

```text
Markdown fences balanced
```

- [ ] **Step 3: Record recipe evidence**

Update `docs/todos/2026-06-14-fork-first-workflow/todo.md`:

```markdown
| Operational recipe documented | `git diff --check`, command review | Done | `docs/recipes/fork-workflow.md` documents remote roles, upstream sync, upstream PR branches, rerere, and approval gates. |
```

## Task 4: Reconfigure Local Remotes And Branch Tracking

**Files:**
- Modify local-only Git config: `.git/config`
- Modify: `docs/todos/2026-06-14-fork-first-workflow/todo.md`

- [ ] **Step 1: Confirm no unexpected local changes before Git config changes**

Run:

```bash
git status -sb
git remote -v
git branch -vv
```

Expected: only task-owned documentation files are untracked or modified, and remotes still show `origin` as the original and `fork` as the user's fork.

- [ ] **Step 2: Stop for explicit local remote confirmation**

Ask the user this exact question before any `git remote rename` or branch-tracking config change:

```text
May I update local Git configuration so origin points to https://github.com/wbugitlab1/agentmemory.git, upstream points to https://github.com/rohitg00/agentmemory.git, and local main tracks origin/main? This changes only local .git/config and performs no remote write.
```

Expected: continue only if the user explicitly confirms in the current turn.

- [ ] **Step 3: Rename original remote to upstream**

Run:

```bash
git remote rename origin upstream
```

Expected: command exits 0.

- [ ] **Step 4: Rename fork remote to origin**

Run:

```bash
git remote rename fork origin
```

Expected: command exits 0.

- [ ] **Step 5: Fetch both remotes**

Run:

```bash
git fetch upstream
git fetch origin
```

Expected: both fetches complete without changing the working tree.

- [ ] **Step 6: Set local main to track the fork remote name**

Run:

```bash
git config branch.main.remote origin
git config branch.main.merge refs/heads/main
```

Expected: command exits 0. This is a local-only tracking configuration. If `origin/main` does not exist yet on the fork, `git status -sb` may report `origin/main` as gone until Task 5 publishes the branch.

- [ ] **Step 7: Verify remote and tracking convention**

Run:

```bash
git remote -v
git config --get branch.main.remote
git config --get branch.main.merge
git status -sb
git branch -vv
```

Expected:

```text
origin    https://github.com/wbugitlab1/agentmemory.git (fetch)
origin    https://github.com/wbugitlab1/agentmemory.git (push)
upstream  https://github.com/rohitg00/agentmemory.git (fetch)
upstream  https://github.com/rohitg00/agentmemory.git (push)
origin
refs/heads/main
```

`git status -sb` should reference `origin/main`, either as the active upstream or as `[gone]` if the fork branch has not been published yet. It must not reference `upstream/main` as the local `main` tracking branch after this step.

- [ ] **Step 8: Record remote evidence**

Update `docs/todos/2026-06-14-fork-first-workflow/todo.md`:

```markdown
| Local remote convention applied | `git remote -v`, branch config, `git branch -vv` | Done | `origin` points to the fork, `upstream` points to the original repository, and local `main` is configured to track `origin/main`. |
```

## Task 5: Publish Fork Main After Explicit Confirmation

**Files:**
- Modify remote fork state only after explicit current-turn confirmation
- Modify: `docs/todos/2026-06-14-fork-first-workflow/todo.md`

- [ ] **Step 1: Stop for explicit push confirmation**

Ask the user this exact question before any push:

```text
May I push the current local main branch to origin/main on https://github.com/wbugitlab1/agentmemory.git?
```

Expected: continue only if the user explicitly confirms in the current turn.

- [ ] **Step 2: Push local main to the fork and set tracking**

Run only after confirmation:

```bash
git push -u origin main:main
```

Expected: the push succeeds. Local `main` should already be configured to track `origin/main` from Task 4, and `-u` refreshes that tracking configuration.

If Git reports non-fast-forward, rejected, protected branch, authentication failure, or any force requirement, stop and record the exact output. Do not force-push.

- [ ] **Step 3: Verify tracking**

Run:

```bash
git status -sb
git branch -vv
git config --get branch.main.remote
git config --get branch.main.merge
```

Expected:

```text
## main...origin/main
```

`git branch -vv` shows local `main` tracking `origin/main`.

`git config --get branch.main.remote` returns `origin`; `git config --get branch.main.merge` returns `refs/heads/main`.

- [ ] **Step 4: Record push evidence**

Update `docs/todos/2026-06-14-fork-first-workflow/todo.md`:

```markdown
| Fork main published | `git push -u origin main:main`, `git status -sb` | Done | Local `main` pushed to the fork and now tracks `origin/main`. |
```

If the user does not approve the push, record:

```markdown
| Fork main published | Explicit confirmation gate | Deferred | Remote push was not approved in the current turn. Local docs and local Git remote/tracking configuration can still be completed; if the fork does not yet have `origin/main`, `git status -sb` may show that upstream as gone until publication is approved. |
```

## Task 6: Verify Documentation And Git State

**Files:**
- Modify: `docs/todos/2026-06-14-fork-first-workflow/todo.md`

- [ ] **Step 1: Verify ADR commands**

Run:

```bash
/Users/A1538552/_projects/_tools/adr-tools/src/adr list
/Users/A1538552/_projects/_tools/adr-tools/src/adr generate toc
```

Expected: ADR 1 and ADR 2 are listed; generated TOC includes both records.

- [ ] **Step 2: Verify documentation formatting**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Search for stale remote guidance in touched docs**

Run:

```bash
rg -n "origin|upstream|fork|docs/adr" README.md docs/adr docs/recipes docs/todos/2026-06-14-fork-first-workflow
```

Expected: references in durable docs consistently use `origin` for the fork and `upstream` for the original repository, or are historical/task-state evidence that names the previous pre-rename state.

- [ ] **Step 4: Verify final Git state**

Run:

```bash
git status -sb
git remote -v
git branch -vv
git worktree list --porcelain
```

Expected: tracked changes are limited to ADR and task documentation; local remotes match the documented convention; worktrees are unchanged except for remote names visible in this checkout.

- [ ] **Step 5: Run source tests only if source or upstream merge changed**

If this task only changes docs and local Git config, do not run `npm test`; record that source tests were not applicable because no source code changed and no upstream merge was performed.

If upstream was merged or any source file changed, run:

```bash
npm test
```

Expected: the test suite passes. If it fails, stop and treat the failure as a normal debugging task.

- [ ] **Step 6: Run staged secret scan before any commit**

If a commit is requested, stage only task-owned files, then run:

```bash
gitleaks protect --staged --redact
```

Expected: no leaks found. If Gitleaks finds anything, stop and fix or ask before proceeding.

- [ ] **Step 7: Record final verification**

Update `docs/todos/2026-06-14-fork-first-workflow/todo.md` with:

```markdown
## Final Review Notes

- ADR verification:
- Documentation verification:
- Git remote verification:
- Push status:
- Source test status:
- Residual risks:
```

## Self-Review

- Spec coverage: the plan covers ADR initialization, durable fork-first decision recording, operational recipe documentation, remote renaming, fork publish gate, verification, and final task-state evidence.
- Placeholder scan: no unresolved placeholder markers are intentionally left in the executable tasks.
- Type and command consistency: remote names are consistently `origin` for the fork and `upstream` for the original after Task 4; before Task 4 the plan explicitly expects the current `origin`/`fork` layout.
- Approval gates: Task 5 stops before remote push; no force-push, rebase, remote PR creation, deployment, branch deletion, or destructive local action is included.
