# Upstream PR Issue Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track every upstream pull request from `rohitg00/agentmemory` as a normal issue in `wbugitlab1/agentmemory` so the fork has its own triage and decision backlog.

**Architecture:** Add a fork-local PR tracker with pure planning logic, a dry-run-first GitHub CLI, a durable ADR, and a recipe. The tracker uses stable HTML markers in fork issue bodies for idempotency, preserves manual decision labels and manual issue notes, and performs GitHub writes only in apply mode after explicit current-turn confirmation.

**Tech Stack:** TypeScript, Node.js built-ins, GitHub REST API through unauthenticated `fetch` for public dry-run reads, `gh api` for confirmed credentialed reads/writes, Vitest, adr-tools, Markdown task state.

---

## Current Evidence

- Working directory: `/Users/A1538552/_projects/_tools/agentmemory`
- Current branch: `main`
- Current status during planning: `main...origin/main [ahead 41]` plus untracked task-state work under `docs/todos/2026-06-14-mirror-upstream-issues/`
- Current remotes:
  - `origin`: `https://github.com/wbugitlab1/agentmemory.git`
  - `upstream`: `https://github.com/rohitg00/agentmemory.git`
- Current ADR list contains only `docs/adr/0001-record-architecture-decisions.md`, so the expected new ADR path for this task is `docs/adr/0002-track-upstream-pull-requests-as-fork-issues.md`.
- Existing adjacent task: `docs/todos/2026-06-14-mirror-upstream-issues/` plans normal upstream issue mirroring and explicitly excludes PRs. That adjacent plan was written before the final remote naming settled and contains stale `origin`/`fork` terminology; do not copy its remote examples into this PR-tracker task without correcting them to `origin` = fork and `upstream` = original.
- GitHub documentation evidence:
  - Pull requests can be listed with the REST pull requests API, using `state=open|closed|all` and `per_page` pagination.
  - GitHub states pull requests are also issues for shared issue operations such as labels and milestones, but PR-specific data comes from the pull requests API.
  - Creating/updating fork tracker labels and issues requires issue write permissions and is a remote state change.

## File Structure

- Create `docs/adr/0002-track-upstream-pull-requests-as-fork-issues.md`: durable workflow decision created with `adr-tools`.
- Modify `docs/adr/README.md`: ADR table of contents generated with `adr generate toc`.
- Create `docs/recipes/upstream-pr-issue-tracking.md`: operator workflow for dry-run, apply, verify, and manual decision labels.
- Create `scripts/github/upstream-pr-issue-tracker.ts`: pure planner functions, markers, label rules, body generation, and verification logic.
- Create `scripts/github/track-upstream-prs-as-issues.ts`: CLI entrypoint for dry-run, apply, and verify.
- Create `test/upstream-pr-issue-tracker.test.ts`: focused Vitest tests for pure planner behavior.
- Modify `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md`: progress, review ledger, dry-run/apply/verify evidence, final notes.
- Generated reports go under `docs/todos/2026-06-14-track-upstream-prs-as-issues/`.

## Task 1: Confirm Baseline And Boundaries

**Files:**
- Modify: `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md`

- [ ] **Step 1: Confirm git state**

Run:

```bash
git status -sb
git remote -v
git branch -vv
```

Expected:

```text
origin  https://github.com/wbugitlab1/agentmemory.git
upstream  https://github.com/rohitg00/agentmemory.git
```

If tracked source files are modified, stop and inspect them before editing. Do not overwrite the adjacent `docs/todos/2026-06-14-mirror-upstream-issues/` task.

- [ ] **Step 2: Confirm ADR tooling**

Run:

```bash
/Users/A1538552/_projects/_tools/adr-tools/src/adr list
```

Expected: command exits 0 and lists at least `docs/adr/0001-record-architecture-decisions.md`.

- [ ] **Step 3: Confirm GitHub API tooling without reading credentials**

Run:

```bash
gh --version
node --version
```

Expected: `gh` and Node.js are installed. Do not run `gh auth status`, do not print environment variables, and do not inspect token-bearing config.

- [ ] **Step 4: Record baseline evidence**

Update `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md` with command outputs and any caveat from Steps 1-3.

## Task 2: Record ADR For PR Tracking As Issues

**Files:**
- Create: `docs/adr/0002-track-upstream-pull-requests-as-fork-issues.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md`

- [ ] **Step 1: Create the ADR with adr-tools**

Run from the repository root:

```bash
VISUAL=true EDITOR=true /Users/A1538552/_projects/_tools/adr-tools/src/adr new "Track upstream pull requests as fork issues"
```

Expected: `adr-tools` prints `docs/adr/0002-track-upstream-pull-requests-as-fork-issues.md`. If it prints a different path because another ADR was created first, stop, update this plan and the task-state evidence with the actual path, and restart plan review before implementation.

- [ ] **Step 2: Replace ADR body**

Edit the printed ADR file. Preserve its actual number and filename, but use this body structure:

````markdown
# N. Track upstream pull requests as fork issues

Date: 2026-06-14

## Status

Accepted

## Context

