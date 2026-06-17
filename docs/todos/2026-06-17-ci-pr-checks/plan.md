# CI PR Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub emit automatic CI checks for the fork-first PR flow.

**Architecture:** Keep the existing CI job matrix and commands. Add automatic branch push coverage for the PR branch naming conventions already used in this fork, while preserving `pull_request` coverage for normal GitHub PR checks.

**Tech Stack:** GitHub Actions, pnpm 11, Node 22, `gh` CLI.

---

### Task 1: Enable Automatic PR Branch Push Checks

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/todos/2026-06-17-ci-pr-checks/todo.md`

- [ ] **Step 1: Update the CI trigger block**

Change `push.branches` from only `main` to `main`, `fix/**`, and `github-pr/**`. Add explicit `pull_request.types` for `opened`, `synchronize`, `reopened`, and `ready_for_review`.

- [ ] **Step 2: Validate workflow syntax locally**

Run:

```bash
ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "yaml ok"'
```

Expected: `yaml ok`.

- [ ] **Step 3: Run the required security scan for CI config changes**

Run:

```bash
semgrep scan --config p/default --error --metrics=off .github/workflows/ci.yml
```

Expected: scan completes with no findings.

- [ ] **Step 4: Commit and push the branch**

Run staged secret scan before commit:

```bash
gitleaks protect --staged --redact
```

Expected: no leaks found. Commit only task-owned files and push `fix/tsdown-deprecated-options` to `origin`.

- [ ] **Step 5: Verify GitHub automatic behavior**

Run:

```bash
gh run list --repo wbugitlab1/agentmemory --branch fix/tsdown-deprecated-options --limit 10 --json databaseId,event,status,conclusion,headSha,displayTitle,workflowName,createdAt,url
gh pr checks 923 --repo wbugitlab1/agentmemory
gh pr view 923 --repo wbugitlab1/agentmemory --json statusCheckRollup,headRefOid,mergeStateStatus
```

Expected: a non-`workflow_dispatch` run appears for the new head commit, and PR checks/status rollup is no longer empty.

### Task 2: Configure Main Gate After Checks Exist

**Files:**
- Modify: `docs/todos/2026-06-17-ci-pr-checks/todo.md`

- [ ] **Step 1: Capture the stable check names**

Use the automatic run jobs. Expected names are `test (ubuntu-latest, 22)` and `test (macos-latest, 22)`.

- [ ] **Step 2: Set branch protection for `main`**

Configure `main` to require those status checks and pull requests before merge. Do not set this until the automatic checks have been observed on PR #923.

- [ ] **Step 3: Verify protection**

Run:

```bash
gh api repos/wbugitlab1/agentmemory/branches/main/protection --jq '{required_status_checks, required_pull_request_reviews, enforce_admins}'
```

Expected: required status checks include both Node 22 job names.
