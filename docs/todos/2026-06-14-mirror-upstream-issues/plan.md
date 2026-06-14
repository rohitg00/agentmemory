# Upstream Issue Mirroring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror every non-PR issue from `rohitg00/agentmemory` into `wbugitlab1/agentmemory` with idempotent verification.

**Architecture:** Add a small TypeScript mirror tool under `scripts/github/` with pure planning functions and a CLI wrapper around GitHub REST operations. The tool defaults to dry-run with unauthenticated public reads, identifies mirrors by stable HTML markers, sanitizes imported Markdown to avoid notification/cross-reference noise, imports labels and comments with per-chunk idempotency, applies remote writes only after confirmation, and writes JSON reports for dry-run/apply/verify evidence.

**Tech Stack:** TypeScript, Node.js built-ins, unauthenticated `fetch` for pre-approval public reads, GitHub CLI `gh api` for confirmed credentialed GitHub REST calls, Vitest for planner and CLI adapter tests, existing task-state docs.

---

## Current Evidence

- Current repository path: `/Users/A1538552/_projects/_tools/agentmemory`
- Current branch: `main`
- Current status before this plan: clean, `main...origin/main [ahead 41]`
- Current remotes after the parallel fork-workflow change:
  - `origin`: `https://github.com/wbugitlab1/agentmemory.git`
  - `upstream`: `https://github.com/rohitg00/agentmemory.git`
- Local tooling:
  - `gh version 2.93.0`
  - `jq-1.8.1`
  - `npm test` maps to `vitest run --exclude test/integration.test.ts`
- Public read-only inventory:
  - upstream non-PR issues: 377
  - upstream open issues: 145
  - upstream closed issues: 232
  - PR-like issue endpoint items excluded: 536
  - fork non-PR issues before mirror: 0
  - existing fork mirror markers before mirror: 0
  - upstream issue comments: 365 across 210 issues
  - upstream milestone issue count: 0
- No `gh api` command has been run for this task before the credentialed-read/write approval gate.

## File Structure

- Create `scripts/github/issue-mirror.ts`: pure types and functions for marker parsing, body generation, label planning, comment chunking, and action planning.
- Create `scripts/github/mirror-upstream-issues.ts`: CLI entrypoint that reads source/target issues, plans dry-run/apply/verify work, calls `gh api` only when requested, and writes reports.
- Create `test/issue-mirror.test.ts`: Vitest coverage for the pure planner library.
- Modify `docs/todos/2026-06-14-mirror-upstream-issues/todo.md`: progress, review ledger, dry-run/apply/verify evidence.
- Keep generated reports under `docs/todos/2026-06-14-mirror-upstream-issues/`.

## Task 1: Confirm Baseline And GitHub Scope

**Files:**
- Modify: `docs/todos/2026-06-14-mirror-upstream-issues/todo.md`

- [ ] **Step 1: Confirm clean worktree**

Run:

```bash
git status -sb
```

Expected:

```text
## main...origin/main [ahead 41]
?? docs/todos/2026-06-14-mirror-upstream-issues/
```

If unrelated tracked files are modified, stop and inspect before editing.

- [ ] **Step 2: Confirm source and target remotes**

Run:

```bash
git remote -v
```

Expected:

```text
origin    https://github.com/wbugitlab1/agentmemory.git (fetch)
origin    https://github.com/wbugitlab1/agentmemory.git (push)
upstream  https://github.com/rohitg00/agentmemory.git (fetch)
upstream  https://github.com/rohitg00/agentmemory.git (push)
```

- [ ] **Step 3: Confirm local tooling**

Run:

```bash
gh --version
jq --version
```

Expected: `gh` and `jq` are installed. Do not run `gh auth status` yet because credentialed GitHub checks are gated.

- [ ] **Step 4: Record baseline evidence**

Update `docs/todos/2026-06-14-mirror-upstream-issues/todo.md` with command outputs and the current date.

## Task 2: Add Pure Issue Mirror Planner

**Files:**
- Create: `scripts/github/issue-mirror.ts`
- Test: `test/issue-mirror.test.ts`

- [ ] **Step 1: Add failing tests for planner behavior**

Create `test/issue-mirror.test.ts` with tests that assert:

- `isPullRequestItem()` returns `true` when an issue endpoint item has `pull_request`.
- `buildUpstreamMarker(42)` returns `<!-- upstream-issue: rohitg00/agentmemory#42 -->`.
- `parseExistingMirrorMarkers()` maps exactly one marker per target issue and reports duplicates.
- `buildMirrorIssueBody()` includes source URL, source author, source state, timestamps, original labels, original body, and marker.
- `buildMirrorIssueBody()` always keeps the upstream marker and source URL in the issue body when upstream body text is oversized.
- `sanitizeImportedMarkdown()` neutralizes `@mentions`, team mentions, issue/PR references, and closing keywords in imported body/comment text while preserving readability.
- `planLabelActions()` returns only labels used by source issues and missing from target labels.
- `chunkImportedComments()` splits long imported comments below 60000 characters.
- `chunkImportedComments()` emits stable per-source-comment chunk markers.
- `planIssueActions()` returns create, update, comment, close, and skip decisions without creating duplicates.
- `planIssueActions()` rejects multiple upstream markers in one target issue, duplicate markers across target issues, and malformed marker text.
- `planVerification()` fails for missing mirror, duplicate marker, state mismatch, title/body marker mismatch, label mismatch, missing target label, missing comment import marker, or comment-count mismatch.

Run:

```bash
npm test -- test/issue-mirror.test.ts
```

Expected: fails because `scripts/github/issue-mirror.ts` does not exist yet.

- [ ] **Step 2: Implement planner exports**

Create `scripts/github/issue-mirror.ts` exporting these types and functions:

```ts
export const SOURCE_REPO = "rohitg00/agentmemory";
export const TARGET_REPO = "wbugitlab1/agentmemory";
export const MAX_COMMENT_CHARS = 60000;
export const MAX_ISSUE_BODY_CHARS = 60000;

export type GitHubLabel = {
  name: string;
  color?: string;
  description?: string | null;
};

export type GitHubUser = {
  login: string;
  html_url?: string;
};

export type GitHubIssue = {
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  user: GitHubUser | null;
  body: string | null;
  labels: GitHubLabel[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown;
};

export type GitHubComment = {
  id: number;
  user: GitHubUser | null;
  body: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

export type ExistingMirror = {
  upstreamNumber: number;
  targetNumber: number;
  targetState: "open" | "closed";
  targetBody: string;
  targetLabels: string[];
  importedCommentMarkers: ImportedCommentMarker[];
};

export type ImportedCommentMarker = {
  upstreamNumber: number;
  upstreamCommentId: number;
  chunk: number;
  totalChunks: number;
};

export type PlannedAction =
  | { type: "create-label"; label: GitHubLabel }
  | { type: "create-issue"; upstreamNumber: number; title: string; body: string; labels: string[] }
  | { type: "update-issue"; upstreamNumber: number; targetNumber: number; body: string; labels: string[] }
  | { type: "create-comment"; upstreamNumber: number; upstreamCommentId: number | null; targetNumber: number | null; body: string }
  | { type: "close-issue"; upstreamNumber: number; targetNumber: number | null }
  | { type: "skip-issue"; upstreamNumber: number; targetNumber: number; reason: string }
  | { type: "duplicate-marker"; upstreamNumber: number; targetNumbers: number[] }
  | { type: "invalid-marker"; targetNumber: number; reason: string }
  | { type: "rate-limit-stop"; operation: string; retryAfterSeconds: number | null; message: string };
```

The functions must use the stable issue marker `<!-- upstream-issue: rohitg00/agentmemory#N -->` and per-comment marker `<!-- upstream-comment: rohitg00/agentmemory#N id=COMMENT_ID chunk=K/T -->`. Each target issue may contain exactly one upstream issue marker, each upstream number may appear in exactly one target issue, malformed markers fail verification, PR endpoint items are excluded, imported Markdown is sanitized before posting, oversized upstream issue bodies move overflow into imported comments, and pure functions must never require network access.

- [ ] **Step 3: Run planner tests**

Run:

```bash
npm test -- test/issue-mirror.test.ts
```

Expected: all tests pass.

## Task 3: Add GitHub Mirror CLI

