import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  MANAGED_LABELS,
  buildDecisionLabels,
  buildPrMarker,
  buildTrackerIssueBody,
  buildTrackerIssueTitle,
  mergeTrackerIssueBody,
  parseExistingPrMarkers,
  planPrIssueActions,
  planPrVerification,
  sanitizeImportedMarkdown,
  sanitizeImportedMarkdownWithTelemetry,
  sanitizeRenderedGitHubText,
  type SourcePull,
  type TargetIssue,
} from "../scripts/github/upstream-pr-issue-tracker.js";
import {
  PrTrackerStopError,
  buildGhIssuePayloadRequest,
  createPublicGitHubReader,
  parseCliArgs,
  runPrTracker,
  type PrTrackerReader,
  type PrTrackerWriter,
  type TrackerReport,
} from "../scripts/github/track-upstream-prs-as-issues.js";

const SOURCE_REPO = "rohitg00/agentmemory";
const TARGET_REPO = "wbugitlab1/agentmemory";

function pull(overrides: Partial<SourcePull> = {}): SourcePull {
  return {
    number: 123,
    title: "Fix startup",
    state: "open",
    draft: false,
    merged: false,
    html_url: `https://github.com/${SOURCE_REPO}/pull/123`,
    user: { login: "alice" },
    body: "Original body",
    head: { repoFullName: "alice/agentmemory", ref: "fix", sha: "abc" },
    base: { ref: "main", sha: "def" },
    labels: [{ name: "bug", color: "d73a4a", description: "Bug" }],
    changedFiles: 2,
    commits: 1,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-02T00:00:00Z",
    closed_at: null,
    merged_at: null,
    ...overrides,
  };
}

function targetIssue(overrides: Partial<TargetIssue> = {}): TargetIssue {
  return {
    number: 10,
    title: buildTrackerIssueTitle(pull()),
    body: buildTrackerIssueBody(pull()),
    labels: ["upstream-pr", "upstream-open", "decision-candidate"],
    state: "open",
    ...overrides,
  };
}

function fakeReader(input: {
  pulls?: SourcePull[];
  issues?: TargetIssue[];
  labels?: Array<{ name: string; color?: string; description?: string | null }>;
} = {}): PrTrackerReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listPulls(request) {
      calls.push(`listPulls:${request.repo}:${request.state}`);
      return input.pulls ?? [];
    },
    async listTargetIssues(request) {
      calls.push(`listTargetIssues:${request.repo}`);
      return input.issues ?? [];
    },
    async listLabels(request) {
      calls.push(`listLabels:${request.repo}`);
      return input.labels ?? [];
    },
  };
}

function fakeWriter(): PrTrackerWriter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async createLabel(action) {
      calls.push(`createLabel:${action.label.name}`);
      return { url: null };
    },
    async createIssue(action) {
      calls.push(`createIssue:${action.upstreamNumber}`);
      return { number: 900 + action.upstreamNumber, url: `https://github.com/${TARGET_REPO}/issues/${900 + action.upstreamNumber}` };
    },
    async updateIssue(action) {
      calls.push(`updateIssue:${action.targetNumber}`);
      return { number: action.targetNumber, url: `https://github.com/${TARGET_REPO}/issues/${action.targetNumber}` };
    },
  };
}

