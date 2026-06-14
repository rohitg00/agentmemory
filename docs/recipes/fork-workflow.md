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