The fork can develop independently from `rohitg00/agentmemory`, but upstream pull requests may still contain fixes or features that are relevant to the fork. GitHub pull request metadata cannot be copied losslessly into another repository, and upstream PRs may remain open, close unmerged, or merge upstream before the fork decides what to do.

We need a fork-owned backlog item for each upstream pull request so fork maintainers can triage, import, test, adopt, modify, reject, or mark upstream-merged PRs without depending on upstream maintainers.

## Decision

We will track each upstream pull request from `rohitg00/agentmemory` as a normal issue in `wbugitlab1/agentmemory`.

Each mirror issue will contain a stable marker:

```markdown
<!-- upstream-pr: rohitg00/agentmemory#123 -->
```

The mirror issue body will include upstream PR metadata, source links, head/base commit information, current upstream state, and fork workflow fields. Labels will record upstream state and fork decision state. The tracker will preserve fork-local decision labels and manual notes across syncs.

The tracker will default to dry-run. Creating or updating fork issues and labels requires explicit current-turn confirmation before execution. Sync comments are out of scope for the first implementation.

## Consequences

The fork gains an owned triage queue for upstream PRs and can decide independently which PRs to import or ignore.

The mirror is not a lossless copy of GitHub PR reviews, checks, reactions, projects, assignees, or discussions. Those remain linked to the upstream PR.

The sync tool must be idempotent and marker-based to avoid duplicate issues. It must not auto-close fork tracker issues solely because an upstream PR closed unmerged; fork maintainers make the final decision with fork-local labels.
````

- [ ] **Step 3: Generate ADR table of contents**

Run:

```bash
/Users/A1538552/_projects/_tools/adr-tools/src/adr generate toc > docs/adr/README.md
```

Expected: `docs/adr/README.md` includes the new ADR.

- [ ] **Step 4: Verify ADR list**

Run:

```bash
/Users/A1538552/_projects/_tools/adr-tools/src/adr list
```

Expected: the new ADR appears in the list.

- [ ] **Step 5: Record ADR evidence**

Update the Feature / Verification Matrix row for the ADR as `Done` with the new ADR path and `adr list` evidence.

## Task 3: Document The Operator Workflow

**Files:**
- Create: `docs/recipes/upstream-pr-issue-tracking.md`
- Modify: `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md`

- [ ] **Step 1: Create the recipe**

Create `docs/recipes/upstream-pr-issue-tracking.md` with this content:

````markdown
# Upstream PR Issue Tracking

This fork tracks upstream pull requests from `rohitg00/agentmemory` as normal issues in `wbugitlab1/agentmemory`.

## Marker

Every mirror issue must contain exactly one marker:

```markdown
<!-- upstream-pr: rohitg00/agentmemory#123 -->
```

The marker is the stable sync key. Do not edit it manually.

## Labels

Managed labels:

- `upstream-pr`
- `upstream-open`
- `upstream-closed`
- `upstream-merged`
- `upstream-draft`
- `decision-candidate`
- `decision-imported`
- `decision-adopted`
- `decision-modified`
- `decision-rejected`
- `decision-upstream-merged`

The tracker may update `upstream-*` labels from source state. It must preserve existing `decision-*` labels unless explicitly run with a future decision-management command.

## Dry Run

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --dry-run \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-report.json
```

Dry-run uses public unauthenticated reads where possible and performs no writes.

## Apply

Ask for explicit current-turn confirmation before any apply run. Apply creates or updates labels and issues in the fork. It does not create comments in the first implementation.

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --apply \
  --from-report docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-report.json \
  --confirm-credentialed-reads \
  --confirm-remote-writes \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/apply-report.json
```

## Verify

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --verify \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/verify-report.json
```

Verification must prove that every upstream PR has exactly one fork issue marker.
````

- [ ] **Step 2: Verify Markdown fences**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path("docs/recipes/upstream-pr-issue-tracking.md").read_text()
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

Update the Feature / Verification Matrix row for operator docs as `Done`.

## Task 4: Add Pure PR Issue Tracker Planner

**Files:**
- Create: `scripts/github/upstream-pr-issue-tracker.ts`
- Create: `test/upstream-pr-issue-tracker.test.ts`

- [ ] **Step 1: Write failing planner tests**

Create `test/upstream-pr-issue-tracker.test.ts` with tests covering:

```ts
import { describe, expect, it } from "vitest";
import {
  buildDecisionLabels,
  buildPrMarker,
  buildTrackerIssueBody,
  mergeTrackerIssueBody,
  parseExistingPrMarkers,
  planPrIssueActions,
  planPrVerification,
  sanitizeRenderedGitHubText,
  sanitizeImportedMarkdownWithTelemetry,
  sanitizeImportedMarkdown,
} from "../scripts/github/upstream-pr-issue-tracker";