**Files:**
- Create: `scripts/github/mirror-upstream-issues.ts`
- Modify: `test/issue-mirror.test.ts` only if planner behavior needs one additional pure regression

- [ ] **Step 1: Implement CLI arguments**

The CLI must accept:

```text
--source rohitg00/agentmemory
--target wbugitlab1/agentmemory
--state all
--dry-run
--apply
--verify
--include-comments
--public-read
--read-with-gh
--report <path>
--confirm-credentialed-reads
--confirm-remote-writes
```

Rules:
- Default mode is dry-run.
- Dry-run and pre-approval verify use unauthenticated public `fetch` reads by default.
- `--read-with-gh` requires `--confirm-credentialed-reads`.
- `--apply` requires both `--confirm-credentialed-reads` and `--confirm-remote-writes`.
- `--apply` uses `gh api` for source reads, target reads, and target writes.
- `--verify` performs read-only inventory and exits nonzero if any upstream issue is missing, duplicated, state-mismatched, label-mismatched, body-marker-mismatched, comment-count-mismatched, or otherwise invalid.
- `--include-comments` is enabled by default for apply; dry-run reports planned imported comment count.
- The CLI must not print tokens or environment values.

- [ ] **Step 2: Implement GitHub API adapter**

Implement two adapters:

- `PublicGitHubReader`: uses Node `fetch` without credentials for pre-approval dry-run and read-only inventory.
- `GhGitHubClient`: uses `node:child_process.execFile` and `gh api` only after `--confirm-credentialed-reads`; target writes also require `--confirm-remote-writes`.

Required endpoints:

```text
GET    /repos/{owner}/{repo}/issues?state=all&per_page=100
GET    /repos/{owner}/{repo}/labels?per_page=100
GET    /repos/{owner}/{repo}/issues/{issue_number}/comments?per_page=100
POST   /repos/{owner}/{repo}/labels
POST   /repos/{owner}/{repo}/issues
PATCH  /repos/{owner}/{repo}/issues/{issue_number}
POST   /repos/{owner}/{repo}/issues/{issue_number}/comments
```

For paginated reads, use:

```bash
gh api --paginate --slurp -X GET "/repos/OWNER/REPO/issues" -f state=all -f per_page=100
```

Parse `--slurp` output by flattening the outer array of pages.

For public pre-approval reads, use `fetch` with `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and a non-secret `User-Agent`. Public-read pagination must follow the `Link` header and must stop cleanly on rate limit, writing the partial report instead of retrying indefinitely.

- [ ] **Step 3: Implement apply ordering**

Apply mode must run in this order:

1. Read source issues and exclude PR items.
2. Read target issues and existing markers.
3. Read target comments for existing mirrors so per-comment markers can prevent duplicate imported comments.
4. Stop if any duplicate, malformed, or multi-upstream marker exists in the fork.
5. Create missing labels used by source issues.
6. Create or update missing/drifted target issues in upstream issue number order.
7. Import only missing comment chunks for created or existing mirrors.
8. Close mirrors whose upstream issue is closed.
9. Write apply report after every successful write batch and before any rate-limit stop.
10. Run verify mode.

Remote writes must be sequential by default. Wait at least one second between writes. If GitHub returns `403`, `429`, secondary-rate-limit text, or a `Retry-After` header, stop the apply run, record the blocked operation and retry guidance in the report, and resume only by rerunning the idempotent apply command after the wait period.

- [ ] **Step 4: Implement idempotent comment import**

For each imported source comment chunk, include a stable per-chunk marker in the target comment body:

```text
<!-- upstream-comment: rohitg00/agentmemory#N id=COMMENT_ID chunk=K/T -->
```

Scan existing target comments before planning comment import. If a target issue already has the marker for a source comment chunk, skip that chunk. After all chunks for an issue are present, add or update a summary marker:

```text
<!-- upstream-comments-imported: rohitg00/agentmemory#N count=M -->
```

A retry after partial failure must post only missing chunks, never all comments again.

- [ ] **Step 5: Implement imported Markdown sanitization**

Before creating issue bodies or imported comments, sanitize original upstream Markdown:

- Replace `@` with `@<!-- -->` to break user and team mentions.
- Replace same-repository issue/PR shorthand such as `#123` with `#<!-- -->123`.
- Break closing keywords by inserting an HTML comment, for example `fixes` becomes `fix<!-- -->es`.
- Keep the original source URL in explicit metadata so readers can inspect the unsanitized source on GitHub.
- Count sanitized mentions, issue references, and closing keywords in the dry-run/apply report.