async function withTempReport<T>(body: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pr-tracker-test-"));
  try {
    return await body(join(dir, "report.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("upstream PR issue tracker planner", () => {
  it("builds stable upstream PR markers", () => {
    expect(buildPrMarker(123)).toBe("<!-- upstream-pr-neutral: source=rohitg00/agentmemory number=123 -->");
  });

  it("parses existing markers and rejects duplicates", () => {
    const parsed = parseExistingPrMarkers([
      { number: 10, title: "[upstream PR #123] Fix", body: "<!-- upstream-pr: rohitg00/agentmemory#123 -->", labels: [] },
      { number: 11, title: "[upstream PR #123] Dup", body: "<!-- upstream-pr-neutral: source=rohitg00/agentmemory number=123 -->", labels: [] },
    ]);
    expect(parsed.duplicates).toEqual([{ upstreamNumber: 123, targetNumbers: [10, 11] }]);
  });

  it("keeps manual decision labels", () => {
    const labels = buildDecisionLabels(["decision-imported", "custom"], "open", false, false);
    expect(labels).toContain("decision-imported");
    expect(labels).toContain("custom");
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
    const body = buildTrackerIssueBody(pull());
    expect(body).toContain("<!-- upstream-pr-neutral: source=rohitg00/agentmemory number=123 -->");
    expect(body).toContain("Source repository: rohitg00/agentmemory");
    expect(body).toContain("Source pull request number: 123");
    expect(body).toContain("Source URL: intentionally omitted to avoid GitHub cross-references");
    expect(body).not.toContain("https://github.com/rohitg00/agentmemory/pull/123");
    expect(body).not.toContain("rohitg00/agentmemory#123");
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
    const merged = mergeTrackerIssueBody(existingBody, pull({ title: "Fix startup safely", body: "Updated upstream body" }));
    expect(merged).toContain("Updated upstream body");
    expect(merged).toContain("Local branch: `import/pr-123`");
    expect(merged).toContain("Notes: keep the local API shape");
  });

  it("rejects malformed workflow delimiters without planning update writes", () => {
    const plan = planPrIssueActions({
      sourcePulls: [pull({ title: "Fix startup safely", body: "Updated upstream body" })],
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
      sourcePulls: [pull({ title: "Fix startup safely", body: "Updated upstream body" })],
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
    const createPlan = planPrIssueActions({ sourcePulls: [pull()], targetIssues: [], targetLabels: [] });
    expect(createPlan.actions.map((action) => action.type)).toContain("create-issue");

    const skipPlan = planPrIssueActions({ sourcePulls: [pull()], targetIssues: [targetIssue()], targetLabels: [] });
    expect(skipPlan.actions.map((action) => action.type)).toContain("skip-issue");

    const updatePlan = planPrIssueActions({ sourcePulls: [pull({ title: "Fix startup safely" })], targetIssues: [targetIssue()], targetLabels: [] });
    expect(updatePlan.actions.map((action) => action.type)).toContain("update-issue");
  });

  it("verification fails when a PR is missing or duplicated", () => {
    const result = planPrVerification({
      upstreamNumbers: [123],
      markerMap: new Map(),
      duplicates: [],
      invalidMarkers: [],
      targetLabels: [],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual({ type: "missing", upstreamNumber: 123 });
  });

  it("excludes native pull requests returned by the target issues endpoint", () => {
    const plan = planPrIssueActions({
      sourcePulls: [pull()],
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

describe("upstream PR issue tracker CLI", () => {
  it("parses dry-run defaults and rejects unsafe mode combinations", () => {
    expect(parseCliArgs([])).toMatchObject({ mode: "dry-run", source: SOURCE_REPO, target: TARGET_REPO, state: "all", readMode: "public-read" });
    expect(parseCliArgs(["--write-delay-ms", "5000"])).toMatchObject({ writeDelayMs: 5000 });
    expect(parseCliArgs(["--create-missing-only"])).toMatchObject({ createMissingOnly: true });
    expect(() => parseCliArgs(["--state", "bad"])).toThrow("Invalid --state");
    expect(() => parseCliArgs(["--read-with-gh"])).toThrow("--read-with-gh requires --confirm-credentialed-reads");
    expect(() => parseCliArgs(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes", "--report", "x.json"])).toThrow(
      "--apply requires --from-report",
    );
    expect(() => parseCliArgs(["--verify"])).toThrow("--verify requires --report");
  });

  it("public reader follows pagination and sends safe headers", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const pages = new Map<string, { body: unknown[]; link?: string }>();
    pages.set("https://api.github.com/repos/rohitg00/agentmemory/pulls?state=all&per_page=100", {
      body: [
        {
          number: 1,
          title: "PR",
          state: "open",
          draft: false,
          merged_at: null,
          html_url: "https://github.com/rohitg00/agentmemory/pull/1",
          user: { login: "alice" },
          body: null,
          head: { repo: { full_name: "alice/agentmemory" }, ref: "fix", sha: "abc" },
          base: { ref: "main", sha: "def" },
          labels: [],
          changed_files: 0,
          commits: 0,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          closed_at: null,
        },
      ],
      link: '<https://api.github.com/page2>; rel="next"',
    });
    pages.set("https://api.github.com/page2", { body: [] });

    const reader = createPublicGitHubReader(async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, headers });
      const page = pages.get(url);
      if (!page) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(page.body), {
        status: 200,
        headers: page.link ? { Link: page.link } : undefined,
      });
    });

    const pulls = await reader.listPulls({ repo: SOURCE_REPO, state: "all" });

    expect(pulls).toHaveLength(1);
    expect(calls.map((call) => call.url)).toEqual(["https://api.github.com/repos/rohitg00/agentmemory/pulls?state=all&per_page=100", "https://api.github.com/page2"]);
    expect(calls[0].headers.get("Accept")).toBe("application/vnd.github+json");
    expect(calls[0].headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
    expect(calls[0].headers.get("User-Agent")).toBe("agentmemory-upstream-pr-tracker");
    expect(calls[0].headers.has("Authorization")).toBe(false);
  });

  it("dry-run and verify use readers without writers", async () => {
    await withTempReport(async (path) => {
      const reader = fakeReader({ pulls: [pull()], issues: [], labels: [] });
      const writer = fakeWriter();
      const report = await runPrTracker({
        mode: "dry-run",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        report: path,
        confirmCredentialedReads: false,
        confirmRemoteWrites: false,
        reader,
        writer,
      });

      expect(report.mode).toBe("dry-run");
      expect(report.wroteRemote).toBe(false);
      expect(writer.calls).toEqual([]);
      expect(report.plannedActions.some((action) => action.type === "create-issue")).toBe(true);
    });
  });

  it("apply refuses drift from the reviewed dry-run report", async () => {
    await withTempReport(async (path) => {
      const reader = fakeReader({ pulls: [pull()], issues: [], labels: [] });
      const dryRun = await runPrTracker({
        mode: "dry-run",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        report: path,
        confirmCredentialedReads: false,
        confirmRemoteWrites: false,
        reader,
      });
      const driftReader = fakeReader({ pulls: [pull({ title: "Fix startup safely" })], issues: [], labels: [] });
      const writer = fakeWriter();
      const applyReport = await runPrTracker({
        mode: "apply",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        fromReport: path,
        report: path,
        confirmCredentialedReads: true,
        confirmRemoteWrites: true,
        reader: driftReader,
        writer,
      });

      expect(dryRun.planHash).not.toBe(applyReport.planHash);
      expect(applyReport.failures).toContainEqual({ type: "plan-drift", reason: "plan hash differs from reviewed dry-run report" });
      expect(writer.calls).toEqual([]);
    });
  });

  it("apply writes sequentially, checkpoints, and sleeps after successful writes", async () => {
    await withTempReport(async (path) => {
      const existingBody = buildTrackerIssueBody(pull());
      const reader = fakeReader({
        pulls: [pull({ title: "Fix startup safely" })],
        issues: [targetIssue({ body: existingBody })],
        labels: [
          { name: "upstream-pr" },
          { name: "upstream-open" },
          { name: "upstream-closed" },
          { name: "upstream-merged" },
          { name: "upstream-draft" },
          { name: "decision-candidate" },
          { name: "decision-imported" },
          { name: "decision-adopted" },
          { name: "decision-modified" },
          { name: "decision-rejected" },
          { name: "decision-upstream-merged" },
        ],
      });
      await runPrTracker({
        mode: "dry-run",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        report: path,
        confirmCredentialedReads: false,
        confirmRemoteWrites: false,
        reader,
      });

      const writer = fakeWriter();
      const checkpoints: TrackerReport[] = [];
      const sleeps: number[] = [];
      const applyReport = await runPrTracker({
        mode: "apply",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        fromReport: path,
        report: path,
        confirmCredentialedReads: true,
        confirmRemoteWrites: true,
        reader,
        writer,
        checkpointReport: async (report) => {
          checkpoints.push(structuredClone(report));
        },
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
        writeDelayMs: 5000,
      });

      expect(writer.calls).toEqual(["updateIssue:10"]);
      expect(checkpoints.length).toBeGreaterThanOrEqual(1);
      expect(sleeps).toEqual([5000]);
      expect(applyReport.failedAction).toBeNull();
    });
  });

  it("create-missing-only applies creates without refreshing existing tracker issues", async () => {
    await withTempReport(async (path) => {
      const labels = MANAGED_LABELS.map((label) => ({ name: label.name }));
      const reader = fakeReader({
        pulls: [pull({ title: "Fix startup safely" }), pull({ number: 456, title: "Add recall filter" })],
        issues: [targetIssue()],
        labels,
      });

      const dryRun = await runPrTracker({
        mode: "dry-run",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        report: path,
        confirmCredentialedReads: false,
        confirmRemoteWrites: false,
        createMissingOnly: true,
        reader,
      });

      expect(dryRun.plannedActions.map((action) => action.type)).toEqual(["create-issue"]);
      expect(dryRun.plannedActions[0]).toMatchObject({ type: "create-issue", upstreamNumber: 456 });

      const writer = fakeWriter();
      const applyReport = await runPrTracker({
        mode: "apply",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        fromReport: path,
        report: path,
        confirmCredentialedReads: true,
        confirmRemoteWrites: true,
        createMissingOnly: true,
        reader,
        writer,
        sleep: async () => {},
      });

      expect(writer.calls).toEqual(["createIssue:456"]);
      expect(applyReport.failures).toEqual([]);
    });
  });

  it("apply stops on GitHub stop conditions without later writes", async () => {
    await withTempReport(async (path) => {
      const reader = fakeReader({ pulls: [pull()], issues: [], labels: [] });
      await runPrTracker({
        mode: "dry-run",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        report: path,
        confirmCredentialedReads: false,
        confirmRemoteWrites: false,
        reader,
      });
      const calls: string[] = [];
      const writer: PrTrackerWriter = {
        async createLabel(action) {
          calls.push(`createLabel:${action.label.name}`);
          throw new PrTrackerStopError({
            classification: "validation",
            statusCode: 422,
            endpoint: "/repos/wbugitlab1/agentmemory/labels",
            retryAfterSeconds: null,
            resetAt: null,
            message: "Validation failed",
          });
        },
        async createIssue(action) {
          calls.push(`createIssue:${action.upstreamNumber}`);
          return { number: 900, url: "https://github.com/wbugitlab1/agentmemory/issues/900" };
        },
        async updateIssue(action) {
          calls.push(`updateIssue:${action.targetNumber}`);
          return { number: action.targetNumber, url: "https://github.com/wbugitlab1/agentmemory/issues/10" };
        },
      };

      const applyReport = await runPrTracker({
        mode: "apply",
        source: SOURCE_REPO,
        target: TARGET_REPO,
        state: "all",
        fromReport: path,
        report: path,
        confirmCredentialedReads: true,
        confirmRemoteWrites: true,
        reader,
        writer,
      });

      expect(calls).toEqual(["createLabel:upstream-pr"]);
      expect(applyReport.stopCondition).toMatchObject({ classification: "validation", statusCode: 422 });
      expect(applyReport.failedAction?.type).toBe("create-label");
    });
  });

  it("builds issue payload requests without body text in argv and validates payload files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pr-tracker-payload-"));
    try {
      const action = planPrIssueActions({ sourcePulls: [pull({ title: "Fixes #44 for @team", body: "Fixes #12 thanks @team" })], targetIssues: [], targetLabels: [] })
        .actions.find((item) => item.type === "create-issue");
      if (!action || action.type !== "create-issue") throw new Error("missing create action");

      const request = await buildGhIssuePayloadRequest(TARGET_REPO, action, dir);
      expect(request.args.join(" ")).not.toContain(action.body);
      expect(request.args).toContain("--input");

      const payload = JSON.parse(await readFile(request.payloadPath, "utf8"));
      expect(payload.body).toContain("<!-- upstream-pr-neutral: source=rohitg00/agentmemory number=123 -->");
      expect(payload.body).not.toContain("@team");
      expect(payload.title).not.toContain("@team");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