describe("upstream PR issue tracker", () => {
  it("builds stable upstream PR markers", () => {
    expect(buildPrMarker(123)).toBe("<!-- upstream-pr: rohitg00/agentmemory#123 -->");
  });

  it("parses existing markers and rejects duplicates", () => {
    const parsed = parseExistingPrMarkers([
      { number: 10, title: "[upstream PR #123] Fix", body: "<!-- upstream-pr: rohitg00/agentmemory#123 -->", labels: [] },
      { number: 11, title: "[upstream PR #123] Dup", body: "<!-- upstream-pr: rohitg00/agentmemory#123 -->", labels: [] },
    ]);
    expect(parsed.duplicates).toEqual([{ upstreamNumber: 123, targetNumbers: [10, 11] }]);
  });

  it("keeps manual decision labels", () => {
    expect(buildDecisionLabels(["decision-imported", "custom"], "open", false, false)).toContain("decision-imported");
  });

  it("creates candidate labels for untriaged upstream PRs", () => {
    expect(buildDecisionLabels([], "open", false, false)).toEqual(["upstream-pr", "upstream-open", "decision-candidate"]);
  });

  it("marks upstream merged PRs without overwriting fork decisions", () => {
    const labels = buildDecisionLabels(["decision-adopted"], "closed", true, false);
    expect(labels).toContain("upstream-merged");
    expect(labels).toContain("decision-adopted");
  });

  it("sanitizes imported markdown that could notify or cross-link", () => {
    expect(sanitizeImportedMarkdown("Fixes #12 thanks @team")).not.toContain("Fixes #12");
    expect(sanitizeImportedMarkdown("Fixes #12 thanks @team")).not.toContain("@team");
  });

  it("reports sanitization telemetry for imported upstream PR body text only", () => {
    const result = sanitizeImportedMarkdownWithTelemetry("Fixes #12 thanks @team");
    expect(result.text).not.toContain("Fixes #12");
    expect(result.text).not.toContain("@team");
    expect(result.telemetry).toEqual({
      neutralizedMentions: 1,
      neutralizedReferences: 1,
      neutralizedClosingKeywords: 1,
    });
  });

  it("sanitizes upstream-authored titles and rendered metadata", () => {
    expect(sanitizeRenderedGitHubText("Fixes #12 for @team")).not.toContain("Fixes #12");
    expect(sanitizeRenderedGitHubText("Fixes #12 for @team")).not.toContain("@team");
  });

  it("builds tracker issue bodies with source metadata and workflow fields", () => {
    const body = buildTrackerIssueBody({
      number: 123,
      title: "Fix startup",
      state: "open",
      draft: false,
      merged: false,
      html_url: "https://github.com/rohitg00/agentmemory/pull/123",
      user: { login: "alice" },
      body: "Original body",
      head: { repoFullName: "alice/agentmemory", ref: "fix", sha: "abc" },
      base: { ref: "main", sha: "def" },
      labels: [{ name: "bug" }],
      changedFiles: 2,
      commits: 1,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-02T00:00:00Z",
      closed_at: null,
      merged_at: null,
    });
    expect(body).toContain("<!-- upstream-pr: rohitg00/agentmemory#123 -->");
    expect(body).toContain("Fork decision");
    expect(body).toContain("Head");
  });

  it("preserves fork-local workflow fields and notes when refreshing upstream metadata", () => {
    const existingBody = [
      "<!-- upstream-pr-managed:start -->",
      "old upstream metadata",
      "<!-- upstream-pr-managed:end -->",
      "<!-- fork-pr-workflow:start -->",
      "Local branch: `import/pr-123`",
      "Fork PR: https://github.com/wbugitlab1/agentmemory/pull/77",
      "Decision: adopt with local changes",
      "Verification: `npm test -- test/example.test.ts`",
      "Notes: keep the local API shape",
      "<!-- fork-pr-workflow:end -->",
    ].join("\n");
    const merged = mergeTrackerIssueBody(existingBody, {
      number: 123,
      title: "Fix startup safely",
      state: "open",
      draft: false,
      merged: false,
      html_url: "https://github.com/rohitg00/agentmemory/pull/123",
      user: { login: "alice" },
      body: "Updated upstream body",
      head: { repoFullName: "alice/agentmemory", ref: "fix", sha: "abc2" },
      base: { ref: "main", sha: "def2" },
      labels: [],
      changedFiles: 3,
      commits: 2,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      closed_at: null,
      merged_at: null,
    });
    expect(merged).toContain("Updated upstream body");
    expect(merged).toContain("Local branch: `import/pr-123`");
    expect(merged).toContain("Notes: keep the local API shape");
  });

  it("rejects malformed workflow delimiters without planning update writes", () => {
    const plan = planPrIssueActions({
      sourcePulls: [
        {
          number: 123,
          title: "Fix startup safely",
          state: "open",
          draft: false,
          merged: false,
          html_url: "https://github.com/rohitg00/agentmemory/pull/123",
          user: { login: "alice" },
          body: "Updated upstream body",
          head: { repoFullName: "alice/agentmemory", ref: "fix", sha: "abc2" },
          base: { ref: "main", sha: "def2" },
          labels: [],
          changedFiles: 3,
          commits: 2,
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-03T00:00:00Z",
          closed_at: null,
          merged_at: null,
        },
      ],
      targetIssues: [
        {
          number: 10,
          title: "[upstream PR #123] Fix startup",
          body: [
            "<!-- upstream-pr: rohitg00/agentmemory#123 -->",
            "<!-- upstream-pr-managed:start -->",
            "old upstream metadata",
            "<!-- fork-pr-workflow:start -->",
            "Notes: keep this",
            "<!-- fork-pr-workflow:end -->",
          ].join("\n"),
          labels: ["upstream-pr", "decision-candidate"],
        },
      ],
      targetLabels: [],
    });
    expect(plan.actions.map((action) => action.type)).not.toContain("update-issue");
    expect(plan.failures).toContainEqual({
      type: "malformed-section",
      targetNumber: 10,
      reason: "managed section delimiter mismatch",
    });
  });

  it("rejects existing tracker issues missing the workflow section", () => {
    const plan = planPrIssueActions({
      sourcePulls: [
        {
          number: 123,
          title: "Fix startup safely",
          state: "open",
          draft: false,
          merged: false,
          html_url: "https://github.com/rohitg00/agentmemory/pull/123",
          user: { login: "alice" },
          body: "Updated upstream body",
          head: { repoFullName: "alice/agentmemory", ref: "fix", sha: "abc2" },
          base: { ref: "main", sha: "def2" },
          labels: [],
          changedFiles: 3,
          commits: 2,
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-03T00:00:00Z",
          closed_at: null,
          merged_at: null,
        },
      ],
      targetIssues: [
        {
          number: 10,
          title: "[upstream PR #123] Fix startup",
          body: [
            "<!-- upstream-pr: rohitg00/agentmemory#123 -->",
            "<!-- upstream-pr-managed:start -->",
            "old upstream metadata",
            "<!-- upstream-pr-managed:end -->",
            "Notes outside managed sections must not be overwritten",
          ].join("\n"),
          labels: ["upstream-pr", "decision-candidate"],
        },
      ],
      targetLabels: [],
    });
    expect(plan.actions.map((action) => action.type)).not.toContain("update-issue");
    expect(plan.failures).toContainEqual({
      type: "malformed-section",
      targetNumber: 10,
      reason: "workflow section missing",
    });
  });

  it("plans create, update, and skip actions without duplicates", () => {
    const plan = planPrIssueActions({
      sourcePulls: [
        {
          number: 123,
          title: "Fix startup",
          state: "open",
          draft: false,
          merged: false,
          html_url: "https://github.com/rohitg00/agentmemory/pull/123",
          user: { login: "alice" },
          body: null,
          head: { repoFullName: "alice/agentmemory", ref: "fix", sha: "abc" },
          base: { ref: "main", sha: "def" },
          labels: [],
          changedFiles: 2,
          commits: 1,
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-02T00:00:00Z",
          closed_at: null,
          merged_at: null,
        },
      ],
      targetIssues: [],
      targetLabels: [],
    });
    expect(plan.actions.map((action) => action.type)).toContain("create-issue");
  });

  it("verification fails when a PR is missing or duplicated", () => {
    const result = planPrVerification({
      upstreamNumbers: [123],
      markerMap: new Map(),
      duplicates: [],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual({ type: "missing", upstreamNumber: 123 });
  });

  it("excludes native pull requests returned by the target issues endpoint", () => {
    const plan = planPrIssueActions({
      sourcePulls: [
        {
          number: 123,
          title: "Fix startup",
          state: "open",
          draft: false,
          merged: false,
          html_url: "https://github.com/rohitg00/agentmemory/pull/123",
          user: { login: "alice" },
          body: null,
          head: { repoFullName: "alice/agentmemory", ref: "fix", sha: "abc" },
          base: { ref: "main", sha: "def" },
          labels: [],
          changedFiles: 2,
          commits: 1,
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-02T00:00:00Z",
          closed_at: null,
          merged_at: null,
        },
      ],
      targetIssues: [
        {
          number: 50,
          title: "Native fork PR",
          body: "<!-- upstream-pr: rohitg00/agentmemory#123 -->",
          labels: [],
          pull_request: {},
        },
      ],
      targetLabels: [],
    });
    expect(plan.report.targetPullRequestItemsExcluded).toBe(1);
    expect(plan.actions.map((action) => action.type)).toContain("create-issue");
  });
});
```

Run:

```bash
npm test -- test/upstream-pr-issue-tracker.test.ts
```

Expected: fails because the planner module does not exist yet.

- [ ] **Step 2: Implement planner exports**

Create `scripts/github/upstream-pr-issue-tracker.ts` with these exports and behavior:

```ts
export const SOURCE_REPO = "rohitg00/agentmemory";
export const TARGET_REPO = "wbugitlab1/agentmemory";
export const PR_MARKER_PREFIX = "<!-- upstream-pr:";
export const MANAGED_SECTION_START = "<!-- upstream-pr-managed:start -->";
export const MANAGED_SECTION_END = "<!-- upstream-pr-managed:end -->";
export const WORKFLOW_SECTION_START = "<!-- fork-pr-workflow:start -->";
export const WORKFLOW_SECTION_END = "<!-- fork-pr-workflow:end -->";

export type SanitizationTelemetry = {
  neutralizedMentions: number;
  neutralizedReferences: number;
  neutralizedClosingKeywords: number;
};

export type SourcePull = {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  html_url: string;
  user: { login: string } | null;
  body: string | null;
  head: { repoFullName: string | null; ref: string; sha: string };
  base: { ref: string; sha: string };
  labels: Array<{ name: string; color?: string; description?: string | null }>;
  changedFiles: number;
  commits: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
};

export type TargetIssue = {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  state?: "open" | "closed";
  pull_request?: unknown;
};

export type PlannedPrAction =
  | { type: "create-label"; label: { name: string; color: string; description: string } }
  | { type: "create-issue"; upstreamNumber: number; title: string; body: string; labels: string[] }
  | { type: "update-issue"; upstreamNumber: number; targetNumber: number; title: string; body: string; labels: string[] }
  | { type: "skip-issue"; upstreamNumber: number; targetNumber: number; reason: string }
  | { type: "duplicate-marker"; upstreamNumber: number; targetNumbers: number[] }
  | { type: "invalid-marker"; targetNumber: number; reason: string };
```

Implementation requirements:
- `buildPrMarker(number)` returns exactly `<!-- upstream-pr: rohitg00/agentmemory#N -->`.
- `parseExistingPrMarkers(targetIssues)` extracts one marker per target issue, rejects malformed markers, and records duplicate upstream numbers.
- `sanitizeImportedMarkdown(text)` prevents GitHub notifications and accidental issue-closing/cross-reference effects by neutralizing `@mentions`, `#123` references, and leading closing keywords while preserving readable text.
- `sanitizeImportedMarkdownWithTelemetry(text)` returns `{ text, telemetry }` using the same sanitization as `sanitizeImportedMarkdown`, with aggregate counts for neutralized mentions, same-repository issue/PR references, and closing keywords.
- Sanitization telemetry must count only imported upstream PR body text. Do not count generated tracker metadata, markers, source URLs, labels, head/base refs, workflow fields, or fork decision fields as imported Markdown.
- `sanitizeRenderedGitHubText(text)` neutralizes notification and cross-reference patterns in every upstream-authored string rendered into the target issue title or body, including PR title, author login, labels, head repo/ref, and base ref. This helper does not increment PR-body sanitization telemetry.
- `buildDecisionLabels(existingLabels, upstreamState, merged, draft)` always includes `upstream-pr`; sets exactly one upstream state label for open/closed/merged; adds `upstream-draft` when draft; preserves existing `decision-*`; adds `decision-candidate` only when no decision label exists.
- `buildTrackerIssueBody(sourcePull)` creates a new issue body with one managed upstream metadata section between `MANAGED_SECTION_START` and `MANAGED_SECTION_END`, and one fork workflow section between `WORKFLOW_SECTION_START` and `WORKFLOW_SECTION_END`. The managed section includes marker, source URL, sanitized author/title/metadata, state, draft, merged, head repo/ref/SHA, base ref/SHA, labels, changed file count, commit count, timestamps, and sanitized original PR body. The workflow section starts with blank local branch, fork PR, decision, verification, and notes fields.
- `mergeTrackerIssueBody(existingBody, sourcePull)` refreshes only the managed upstream metadata section while preserving the existing fork workflow section exactly. Existing tracker issues missing any required managed or workflow section delimiter must produce a structured `malformed-section` failure and no update action, because unsectioned manual notes cannot be safely distinguished from generated content. Blank workflow fields are created only for brand-new tracker issue bodies through `buildTrackerIssueBody`. If the existing body has malformed managed/workflow delimiters, `planPrIssueActions` must record an invalid-marker-style failure and plan no write for that issue until a maintainer fixes the body.
- `planPrIssueActions(input)` filters target `/issues` endpoint items that contain `pull_request`, creates missing managed labels, creates missing target issues, updates existing mirror issue title/body/labels using `mergeTrackerIssueBody`, skips unchanged mirror issues, and never plans writes when duplicate, invalid, or malformed section markers exist.
- `planPrVerification(input)` returns structured failures for missing, duplicate, invalid, title mismatch, marker mismatch, and missing managed labels.

- [ ] **Step 3: Run planner tests**

Run:

```bash
npm test -- test/upstream-pr-issue-tracker.test.ts
```

Expected: all tests pass.

## Task 5: Add Dry-Run/Apply/Verify CLI

**Files:**
- Create: `scripts/github/track-upstream-prs-as-issues.ts`
- Modify: `test/upstream-pr-issue-tracker.test.ts` only for additional pure regressions found while wiring the CLI

- [ ] **Step 1: Implement CLI argument contract**

The CLI must support:

```text
--source rohitg00/agentmemory
--target wbugitlab1/agentmemory
--state all
--dry-run
--apply
--verify
--from-report <path>
--report <path>
--public-read
--read-with-gh
--confirm-credentialed-reads
--confirm-remote-writes
```

Rules:
- Default mode is `--dry-run`.
- `--state` supports `open`, `closed`, and `all`; default is `all`.
- Public dry-run reads use unauthenticated `fetch` by default.
- `--read-with-gh` requires `--confirm-credentialed-reads`.
- `--apply` requires `--confirm-credentialed-reads` and `--confirm-remote-writes`.
- `--apply` requires `--from-report <dry-run-report>`.
- Before the first write, apply mode must recompute the current plan from credentialed reads of upstream PRs, target issues, and target labels, then fail if the current stable action IDs, source PR count, target normal issue count, target label count, or plan hash differ from the reviewed dry-run report.
- `--verify` is read-only and exits nonzero when verification fails.
- The CLI must not print environment variables, tokens, or `gh auth` output.

- [ ] **Step 2: Split CLI orchestration from adapters**

Export a pure orchestration function:

```ts
export type PrTrackerMode = "dry-run" | "apply" | "verify";

export type PrTrackerReader = {
  listPulls(input: { repo: string; state: "open" | "closed" | "all" }): Promise<SourcePull[]>;
  listTargetIssues(input: { repo: string }): Promise<TargetIssue[]>;
  listLabels(input: { repo: string }): Promise<Array<{ name: string; color?: string; description?: string | null }>>;
};

export type PrTrackerWriter = {
  createLabel(action: Extract<PlannedPrAction, { type: "create-label" }>): Promise<{ url: string | null }>;
  createIssue(action: Extract<PlannedPrAction, { type: "create-issue" }>): Promise<{ number: number; url: string }>;
  updateIssue(action: Extract<PlannedPrAction, { type: "update-issue" }>): Promise<{ number: number; url: string }>;
};

export async function runPrTracker(options: {
  mode: PrTrackerMode;
  source: string;
  target: string;
  state: "open" | "closed" | "all";
  fromReport?: string;
  report: string;
  confirmCredentialedReads: boolean;
  confirmRemoteWrites: boolean;
  reader: PrTrackerReader;
  writer?: PrTrackerWriter;
  checkpointReport?: (report: TrackerReport) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<TrackerReport>;
```

The CLI entrypoint should only parse arguments, construct the appropriate adapters, call `runPrTracker`, write the report, and set exit codes. Tests must exercise `runPrTracker` with fake readers, fake writers, a fake `checkpointReport`, and an injected `sleep` function instead of the network or real timers.

- [ ] **Step 3: Implement GitHub read adapters**

Implement:
- `PublicGitHubReader`: paginated public `fetch` reads from:
  - `GET /repos/{owner}/{repo}/pulls?state=all&per_page=100`
  - `GET /repos/{owner}/{repo}/issues?state=all&per_page=100`
  - `GET /repos/{owner}/{repo}/labels?per_page=100`
- `GhGitHubClient`: `execFile("gh", ["api", ...])` for confirmed credentialed reads and writes.

Reader requirements:
- `PublicGitHubReader` must send `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and a fixed non-secret `User-Agent` on every public request.
- `PublicGitHubReader` must not send an `Authorization` header and must not derive headers from environment variables or token-bearing config.
- `PublicGitHubReader` must follow GitHub `Link` pagination until no `rel=\"next\"` link remains.
- `GhGitHubClient` must use `gh api --paginate --slurp` for list endpoints and flatten the returned pages.
- All readers must fail closed on non-2xx responses.
- Rate-limit and secondary-rate-limit responses must be recorded in the report with safe metadata: status code, endpoint, retry-after when present, and reset time when present.
- No write may run after an incomplete read, partial page read, parse error, or rate-limit failure.
- If public dry-run hits rate limits, stop and recommend a later explicit credentialed read using `--read-with-gh --confirm-credentialed-reads`.

The pull reader must enrich PR list data with `merged`, `merged_at`, `changed_files`, and `commits`. If list responses do not include all fields reliably, fetch each PR detail with `GET /repos/{owner}/{repo}/pulls/{pull_number}` during dry-run and apply.

- [ ] **Step 4: Implement GitHub write adapter**

For `--apply`, call `gh api` only after both confirmation flags are present.

Required writes:

```text
POST  /repos/{targetOwner}/{targetRepo}/labels
POST  /repos/{targetOwner}/{targetRepo}/issues
PATCH /repos/{targetOwner}/{targetRepo}/issues/{issue_number}
```

Comment writes are out of scope for the first implementation. Do not call `POST /issues/{issue_number}/comments`.

All issue create/update requests that include generated multiline or user-supplied body text must build a temporary JSON payload file and call `gh api --input <payload-file>`. Do not pass body text through argv with `--field body=...`, `-f body=...`, or equivalent.

Before executing `gh api --input <payload-file>`, parse the temporary JSON payload file locally and inspect the generated payload after sanitization. The pre-write check must verify that `title` is a nonempty string, `labels` is an array of strings, `body` is a string, the body contains exactly one expected upstream PR marker for the action, and final rendered title/body output did not retain unsafe raw `@mention`, raw same-repository `#123` reference, or leading issue-closing keyword patterns from upstream-authored strings. Log only a safe summary of the payload path, endpoint, title, label count, marker, body character count, and validation result; do not print the full body. Remove the temporary payload file after the command returns.

Do not copy upstream PR review comments, issue comments, checks, or reactions into target issues.

Apply write requirements:
- Write only managed PR-tracker labels and tracker issues; do not close target issues from upstream PR state.
- Execute remote writes sequentially and wait at least one second between successful remote write actions.
- Write a checkpoint report after each successful remote write action or successful write batch, and before stopping on any runtime stop condition.
- Stop without retrying when GitHub returns `403`, `429`, `422`, a `Retry-After` header, secondary-rate-limit text, spam-prevention text, validation text, or abuse-detection text. Record whether the stop is retryable rate limiting, spam/abuse prevention, authentication, permission, validation, or unknown based on safe response metadata. Do not classify every `403` as retryable.
- After a stop condition, run no further writes. Recovery is an idempotent rerun from a freshly reviewed dry-run report or from a still-matching reviewed report after the recommended wait period.

- [ ] **Step 5: Implement reports**

Reports must be JSON and include:

```json
{
  "source": "rohitg00/agentmemory",
  "target": "wbugitlab1/agentmemory",
  "mode": "dry-run",
  "state": "all",
  "sourcePulls": 0,
  "targetIssues": 0,
  "targetIssueEndpointItems": 0,
  "targetPullRequestItemsExcluded": 0,
  "targetNormalIssues": 0,
  "plannedActions": [],
  "planHash": "sha256:...",
  "appliedActions": [],
  "skippedActions": [],
  "failedAction": null,
  "stopCondition": null,
  "sanitization": {
    "neutralizedMentions": 0,
    "neutralizedReferences": 0,
    "neutralizedClosingKeywords": 0
  },
  "failures": [],
  "wroteRemote": false,
  "generatedAt": "2026-06-14T00:00:00.000Z"
}
```

Use a real ISO timestamp at runtime. Every planned action must have a stable action ID derived from action type and upstream PR number, plus target issue number when present. Dry-run reports must set `wroteRemote` to `false`; apply reports must set it to `true` only after the first successful write. Apply mode writes sequentially and stops on the first write failure, recording completed `appliedActions`, `skippedActions`, the `failedAction` with target issue numbers/URLs and safe error summaries, and `stopCondition` with safe metadata: classification, status code, endpoint, retry-after when present, reset time when present, and a redacted message. Sanitization counts are aggregate counts from imported upstream PR body text only.

- [ ] **Step 6: Add CLI smoke tests without network**

Add pure tests around CLI argument parsing by exporting a parser function from `scripts/github/track-upstream-prs-as-issues.ts`. Test:
- default dry-run mode
- apply rejected without confirmation flags
- apply rejected without `--from-report`
- apply rejected when recomputed action IDs or plan hash differ from the reviewed dry-run report
- `--read-with-gh` rejected without `--confirm-credentialed-reads`
- invalid state rejected
- report path required for apply and verify
- public reader follows two pages for PRs, target issues, and labels
- public reader sends `Accept`, `X-GitHub-Api-Version`, and fixed non-secret `User-Agent` headers, and omits `Authorization`
- unsafe upstream-authored PR titles and metadata are sanitized before being written into target issue titles or bodies
- target `/issues` endpoint items with `pull_request` are excluded from tracker issue matching
- dry-run uses fake public reader and zero writer calls
- verify uses fake reader and zero writer calls
- apply uses fake writer only after both confirmation flags and matching `--from-report`
- failed mid-apply writes completed actions and failed action into the report
- update planning preserves an existing fork workflow section exactly while refreshing upstream metadata
- malformed, missing, duplicated, or out-of-order managed/workflow section delimiters produce structured report failures, no `update-issue` plan for the affected target issue, and no apply writer call
- apply calls injected `sleep` between successful remote write actions
- apply writes checkpoint reports after successful writes and before stop conditions
- `403`, `429`, `422`, `Retry-After`, secondary-rate-limit, validation, spam-prevention, and abuse-detection responses stop apply without later writes
- dry-run and apply reports include aggregate sanitization telemetry for imported upstream PR body text only
- write adapter command construction never passes issue body text through argv
- write adapter parses and validates the temporary payload file before `gh api --input`, including marker count and sanitized imported-body checks

Run:

```bash
npm test -- test/upstream-pr-issue-tracker.test.ts
```

Expected: all tests pass.

## Task 6: Dry-Run And Review Planned Writes

**Files:**
- Create: `docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-report.json`
- Modify: `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md`

- [ ] **Step 1: Run dry-run inventory**

Run:

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --dry-run \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-report.json
```

Expected: command exits 0, performs no writes, and reports source PR count, target existing mirror count, missing label count, create/update/skip actions, duplicate marker failures, and invalid marker failures.

- [ ] **Step 2: Inspect dry-run report**

Run:

```bash
jq '{source, target, mode, state, sourcePulls, targetIssueEndpointItems, targetPullRequestItemsExcluded, targetNormalIssues, wroteRemote, planHash, sanitization, failureCount: (.failures | length), actionCount: (.plannedActions | length)}' docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-report.json
```

Expected: `mode` is `dry-run`, `wroteRemote` is `false`, `planHash` is present, `sanitization` is present, and `failureCount` is `0`. If `failureCount` is nonzero, stop and fix or re-plan.

- [ ] **Step 3: Record dry-run evidence**

Update the task-state Feature / Verification Matrix with counts from the report.

## Task 7: Apply Only After Explicit Confirmation

**Files:**
- Create: `docs/todos/2026-06-14-track-upstream-prs-as-issues/apply-report.json`
- Modify: fork GitHub issues and labels only after confirmation
- Modify: `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md`

- [ ] **Step 1: Stop for explicit credentialed-read and remote-write confirmation**

Ask the user this exact question:

```text
May I use GitHub credentials through gh api to read upstream PRs, target issues, and target labels, then create/update PR-tracker labels and issues in wbugitlab1/agentmemory from the reviewed dry-run report? This may trigger GitHub issue notifications. No comments will be created.
```

Expected: continue only if the user explicitly confirms in the current turn.

- [ ] **Step 2: Apply**

Run only after confirmation:

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --apply \
  --from-report docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-report.json \
  --confirm-credentialed-reads \
  --confirm-remote-writes \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/apply-report.json
```

Expected: command exits 0 only if the current plan matches the reviewed dry-run report before the first write. Apply waits at least one second between successful remote write actions and writes checkpoint reports after successful writes. If GitHub returns authentication, permission, rate-limit, spam-prevention, abuse-detection, validation, secondary-rate-limit errors, `403`, `422`, `429`, or `Retry-After`, stop, write a checkpoint report, record the exact safe error summary and stop classification, and do not run further writes or retry blindly.

- [ ] **Step 3: Inspect apply report**

Run:

```bash
jq '{mode, wroteRemote, sourcePulls, targetIssues, targetNormalIssues, planHash, sanitization, failureCount: (.failures | length), actionCount: (.plannedActions | length), appliedCount: (.appliedActions | length), failedAction, stopCondition}' docs/todos/2026-06-14-track-upstream-prs-as-issues/apply-report.json
```

Expected: `mode` is `apply`, `failureCount` is `0`, `failedAction` is `null`, `stopCondition` is `null`, `sanitization` is present, and `wroteRemote` reflects whether writes occurred.

## Task 8: Verify Mirror Completeness

**Files:**
- Create: `docs/todos/2026-06-14-track-upstream-prs-as-issues/verify-report.json`
- Modify: `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md`

- [ ] **Step 1: Run verify mode**

Run:

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --verify \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/verify-report.json
```

Expected: command exits 0 only when every upstream PR has exactly one target issue marker and no duplicate or malformed markers exist.

- [ ] **Step 2: Inspect verify report**

Run:

```bash
jq '{mode, sourcePulls, targetIssues, failureCount: (.failures | length), failures}' docs/todos/2026-06-14-track-upstream-prs-as-issues/verify-report.json
```

Expected: `failureCount` is `0`.

- [ ] **Step 3: Record final verification**

Update `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md` with:

```markdown
## Final Review Notes

- ADR verification:
- Planner tests:
- Dry-run report:
- Apply status:
- Verify report:
- Remote-write confirmation:
- Sanitization telemetry:
- Residual risks:
```

## Task 9: Security And Commit Gates

**Files:**
- Modify: `docs/todos/2026-06-14-track-upstream-prs-as-issues/todo.md`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- test/upstream-pr-issue-tracker.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run full test suite if source files changed**

Run:

```bash
npm test
```

Expected: all tests pass. If runtime cost is too high or unrelated failures occur, record the exact limitation and targeted evidence.

- [ ] **Step 3: Run Semgrep for GitHub API/write tooling**

Run:

```bash
semgrep scan --config p/default --error --metrics=off scripts/github/upstream-pr-issue-tracker.ts scripts/github/track-upstream-prs-as-issues.ts test/upstream-pr-issue-tracker.test.ts
```

Expected: no findings.

- [ ] **Step 4: Check formatting and stale references**

Run:

```bash
git diff --check
rg -n "upstream-pr|track-upstream-prs|decision-candidate|confirm-remote-writes" docs/adr docs/recipes docs/todos/2026-06-14-track-upstream-prs-as-issues scripts/github test/upstream-pr-issue-tracker.test.ts
```

Expected: diff check passes and references are consistent.

- [ ] **Step 5: Run staged secret scan before any commit**

If a commit is requested, stage only task-owned files, then run:

```bash
gitleaks protect --staged --redact
```

Expected: no leaks found.

## Self-Review

- Spec coverage: this plan covers ADR, operator docs, pure planner, CLI dry-run/apply/verify, GitHub write gates, verification reports, and security checks.
- Placeholder scan: no unresolved placeholder text is intentionally left in executable steps.
- Type consistency: planned test imports match exported planner function names; CLI flags match recipe commands and apply/verify tasks.
- Approval gates: GitHub credentialed reads and target writes are behind explicit confirmation and flags; no branch push, PR creation, issue write, or label write happens during planning.