The residual risk that GitHub may still create repository events for issue creation, label creation, comments, or closures must be included in the approval prompt.

- [ ] **Step 6: Run CLI smoke tests**

Run:

```bash
npx tsx scripts/github/mirror-upstream-issues.ts --source rohitg00/agentmemory --target wbugitlab1/agentmemory --state all --dry-run --public-read --report docs/todos/2026-06-14-mirror-upstream-issues/dry-run-report.json
```

Expected: dry-run completes without credentials or remote writes and reports 377 upstream non-PR issues unless upstream changed.

- [ ] **Step 7: Add CLI safety and verification tests**

Extend `test/issue-mirror.test.ts` with CLI/adapter fixture tests that use injected fake readers/writers or a fake `gh` executable. The tests must assert:

- Default mode and `--dry-run --public-read` never call `POST` or `PATCH`.
- `--apply` without `--confirm-credentialed-reads` exits nonzero before any GitHub read or write through `gh`.
- `--apply` without `--confirm-remote-writes` exits nonzero before any target write.
- `--verify` performs only read endpoints.
- Verify passes for a complete mirror fixture.
- Verify fails for a missing mirror.
- Verify fails for duplicate upstream markers across target issues.
- Verify fails when one target issue contains two different upstream markers.
- Verify fails for open/closed state mismatch.
- Verify fails for label mismatch and missing target label.
- Verify fails for missing comment import marker and marker count mismatch.
- PR endpoint items are excluded from source counts.
- Report totals include `sourceIssueEndpointItems`, `sourcePullRequestItemsExcluded`, and `sourceNonPrIssues`.
- Rate-limit responses are classified as stop conditions and recorded without retry loops.

Run:

```bash
npm test -- test/issue-mirror.test.ts
```

Expected: all planner and CLI fixture tests pass.

## Task 4: Review And Implement

**Files:**
- Modify according to review findings within this plan's file scope

- [ ] **Step 1: Run `review-and-implement` Phase 1**

Dispatch reviewer lanes for:

- spec-plan mismatch and missing acceptance criteria
- architecture, integration, and ownership risk
- verification and test gaps
- scope creep or unnecessary remote work

Expected: all High/Medium findings are fixed, rejected with evidence, or marked `needs_user_decision` if they require changed scope.

- [ ] **Step 2: Implement with subagents**

Use subagent-driven development with exclusive ownership:

- Planner/test worker: `scripts/github/issue-mirror.ts`, `test/issue-mirror.test.ts`
- CLI worker: `scripts/github/mirror-upstream-issues.ts`
- Integration lead: dry-run, report validation, task-state updates

Expected: no overlapping write ownership without integration review.

- [ ] **Step 3: Run `review-and-implement` final review after implementation**

After implementation and targeted verification, dispatch final reviewer lanes for:

- Security: credentials, secrets, notification/cross-reference sanitization, GitHub writes, rate limits, and unsafe boundary changes.
- Test Coverage: missing planner/CLI fixture coverage, weak verify assertions, and live dry-run/report gaps.
- Maintainability: complexity, retry/resume clarity, report schema clarity, and plan drift.

Expected: all High/Medium findings are fixed, rejected with evidence, or classified with rationale; targeted verification is rerun after fixes.

- [ ] **Step 4: Run `verification-before-completion` before final handoff**

Before claiming completion, verify every acceptance criterion in the task state against current files, reports, command outputs, and GitHub fork state.

Expected: completion is claimed only after the live verify report proves every upstream non-PR issue has exactly one fork mirror.

## Task 5: Dry-Run And Approval Gate

**Files:**
- Create: `docs/todos/2026-06-14-mirror-upstream-issues/dry-run-report.json`
- Modify: `docs/todos/2026-06-14-mirror-upstream-issues/todo.md`

- [ ] **Step 1: Run dry-run**

Run:

```bash
npx tsx scripts/github/mirror-upstream-issues.ts --source rohitg00/agentmemory --target wbugitlab1/agentmemory --state all --dry-run --public-read --report docs/todos/2026-06-14-mirror-upstream-issues/dry-run-report.json
```

Expected:
- 377 source non-PR issues
- 536 PR-like endpoint items excluded unless upstream changed
- 0 target mirrors before apply unless another process created them
- missing label actions for labels absent from the fork
- create issue actions for each missing upstream issue
- planned comment import count of 365
- planned close actions for 232 closed upstream issues
- zero credentialed `gh api` calls
- report includes sanitized mention/reference counts

- [ ] **Step 2: Stop for explicit remote-write confirmation**

Ask the user this exact question before any credentialed `gh api` read, target write, or post-apply credentialed verify:

```text
May I use GitHub credentials through gh api to read rohitg00/agentmemory and wbugitlab1/agentmemory, then create or update missing labels, issue mirrors, imported comments, and closed-state updates in wbugitlab1/agentmemory for all upstream non-PR issues from rohitg00/agentmemory? This can create GitHub repository events and notifications even though imported Markdown will be sanitized.
```

Expected: continue only if the user explicitly confirms in the current turn.

## Task 6: Apply Mirror And Verify Completion

**Files:**
- Create: `docs/todos/2026-06-14-mirror-upstream-issues/apply-report.json`
- Create: `docs/todos/2026-06-14-mirror-upstream-issues/verify-report.json`
- Modify: `docs/todos/2026-06-14-mirror-upstream-issues/todo.md`

- [ ] **Step 1: Apply mirror**

Run only after explicit confirmation:

```bash
npx tsx scripts/github/mirror-upstream-issues.ts --source rohitg00/agentmemory --target wbugitlab1/agentmemory --state all --apply --include-comments --read-with-gh --confirm-credentialed-reads --confirm-remote-writes --report docs/todos/2026-06-14-mirror-upstream-issues/apply-report.json
```

Expected: all missing labels and issue mirrors are created, comments are imported, and closed upstream issues are closed in the fork.

- [ ] **Step 2: Verify mirror**

Run:

```bash
npx tsx scripts/github/mirror-upstream-issues.ts --source rohitg00/agentmemory --target wbugitlab1/agentmemory --state all --verify --read-with-gh --confirm-credentialed-reads --report docs/todos/2026-06-14-mirror-upstream-issues/verify-report.json
```

Expected: zero missing mirrors, zero duplicate markers, zero invalid markers, zero state mismatches, zero label mismatches, zero title/body marker mismatches, zero missing target labels, zero missing comment markers, zero comment-count mismatches, and source issue count equals verified unique mirror count.

- [ ] **Step 3: Run local verification**

Run:

```bash
npm test -- test/issue-mirror.test.ts
git diff --check
```

Expected: tests pass and diff check is clean.

- [ ] **Step 4: Run pre-commit secret scan if committing**

If committing task-owned files, stage only those files and run:

```bash
gitleaks protect --staged --redact
```

Expected: no leaks found.

- [ ] **Step 5: Record completion evidence**

Update `docs/todos/2026-06-14-mirror-upstream-issues/todo.md` with:

```markdown
## Final Review Notes

- Source issue endpoint items:
- Source pull request items excluded:
- Source issue count:
- Target mirror count:
- Missing mirrors:
- Duplicate markers:
- Invalid markers:
- State mismatches:
- Label mismatches:
- Missing target labels:
- Title/body marker mismatches:
- Comment import status:
- Comment count mismatches:
- Sanitized mention/reference counts:
- Rate-limit or partial-apply status:
- Final review status:
- Verification commands:
- Residual risks:
```

## Self-Review

- Spec coverage: the plan covers all upstream non-PR issues, labels, comments, open/closed state, idempotency, dry-run, apply, and verify.
- Placeholder scan: no unresolved placeholder markers are intentionally left in executable tasks.
- Boundary coverage: remote writes are behind an explicit confirmation gate; dry-run and tests do not require remote writes.
- Verification coverage: final completion requires a verify report proving every upstream issue has exactly one fork mirror.
