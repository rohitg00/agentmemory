import { describe, expect, it } from "vitest";

import {
  RateLimitStopError,
  buildGhCreateCommentArgs,
  buildGhCreateIssueArgs,
  buildGhCreateLabelArgs,
  buildGhUpdateIssueRequest,
  buildGhUpdateIssueArgs,
  countSanitizations,
  createPublicGitHubReader,
  flattenGhSlurpPages,
  parseCliArgs,
  runMirrorCli,
  type GitHubMirrorClient,
  type MirrorReport,
} from "../scripts/github/mirror-upstream-issues.js";
import {
  MAX_COMMENT_CHARS,
  MAX_ISSUE_BODY_CHARS,
  SOURCE_REPO,
  TARGET_REPO,
  buildImportedCommentMarker,
  buildImportedCommentsSummaryMarker,
  buildMirrorIssueBody,
  buildUpstreamMarker,
  chunkImportedComments,
  isPullRequestItem,
  parseExistingMirrorMarkers,
  planIssueActions,
  planLabelActions,
  planVerification,
  sanitizeImportedMarkdown,
  type GitHubComment,
  type GitHubIssue,
  type GitHubLabel,
} from "../scripts/github/issue-mirror.js";

const labelBug: GitHubLabel = { name: "bug", color: "d73a4a", description: "Bug" };
const labelHelp: GitHubLabel = { name: "help wanted", color: "008672", description: null };

function issue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 42,
    title: "Source issue",
    state: "open",
    html_url: `https://github.com/${SOURCE_REPO}/issues/42`,
    user: { login: "alice", html_url: "https://github.com/alice" },
    body: "Original body with @team and fixes #7",
    labels: [labelBug],
    comments: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    closed_at: null,
    ...overrides,
  };
}

function comment(overrides: Partial<GitHubComment> = {}): GitHubComment {
  return {
    id: 9001,
    user: { login: "bob", html_url: "https://github.com/bob" },
    body: "Comment body",
    created_at: "2026-01-03T00:00:00Z",
    updated_at: "2026-01-04T00:00:00Z",
    html_url: `https://github.com/${SOURCE_REPO}/issues/42#issuecomment-9001`,
    ...overrides,
  };
}

function patternedText(length: number): string {
  const seed = "abcdefghijklmnopqrstuvwxyz ";
  let text = "";
  while (text.length < length) text += seed;
  return text.slice(0, length);
}

function stripImportedCommentChunk(body: string): string {
  return body.replace(
    /^<!-- upstream-comment-neutral: source=rohitg00\/agentmemory number=[0-9]+ id=[0-9]+ chunk=[0-9]+\/[0-9]+ -->\n\nSource repository: .+\nSource issue number: .+\nSource comment id: .+\nSource URL: .+\nAuthor: .+\nCreated: .+\nUpdated: .+\n/,
    "",
  );
}

function stripOverflowChunk(body: string): string {
  return body.replace(/^<!-- upstream-overflow-neutral: source=rohitg00\/agentmemory number=[0-9]+ chunk=[0-9]+\/[0-9]+ -->\n\nOverflow from upstream issue number [0-9]+\n\n/, "");
}

function mirrorTarget(sourceIssue: GitHubIssue, overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return issue({
    number: 500 + sourceIssue.number,
    title: sourceIssue.title,
    state: sourceIssue.state,
    html_url: `https://github.com/${TARGET_REPO}/issues/${500 + sourceIssue.number}`,
    body: buildMirrorIssueBody(sourceIssue).body,
    labels: sourceIssue.labels,
    comments: 0,
    ...overrides,
  });
}

function importedComment(sourceIssue: GitHubIssue, sourceComment: GitHubComment, overrides: Partial<GitHubComment> = {}): GitHubComment {
  return comment({
    id: 80_000 + sourceComment.id,
    html_url: `https://github.com/${TARGET_REPO}/issues/${500 + sourceIssue.number}#issuecomment-${80_000 + sourceComment.id}`,
    body: `${buildImportedCommentMarker(sourceIssue.number, sourceComment.id, 1, 1)}\n\nImported`,
    ...overrides,
  });
}

function fakeClient(overrides: Partial<GitHubMirrorClient> = {}): GitHubMirrorClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listIssues(repo, state) {
      calls.push(`listIssues:${repo}:${state}`);
      return [];
    },
    async listLabels(repo) {
      calls.push(`listLabels:${repo}`);
      return [];
    },
    async listComments(repo, issueNumber) {
      calls.push(`listComments:${repo}:${issueNumber}`);
      return [];
    },
    async createLabel(repo, label) {
      calls.push(`createLabel:${repo}:${label.name}`);
      return label;
    },
    async createIssue(repo, payload) {
      calls.push(`createIssue:${repo}:${payload.title}`);
      return issue({ number: 900, title: payload.title, body: payload.body, labels: payload.labels.map((name) => ({ name })) });
    },
    async updateIssue(repo, issueNumber, payload) {
      calls.push(`updateIssue:${repo}:${issueNumber}:${payload.state ?? "open"}`);
      return issue({ number: issueNumber, title: payload.title ?? "updated", body: payload.body ?? "", labels: payload.labels?.map((name) => ({ name })) ?? [] });
    },
    async createComment(repo, issueNumber) {
      calls.push(`createComment:${repo}:${issueNumber}`);
      return comment({ id: 999 });
    },
    ...overrides,
  };
}

function mutableMirrorClient(input: {
  sourceIssues: GitHubIssue[];
  sourceLabels?: GitHubLabel[];
  targetIssues?: GitHubIssue[];
  targetLabels?: GitHubLabel[];
  sourceCommentsByIssue?: Map<number, GitHubComment[]>;
  targetCommentsByIssue?: Map<number, GitHubComment[]>;
}): GitHubMirrorClient & {
  calls: string[];
  targetIssues: GitHubIssue[];
  targetLabels: GitHubLabel[];
  targetCommentsByIssue: Map<number, GitHubComment[]>;
} {
  const calls: string[] = [];
  const targetIssues = [...(input.targetIssues ?? [])];
  const targetLabels = [...(input.targetLabels ?? [])];
  const sourceCommentsByIssue = input.sourceCommentsByIssue ?? new Map<number, GitHubComment[]>();
  const targetCommentsByIssue = input.targetCommentsByIssue ?? new Map<number, GitHubComment[]>();
  let nextIssueNumber = 900;
  let nextCommentId = 90_000;

  return {
    calls,
    targetIssues,
    targetLabels,
    targetCommentsByIssue,
    async listIssues(repo, state) {
      calls.push(`listIssues:${repo}:${state}`);
      return repo === SOURCE_REPO ? input.sourceIssues : targetIssues;
    },
    async listLabels(repo) {
      calls.push(`listLabels:${repo}`);
      return repo === SOURCE_REPO ? (input.sourceLabels ?? input.sourceIssues.flatMap((sourceIssue) => sourceIssue.labels)) : targetLabels;
    },
    async listComments(repo, issueNumber) {
      calls.push(`listComments:${repo}:${issueNumber}`);
      return repo === SOURCE_REPO ? (sourceCommentsByIssue.get(issueNumber) ?? []) : (targetCommentsByIssue.get(issueNumber) ?? []);
    },
    async createLabel(repo, label) {
      calls.push(`createLabel:${repo}:${label.name}`);
      targetLabels.push(label);
      return label;
    },
    async createIssue(repo, payload) {
      calls.push(`createIssue:${repo}:${payload.title}`);
      const issueNumber = nextIssueNumber++;
      const created = issue({
        number: issueNumber,
        title: payload.title,
        state: "open",
        html_url: `https://github.com/${repo}/issues/${issueNumber}`,
        body: payload.body,
        labels: payload.labels.map((name) => ({ name })),
        comments: 0,
      });
      targetIssues.push(created);
      targetCommentsByIssue.set(created.number, []);
      return created;
    },
    async updateIssue(repo, issueNumber, payload) {
      calls.push(`updateIssue:${repo}:${issueNumber}:${payload.state ?? "open"}`);
      const targetIssue = targetIssues.find((candidate) => candidate.number === issueNumber);
      if (!targetIssue) throw new Error(`missing target issue ${issueNumber}`);
      if (payload.title !== undefined) targetIssue.title = payload.title;
      if (payload.body !== undefined) targetIssue.body = payload.body;
      if (payload.labels !== undefined) targetIssue.labels = payload.labels.map((name) => ({ name }));
      if (payload.state !== undefined) targetIssue.state = payload.state;
      return targetIssue;
    },
    async createComment(repo, issueNumber, body) {
      calls.push(`createComment:${repo}:${issueNumber}`);
      const created = comment({
        id: nextCommentId++,
        html_url: `https://github.com/${repo}/issues/${issueNumber}#issuecomment-${nextCommentId}`,
        body,
      });
      targetCommentsByIssue.set(issueNumber, [...(targetCommentsByIssue.get(issueNumber) ?? []), created]);
      const targetIssue = targetIssues.find((candidate) => candidate.number === issueNumber);
      if (targetIssue) targetIssue.comments += 1;
      return created;
    },
  };
}

describe("issue mirror planner", () => {
  it("identifies pull request issue endpoint items", () => {
    expect(isPullRequestItem(issue({ pull_request: { url: "https://api.github.com/pr" } }))).toBe(true);
    expect(isPullRequestItem(issue())).toBe(false);
  });

  it("builds the stable upstream issue marker", () => {
    expect(buildUpstreamMarker(42)).toBe("<!-- upstream-issue-neutral: source=rohitg00/agentmemory number=42 -->");
  });

  it("parses exactly one marker per target issue and reports duplicates", () => {
    const result = parseExistingMirrorMarkers([
      issue({ number: 101, body: `${buildUpstreamMarker(1)}\nBody`, labels: [] }),
      issue({ number: 102, body: "Body\n<!-- upstream-issue: rohitg00/agentmemory#2 -->", labels: [] }),
      issue({ number: 103, body: buildUpstreamMarker(2), labels: [] }),
    ]);

    expect(result.invalidMarkers).toEqual([]);
    expect(result.mirrors.map((mirror) => [mirror.upstreamNumber, mirror.targetNumber])).toEqual([
      [1, 101],
      [2, 102],
      [2, 103],
    ]);
    expect(result.duplicates).toEqual([{ upstreamNumber: 2, targetNumbers: [102, 103] }]);
  });

  it("ignores pull request endpoint items when parsing target mirror markers", () => {
    const result = parseExistingMirrorMarkers([
      issue({ number: 101, body: buildUpstreamMarker(1), pull_request: { url: "https://api.github.com/pr" } }),
      issue({ number: 102, body: buildUpstreamMarker(2) }),
    ]);

    expect(result.mirrors.map((mirror) => [mirror.upstreamNumber, mirror.targetNumber])).toEqual([[2, 102]]);
    expect(result.invalidMarkers).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("builds mirror issue bodies with source metadata, original content, labels, and marker", () => {
    const plan = buildMirrorIssueBody(issue({ labels: [labelBug, labelHelp] }));

    expect(plan.body).toContain("Source repository: rohitg00/agentmemory");
    expect(plan.body).toContain("Source issue number: 42");
    expect(plan.body).toContain("Source URL: intentionally omitted to avoid GitHub cross-references");
    expect(plan.body).not.toContain("https://github.com/rohitg00/agentmemory/issues/42");
    expect(plan.body).not.toContain("rohitg00/agentmemory#42");
    expect(plan.body).toContain("Author: alice");
    expect(plan.body).toContain("State: open");
    expect(plan.body).toContain("Created: 2026-01-01T00:00:00Z");
    expect(plan.body).toContain("Updated: 2026-01-02T00:00:00Z");
    expect(plan.body).toContain("Original labels: bug, help wanted");
    expect(plan.body).toContain("Original body with @<!-- -->team and fix<!-- -->es #<!-- -->7");
    expect(plan.body).toContain(buildUpstreamMarker(42));
  });

  it("preserves the upstream marker and neutral source metadata when upstream body text is oversized", () => {
    const oversized = "x".repeat(MAX_ISSUE_BODY_CHARS + 10_000);
    const plan = buildMirrorIssueBody(issue({ body: oversized }));

    expect(plan.body.length).toBeLessThanOrEqual(MAX_ISSUE_BODY_CHARS);
    expect(plan.body).toContain(buildUpstreamMarker(42));
    expect(plan.body).toContain("Source issue number: 42");
    expect(plan.body).not.toContain("https://github.com/rohitg00/agentmemory/issues/42");
    expect(plan.overflowComments.length).toBeGreaterThan(0);
  });

  it("adds stable markers to oversized issue-body overflow comments", () => {
    const plan = buildMirrorIssueBody(issue({ body: "x".repeat(MAX_ISSUE_BODY_CHARS + 10_000) }));

    expect(plan.overflowComments[0]).toContain("<!-- upstream-overflow-neutral: source=rohitg00/agentmemory number=42 chunk=1/");
    expect(plan.overflowComments[0]).not.toContain("rohitg00/agentmemory#42");
  });

  it("sanitizes imported Markdown without making it unreadable", () => {
    const sanitized = sanitizeImportedMarkdown(
      "Hi @alice and @org/team, fixes #123, resolves GH-456, closes rohitg00/agentmemory#789.",
    );

    expect(sanitized).toContain("@<!-- -->alice");
    expect(sanitized).toContain("@<!-- -->org/team");
    expect(sanitized).toContain("fix<!-- -->es #<!-- -->123");
    expect(sanitized).toContain("resolv<!-- -->es GH-<!-- -->456");
    expect(sanitized).toContain("clos<!-- -->es rohitg00/agentmemory#<!-- -->789");
  });

  it("sanitizes large plain alphanumeric text quickly", () => {
    const largeBody = "x".repeat(70_000);
    const startedAt = performance.now();

    expect(sanitizeImportedMarkdown(largeBody)).toBe(largeBody);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });

  it("plans only source-used labels missing from the target", () => {
    const actions = planLabelActions(
      [issue({ labels: [labelBug, labelHelp] }), issue({ number: 43, labels: [labelBug] })],
      [labelBug],
    );

    expect(actions).toEqual([{ type: "create-label", label: labelHelp }]);
  });

  it("chunks long imported comments below the GitHub comment limit", () => {
    const chunks = chunkImportedComments(42, [comment({ body: "a".repeat(MAX_COMMENT_CHARS + 1_000) })]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.body.length <= MAX_COMMENT_CHARS)).toBe(true);
  });

  it("emits stable per-source-comment chunk markers", () => {
    const chunks = chunkImportedComments(42, [comment({ id: 123, body: "a".repeat(MAX_COMMENT_CHARS + 1_000) })]);

    expect(chunks[0].body).toContain("<!-- upstream-comment-neutral: source=rohitg00/agentmemory number=42 id=123 chunk=1/");
    expect(chunks[1].body).toContain("<!-- upstream-comment-neutral: source=rohitg00/agentmemory number=42 id=123 chunk=2/");
    expect(chunks[0].body).toContain("Source comment id: 123");
    expect(chunks[0].body).toContain("Source URL: intentionally omitted to avoid GitHub cross-references");
    expect(chunks[0].body).not.toContain("https://github.com/rohitg00/agentmemory/issues/42#issuecomment-123");
    expect(chunks[0].body).not.toContain("rohitg00/agentmemory#42");
  });

  it("reconstructs imported comment payloads exactly across changing chunk marker lengths", () => {
    const body = patternedText(MAX_COMMENT_CHARS * 10 + 5_000);
    const chunks = chunkImportedComments(42, [comment({ id: 123, body })]);

    expect(chunks.length).toBeGreaterThan(9);
    expect(chunks.every((chunk) => chunk.body.length <= MAX_COMMENT_CHARS)).toBe(true);
    expect(chunks.map((chunk) => stripImportedCommentChunk(chunk.body)).join("")).toBe(sanitizeImportedMarkdown(body));
  });

  it("reconstructs overflow payloads exactly across changing chunk marker lengths", () => {
    const upstreamBody = patternedText(MAX_ISSUE_BODY_CHARS + MAX_COMMENT_CHARS * 10 + 5_000);
    const bodyPlan = buildMirrorIssueBody(issue({ body: upstreamBody }));
    const retainedBody = bodyPlan.body
      .split("Imported upstream body:\n")[1]
      .replace("\n\n[Upstream body truncated; overflow imported as comments.]", "");

    expect(bodyPlan.overflowComments.length).toBeGreaterThan(9);
    expect(bodyPlan.overflowComments.every((chunk) => chunk.length <= MAX_COMMENT_CHARS)).toBe(true);
    expect(bodyPlan.overflowComments.map(stripOverflowChunk).join("")).toBe(sanitizeImportedMarkdown(upstreamBody).slice(retainedBody.length));
  });

  it("plans create, update, comment, close, and skip actions without duplicate creates", () => {
    const sourceIssues = [
      issue({ number: 1, title: "New", comments: 0 }),
      issue({ number: 2, title: "Changed", labels: [labelBug], comments: 1 }),
      issue({ number: 3, title: "Closed", state: "closed", closed_at: "2026-01-05T00:00:00Z" }),
      issue({ number: 4, title: "Synced" }),
    ];
    const targetIssues = [
      issue({ number: 202, title: "Old", body: `${buildUpstreamMarker(2)}\nold`, labels: [] }),
      issue({ number: 203, title: "Closed mirror", body: buildUpstreamMarker(3), state: "open", labels: [labelBug] }),
      issue({ number: 204, title: "Synced", body: buildMirrorIssueBody(sourceIssues[3]).body, labels: [labelBug] }),
    ];

    const actions = planIssueActions({
      sourceIssues,
      targetIssues,
      sourceCommentsByIssue: new Map([[2, [comment({ id: 222 })]]]),
      targetLabels: [labelBug],
    });

    expect(actions.filter((action) => action.type === "create-issue")).toHaveLength(1);
    expect(actions).toContainEqual(expect.objectContaining({ type: "update-issue", upstreamNumber: 2, targetNumber: 202 }));
    expect(actions).toContainEqual(expect.objectContaining({ type: "create-comment", upstreamNumber: 2, upstreamCommentId: 222, targetNumber: 202 }));
    expect(actions).toContainEqual(expect.objectContaining({ type: "close-issue", upstreamNumber: 3, targetNumber: 203 }));
    expect(actions).toContainEqual(expect.objectContaining({ type: "skip-issue", upstreamNumber: 4, targetNumber: 204 }));
  });

  it("plans imported comment chunks and a summary marker for newly created mirrors", () => {
    const sourceIssue = issue({ number: 10, comments: 1 });
    const actions = planIssueActions({
      sourceIssues: [sourceIssue],
      targetIssues: [],
      sourceCommentsByIssue: new Map([[10, [comment({ id: 123 })]]]),
      targetCommentsByIssue: new Map(),
      targetLabels: [labelBug],
    });

    expect(actions).toContainEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 10 }));
    expect(actions).toContainEqual(expect.objectContaining({ type: "create-comment", upstreamNumber: 10, upstreamCommentId: 123 }));
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: "create-comment",
        upstreamNumber: 10,
        upstreamCommentId: null,
        commentKind: "summary",
        body: buildImportedCommentsSummaryMarker(10, 1),
      }),
    );
  });

  it("plans closing a newly created mirror when the upstream issue is closed", () => {
    const sourceIssue = issue({ number: 11, state: "closed", closed_at: "2026-01-05T00:00:00Z" });
    const actions = planIssueActions({
      sourceIssues: [sourceIssue],
      targetIssues: [],
      targetLabels: [labelBug],
    });

    expect(actions).toEqual([
      expect.objectContaining({ type: "create-issue", upstreamNumber: 11 }),
      expect.objectContaining({ type: "close-issue", upstreamNumber: 11, targetNumber: null }),
    ]);
  });

  it("plans a missing imported-comments summary marker idempotently for existing mirrors", () => {
    const sourceIssue = issue({ number: 10, comments: 1 });
    const sourceComment = comment({ id: 123 });
    const targetIssue = mirrorTarget(sourceIssue, { number: 510 });
    const importedChunk = importedComment(sourceIssue, sourceComment, { body: chunkImportedComments(10, [sourceComment])[0].body });
    const summary = comment({ id: 50123, body: buildImportedCommentsSummaryMarker(10, 1) });

    const missingSummary = planIssueActions({
      sourceIssues: [sourceIssue],
      targetIssues: [targetIssue],
      sourceCommentsByIssue: new Map([[10, [sourceComment]]]),
      targetCommentsByIssue: new Map([[510, [importedChunk]]]),
      targetLabels: [labelBug],
    });
    expect(missingSummary).toContainEqual(expect.objectContaining({ type: "create-comment", commentKind: "summary", upstreamNumber: 10 }));

    const complete = planIssueActions({
      sourceIssues: [sourceIssue],
      targetIssues: [targetIssue],
      sourceCommentsByIssue: new Map([[10, [sourceComment]]]),
      targetCommentsByIssue: new Map([[510, [importedChunk, summary]]]),
      targetLabels: [labelBug],
    });
    expect(complete).not.toContainEqual(expect.objectContaining({ type: "create-comment", commentKind: "summary", upstreamNumber: 10 }));
  });

  it("includes source title when planning an issue update for title drift", () => {
    const sourceIssue = issue({ number: 2, title: "Correct title" });
    const actions = planIssueActions({
      sourceIssues: [sourceIssue],
      targetIssues: [issue({ number: 202, title: "Old title", body: buildMirrorIssueBody(sourceIssue).body, labels: [labelBug] })],
    });

    expect(actions).toEqual([
      expect.objectContaining({
        type: "update-issue",
        upstreamNumber: 2,
        targetNumber: 202,
        title: "Correct title",
      }),
    ]);
  });

  it("rejects multiple markers in one target, duplicate markers across targets, and malformed marker text", () => {
    const actions = planIssueActions({
      sourceIssues: [issue({ number: 1 }), issue({ number: 2 })],
      targetIssues: [
        issue({ number: 101, body: `${buildUpstreamMarker(1)}\n${buildUpstreamMarker(2)}` }),
        issue({ number: 102, body: buildUpstreamMarker(1) }),
        issue({ number: 104, body: buildUpstreamMarker(1) }),
        issue({ number: 103, body: "<!-- upstream-issue: somewhere/else#not-a-number -->" }),
      ],
    });

    expect(actions).toContainEqual(expect.objectContaining({ type: "invalid-marker", targetNumber: 101 }));
    expect(actions).toContainEqual(expect.objectContaining({ type: "duplicate-marker", upstreamNumber: 1, targetNumbers: [102, 104] }));
    expect(actions).toContainEqual(expect.objectContaining({ type: "invalid-marker", targetNumber: 103 }));
  });

  it("does not treat multi-marker target issues as valid mirrors or create replacements for contained upstream numbers", () => {
    const actions = planIssueActions({
      sourceIssues: [issue({ number: 1 }), issue({ number: 2 })],
      targetIssues: [issue({ number: 101, body: `${buildUpstreamMarker(1)}\n${buildUpstreamMarker(2)}` })],
    });

    expect(actions).toContainEqual(expect.objectContaining({ type: "invalid-marker", targetNumber: 101 }));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 1 }));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 2 }));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "update-issue", targetNumber: 101 }));
  });

  it("blocks contained upstream numbers from malformed markers in multi-marker target issues", () => {
    const actions = planIssueActions({
      sourceIssues: [issue({ number: 1 }), issue({ number: 2 })],
      targetIssues: [issue({ number: 101, body: `${buildUpstreamMarker(1)}\n<!-- upstream-issue: rohitg00/agentmemory#2 extra -->` })],
    });

    expect(actions).toContainEqual(expect.objectContaining({ type: "invalid-marker", targetNumber: 101 }));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 1 }));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 2 }));
  });

  it("blocks source upstream numbers that appear later inside malformed multi-marker bodies", () => {
    const actions = planIssueActions({
      sourceIssues: [issue({ number: 1 }), issue({ number: 2 })],
      targetIssues: [issue({ number: 101, body: `${buildUpstreamMarker(1)}\n<!-- upstream-issue: malformed rohitg00/agentmemory#2 -->` })],
    });

    expect(actions).toContainEqual(expect.objectContaining({ type: "invalid-marker", targetNumber: 101 }));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 1 }));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 2 }));
  });

  it("blocks contained upstream numbers from single malformed marker bodies", () => {
    const actions = planIssueActions({
      sourceIssues: [issue({ number: 2 })],
      targetIssues: [issue({ number: 101, body: "<!-- upstream-issue: malformed rohitg00/agentmemory#2 -->" })],
    });

    expect(actions).toContainEqual(expect.objectContaining({ type: "invalid-marker", targetNumber: 101 }));
    expect(actions).not.toContainEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 2 }));
  });

  it("does not plan duplicate overflow comments for existing mirrors when stable overflow markers already exist", () => {
    const sourceIssue = issue({ body: "x".repeat(MAX_ISSUE_BODY_CHARS + 10_000) });
    const bodyPlan = buildMirrorIssueBody(sourceIssue);
    const actions = planIssueActions({
      sourceIssues: [sourceIssue],
      targetIssues: [issue({ number: 502, body: bodyPlan.body, labels: [labelBug] })],
      targetCommentsByIssue: new Map([[502, bodyPlan.overflowComments.map((body, index) => comment({ id: 10_000 + index, body }))]]),
    });

    expect(actions).toEqual([{ type: "skip-issue", upstreamNumber: 42, targetNumber: 502, reason: "already synchronized" }]);
  });

  it("verification fails for missing or duplicate overflow markers and passes when oversized overflow comments are complete", () => {
    const sourceIssue = issue({ body: "x".repeat(MAX_ISSUE_BODY_CHARS + 10_000) });
    const bodyPlan = buildMirrorIssueBody(sourceIssue);
    const targetIssue = issue({ number: 502, body: bodyPlan.body, labels: [labelBug] });

    const missingOverflow = planVerification({
      sourceIssues: [sourceIssue],
      targetIssues: [targetIssue],
      sourceCommentsByIssue: new Map(),
      targetCommentsByIssue: new Map([[502, []]]),
      targetLabels: [labelBug],
    });
    expect(missingOverflow.ok).toBe(false);
    expect(missingOverflow.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing overflow marker for upstream issue 42 chunk 1"),
        expect.stringContaining("overflow-count mismatch for upstream issue 42"),
      ]),
    );

    const completeOverflow = planVerification({
      sourceIssues: [sourceIssue],
      targetIssues: [targetIssue],
      sourceCommentsByIssue: new Map(),
      targetCommentsByIssue: new Map([[502, bodyPlan.overflowComments.map((body, index) => comment({ id: 20_000 + index, body }))]]),
      targetLabels: [labelBug],
    });
    expect(completeOverflow.ok).toBe(true);

    const duplicateOverflow = planVerification({
      sourceIssues: [sourceIssue],
      targetIssues: [targetIssue],
      sourceCommentsByIssue: new Map(),
      targetCommentsByIssue: new Map([
        [
          502,
          [
            ...bodyPlan.overflowComments.map((body, index) => comment({ id: 30_000 + index, body })),
            comment({ id: 40_000, body: bodyPlan.overflowComments[0] }),
          ],
        ],
      ]),
      targetLabels: [labelBug],
    });
    expect(duplicateOverflow.ok).toBe(false);
    expect(duplicateOverflow.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("overflow-count mismatch for upstream issue 42")]),
    );
  });

  it("verification fails for missing, duplicate, state, body, label, target-label, comment marker, and comment-count problems", () => {
    const targetIssue = issue({
      number: 500,
      title: "Wrong title",
      body: buildUpstreamMarker(42),
      state: "open",
      labels: [],
      comments: 0,
    });

    const verification = planVerification({
      sourceIssues: [
        issue({ state: "closed", labels: [labelBug], comments: 1, closed_at: "2026-01-05T00:00:00Z" }),
        issue({ number: 50 }),
        issue({ number: 99 }),
      ],
      targetIssues: [
        targetIssue,
        issue({ number: 550, body: buildUpstreamMarker(50), labels: [labelBug] }),
        issue({ number: 551, body: buildUpstreamMarker(50), labels: [labelBug] }),
        issue({ number: 560, body: `${buildUpstreamMarker(60)}\n${buildUpstreamMarker(61)}`, labels: [labelBug] }),
      ],
      sourceCommentsByIssue: new Map([[42, [comment({ id: 9001 })]]]),
      targetCommentsByIssue: new Map([[500, []]]),
      targetLabels: [],
    });

    expect(verification.ok).toBe(false);
    expect(verification.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing mirror for upstream issue 99"),
        expect.stringContaining("multiple upstream issue markers in target issue 560"),
        expect.stringContaining("duplicate marker for upstream issue 50"),
        expect.stringContaining("state mismatch for upstream issue 42"),
        expect.stringContaining("title mismatch for upstream issue 42"),
        expect.stringContaining("body marker mismatch for upstream issue 42"),
        expect.stringContaining("label mismatch for upstream issue 42"),
        expect.stringContaining("missing target label: bug"),
        expect.stringContaining("missing imported comment marker for upstream issue 42 comment 9001"),
        expect.stringContaining("comment-count mismatch for upstream issue 42"),
      ]),
    );
  });

  it("verification requires an imported-comments summary marker when source comments exist", () => {
    const sourceIssue = issue({ number: 10, comments: 1 });
    const sourceComment = comment({ id: 123 });
    const targetIssue = mirrorTarget(sourceIssue, { number: 510 });
    const importedChunk = importedComment(sourceIssue, sourceComment, { body: chunkImportedComments(10, [sourceComment])[0].body });

    const missingSummary = planVerification({
      sourceIssues: [sourceIssue],
      targetIssues: [targetIssue],
      sourceCommentsByIssue: new Map([[10, [sourceComment]]]),
      targetCommentsByIssue: new Map([[510, [importedChunk]]]),
      targetLabels: [labelBug],
    });
    expect(missingSummary.ok).toBe(false);
    expect(missingSummary.failures).toContain("missing imported-comments summary marker for upstream issue 10 count 1");

    const complete = planVerification({
      sourceIssues: [sourceIssue],
      targetIssues: [targetIssue],
      sourceCommentsByIssue: new Map([[10, [sourceComment]]]),
      targetCommentsByIssue: new Map([[510, [importedChunk, comment({ id: 50123, body: buildImportedCommentsSummaryMarker(10, 1) })]]]),
      targetLabels: [labelBug],
    });
    expect(complete.ok).toBe(true);
  });

  it("verification accepts source comment counts that are not returned by the comments endpoint when the summary marker preserves the count", () => {
    const sourceIssue = issue({ number: 10, comments: 2 });
    const targetIssue = mirrorTarget(sourceIssue, { number: 510 });

    const verification = planVerification({
      sourceIssues: [sourceIssue],
      targetIssues: [targetIssue],
      sourceCommentsByIssue: new Map([[10, []]]),
      targetCommentsByIssue: new Map([[510, [comment({ id: 50123, body: buildImportedCommentsSummaryMarker(10, 2) })]]]),
      targetLabels: [labelBug],
    });

    expect(verification.ok).toBe(true);
  });
});

describe("github mirror CLI", () => {
  it("defaults to dry-run public reads and does not call write methods", async () => {
    const sourceIssue = issue({ number: 1, comments: 2 });
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [sourceIssue] : [];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return repo === TARGET_REPO ? [] : [labelBug];
      },
    });

    const result = await runMirrorCli(["--public-read"], { publicReader: client, wait: async () => {} });

    expect(result.exitCode).toBe(0);
    expect(client.calls).toEqual([
      `listIssues:${SOURCE_REPO}:all`,
      `listIssues:${TARGET_REPO}:all`,
      `listLabels:${SOURCE_REPO}`,
      `listLabels:${TARGET_REPO}`,
    ]);
    expect(client.calls.some((call) => call.startsWith("create") || call.startsWith("update"))).toBe(false);
    expect(result.report.plannedImportedCommentCount).toBe(2);
    expect(result.report.readMode).toBe("public-read");
  });

  it("honors explicit dry-run public-read without writes", async () => {
    const client = fakeClient();

    const result = await runMirrorCli(["--dry-run", "--public-read"], { publicReader: client, wait: async () => {} });

    expect(result.exitCode).toBe(0);
    expect(client.calls.some((call) => call.startsWith("create") || call.startsWith("update"))).toBe(false);
  });

  it("reports exact dry-run planned actions with bounded body evidence", async () => {
    const sourceIssue = issue({ number: 1, title: "New mirror", body: "Body", labels: [labelBug, labelHelp], comments: 1 });
    const sourceComment = comment({ id: 321, body: "Imported comment" });
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [sourceIssue] : [];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return repo === TARGET_REPO ? [labelBug] : [labelBug, labelHelp];
      },
      async listComments(repo, issueNumber) {
        client.calls.push(`listComments:${repo}:${issueNumber}`);
        return repo === SOURCE_REPO && issueNumber === 1 ? [sourceComment] : [];
      },
    });

    const result = await runMirrorCli(["--dry-run", "--include-comments"], {
      publicReader: client,
      wait: async () => {},
    });

    expect(result.report.plannedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "create-label", labelName: "help wanted" }),
        expect.objectContaining({ type: "create-issue", upstreamNumber: 1, title: "New mirror", labels: ["bug", "help wanted"], bodyLength: expect.any(Number), bodySha256: expect.any(String) }),
        expect.objectContaining({ type: "create-comment", upstreamNumber: 1, upstreamCommentId: 321, bodyLength: expect.any(Number), bodySha256: expect.any(String) }),
        expect.objectContaining({ type: "create-comment", upstreamNumber: 1, commentKind: "summary", bodyPreview: buildImportedCommentsSummaryMarker(1, 1) }),
      ]),
    );
    expect(result.report.plannedActions.find((action) => action.type === "create-issue")?.bodyPreview.length).toBeLessThanOrEqual(160);
  });

  it("reports planned actions in apply execution order during dry-run", async () => {
    const firstSource = issue({ number: 1, title: "New closed mirror", state: "closed", comments: 1, closed_at: "2026-01-05T00:00:00Z" });
    const secondSource = issue({ number: 2, title: "Changed closed mirror", state: "closed", comments: 0, closed_at: "2026-01-06T00:00:00Z" });
    const sourceComment = comment({ id: 101, body: "Imported comment" });
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [secondSource, firstSource] : [mirrorTarget(secondSource, { number: 502, title: "Old title", state: "open" })];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return repo === SOURCE_REPO ? [labelBug] : [];
      },
      async listComments(repo, issueNumber) {
        client.calls.push(`listComments:${repo}:${issueNumber}`);
        return repo === SOURCE_REPO && issueNumber === 1 ? [sourceComment] : [];
      },
    });

    const result = await runMirrorCli(["--dry-run", "--include-comments"], {
      publicReader: client,
      wait: async () => {},
    });

    expect(result.report.plannedActions.map((action) => [action.type, action.upstreamNumber ?? action.labelName, action.commentKind ?? null])).toEqual([
      ["create-label", "bug", null],
      ["create-issue", 1, null],
      ["update-issue", 2, null],
      ["create-comment", 1, "imported"],
      ["create-comment", 1, "summary"],
      ["close-issue", 1, null],
      ["close-issue", 2, null],
    ]);
  });

  it("fails apply without credentialed read confirmation before gh calls", async () => {
    const ghClient = fakeClient();

    const result = await runMirrorCli(["--apply", "--confirm-remote-writes"], { ghClient, wait: async () => {} });

    expect(result.exitCode).toBe(1);
    expect(result.report.errors).toContain("--apply requires --confirm-credentialed-reads");
    expect(ghClient.calls).toEqual([]);
  });

  it("fails apply without remote write confirmation before target writes", async () => {
    const ghClient = fakeClient();

    const result = await runMirrorCli(["--apply", "--confirm-credentialed-reads"], { ghClient, wait: async () => {} });

    expect(result.exitCode).toBe(1);
    expect(result.report.errors).toContain("--apply requires --confirm-remote-writes");
    expect(ghClient.calls).toEqual([]);
  });

  it("fails read-with-gh without credentialed read confirmation before gh calls", async () => {
    const ghClient = fakeClient();

    const result = await runMirrorCli(["--dry-run", "--read-with-gh"], { ghClient, wait: async () => {} });

    expect(result.exitCode).toBe(1);
    expect(result.report.errors).toContain("--read-with-gh requires --confirm-credentialed-reads");
    expect(ghClient.calls).toEqual([]);
  });

  it("verify performs only read endpoints and passes for a complete mirror fixture", async () => {
    const sourceIssue = issue({ number: 1, comments: 1 });
    const sourceComment = comment({ id: 7001 });
    const targetIssue = mirrorTarget(sourceIssue);
    const targetComment = importedComment(sourceIssue, sourceComment);
    const targetSummary = comment({ id: 70_002, body: buildImportedCommentsSummaryMarker(1, 1) });
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [sourceIssue] : [targetIssue];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return repo === TARGET_REPO ? [labelBug] : [labelBug];
      },
      async listComments(repo, issueNumber) {
        client.calls.push(`listComments:${repo}:${issueNumber}`);
        if (repo === SOURCE_REPO) return [sourceComment];
        return [targetComment, targetSummary];
      },
    });

    const result = await runMirrorCli(["--verify"], { publicReader: client, wait: async () => {} });

    expect(result.exitCode).toBe(0);
    expect(result.report.verification.ok).toBe(true);
    expect(client.calls).toEqual([
      `listIssues:${SOURCE_REPO}:all`,
      `listIssues:${TARGET_REPO}:all`,
      `listLabels:${SOURCE_REPO}`,
      `listLabels:${TARGET_REPO}`,
      `listComments:${SOURCE_REPO}:1`,
      `listComments:${TARGET_REPO}:${targetIssue.number}`,
    ]);
    expect(client.calls.some((call) => call.startsWith("create") || call.startsWith("update"))).toBe(false);
  });

  it("writes apply progress after each successful write and records a failed action", async () => {
    const sourceIssue = issue({ number: 1, title: "New mirror", comments: 0 });
    const reports: unknown[] = [];
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [sourceIssue] : [];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return repo === TARGET_REPO ? [] : [labelBug];
      },
      async createIssue() {
        client.calls.push("createIssue:fail");
        throw new Error("create issue failed");
      },
    });

    const result = await runMirrorCli(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes", "--report", "mirror-report.json"], {
      ghClient: client,
      wait: async () => {},
      writeReport: async (_path, report) => {
        reports.push(JSON.parse(JSON.stringify(report)));
      },
    });

    expect(result.exitCode).toBe(1);
    expect(reports.length).toBeGreaterThanOrEqual(2);
    expect(result.report.appliedActions).toEqual([expect.objectContaining({ type: "create-label", labelName: "bug" })]);
    expect(result.report.failedAction).toEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 1, title: "New mirror" }));
    expect(reports.at(-1)).toMatchObject({
      appliedActions: [expect.objectContaining({ type: "create-label", labelName: "bug" })],
      failedAction: expect.objectContaining({ type: "create-issue", upstreamNumber: 1 }),
    });
  });

  it("applies a missing closed mirror by creating, importing comments and summary, then closing created target", async () => {
    const sourceIssue = issue({ number: 1, title: "Closed new mirror", state: "closed", comments: 1, closed_at: "2026-01-05T00:00:00Z" });
    const sourceComment = comment({ id: 333, body: "Imported" });
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [sourceIssue] : [];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return [labelBug];
      },
      async listComments(repo, issueNumber) {
        client.calls.push(`listComments:${repo}:${issueNumber}`);
        return repo === SOURCE_REPO && issueNumber === 1 ? [sourceComment] : [];
      },
      async createIssue(repo, payload) {
        client.calls.push(`createIssue:${repo}:${payload.title}`);
        return mirrorTarget(sourceIssue, { number: 901, title: payload.title, body: payload.body, labels: payload.labels.map((name) => ({ name })) });
      },
      async createComment(repo, issueNumber, body) {
        const kind = body.includes("upstream-comments-imported") ? "summary" : "imported";
        client.calls.push(`createComment:${repo}:${issueNumber}:${kind}`);
        return comment({ id: 9900 });
      },
      async updateIssue(repo, issueNumber, payload) {
        client.calls.push(`updateIssue:${repo}:${issueNumber}:${payload.state ?? "open"}`);
        return mirrorTarget(sourceIssue, { number: issueNumber, state: payload.state ?? "open" });
      },
    });

    await runMirrorCli(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes"], {
      ghClient: client,
      wait: async () => {},
    });

    expect(client.calls.filter((call) => call.startsWith("createIssue") || call.startsWith("createComment") || call.startsWith("updateIssue"))).toEqual([
      `createIssue:${TARGET_REPO}:Closed new mirror`,
      `createComment:${TARGET_REPO}:901:imported`,
      `createComment:${TARGET_REPO}:901:summary`,
      `updateIssue:${TARGET_REPO}:901:closed`,
    ]);
  });

  it("uses the configured write delay between apply writes", async () => {
    const sourceIssue = issue({ number: 1, title: "Closed new mirror", state: "closed", comments: 0, closed_at: "2026-01-05T00:00:00Z" });
    const waits: number[] = [];
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [sourceIssue] : [];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return [labelBug];
      },
      async createIssue(repo, payload) {
        client.calls.push(`createIssue:${repo}:${payload.title}`);
        return mirrorTarget(sourceIssue, { number: 901, title: payload.title, body: payload.body, labels: payload.labels.map((name) => ({ name })) });
      },
      async updateIssue(repo, issueNumber, payload) {
        client.calls.push(`updateIssue:${repo}:${issueNumber}:${payload.state ?? "open"}`);
        return mirrorTarget(sourceIssue, { number: issueNumber, state: payload.state ?? "open" });
      },
    });

    await runMirrorCli(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes", "--write-delay-ms", "5000"], {
      ghClient: client,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    expect(waits).toEqual([5000, 5000]);
  });

  it("can defer comment writes while applying close-state updates", async () => {
    const sourceIssue = issue({ number: 1, title: "Closed mirror", state: "closed", comments: 1, closed_at: "2026-01-05T00:00:00Z" });
    const sourceComment = comment({ id: 333, body: "Imported" });
    const targetIssue = mirrorTarget(sourceIssue, { number: 501, state: "open", labels: [labelBug] });
    const client = mutableMirrorClient({
      sourceIssues: [sourceIssue],
      sourceLabels: [labelBug],
      targetIssues: [targetIssue],
      targetLabels: [labelBug],
      sourceCommentsByIssue: new Map([[1, [sourceComment]]]),
    });

    const result = await runMirrorCli(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes", "--defer-comments"], {
      ghClient: client,
      wait: async () => {},
    });

    expect(result.report.plannedActionCounts["create-comment"]).toBeUndefined();
    expect(result.report.plannedActionCounts["close-issue"]).toBe(1);
    expect(client.calls.filter((call) => call.startsWith("createComment") || call.startsWith("updateIssue"))).toEqual([
      `updateIssue:${TARGET_REPO}:501:closed`,
    ]);
    expect(client.targetIssues[0].state).toBe("closed");
  });

  it("applies writes end-to-end and verifies the persisted mirrored issue", async () => {
    const sourceIssue = issue({ number: 1, title: "Closed new mirror", state: "closed", comments: 1, closed_at: "2026-01-05T00:00:00Z" });
    const sourceComment = comment({ id: 333, body: "Imported" });
    const client = mutableMirrorClient({
      sourceIssues: [sourceIssue],
      sourceLabels: [labelBug],
      targetLabels: [],
      sourceCommentsByIssue: new Map([[1, [sourceComment]]]),
    });

    const result = await runMirrorCli(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes"], {
      ghClient: client,
      wait: async () => {},
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.verification.ok).toBe(true);
    expect(client.targetLabels).toEqual([labelBug]);
    expect(client.targetIssues).toEqual([expect.objectContaining({ title: "Closed new mirror", state: "closed", labels: [{ name: "bug" }] })]);
    expect(client.targetCommentsByIssue.get(client.targetIssues[0].number)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: expect.stringContaining("<!-- upstream-comment-neutral: source=rohitg00/agentmemory number=1 id=333 chunk=1/1 -->") }),
        expect.objectContaining({ body: buildImportedCommentsSummaryMarker(1, 1) }),
      ]),
    );
  });

  it("keeps successful apply progress when a later write hits a rate limit", async () => {
    const sourceIssue = issue({ number: 1, title: "New mirror", comments: 0 });
    const reports: MirrorReport[] = [];
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [sourceIssue] : [];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return repo === SOURCE_REPO ? [labelBug] : [];
      },
      async createIssue() {
        client.calls.push("createIssue:rate-limit");
        throw new RateLimitStopError(`POST /repos/${TARGET_REPO}/issues`, 60, "rate limited");
      },
    });

    const result = await runMirrorCli(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes", "--report", "mirror-report.json"], {
      ghClient: client,
      wait: async () => {},
      writeReport: async (_path, report) => {
        reports.push(JSON.parse(JSON.stringify(report)) as MirrorReport);
      },
    });

    expect(result.exitCode).toBe(2);
    expect(result.report.appliedActions).toEqual([expect.objectContaining({ type: "create-label", labelName: "bug" })]);
    expect(result.report.failedAction).toEqual(expect.objectContaining({ type: "create-issue", upstreamNumber: 1, title: "New mirror" }));
    expect(result.report.rateLimitStop).toEqual({
      operation: `POST /repos/${TARGET_REPO}/issues`,
      retryAfterSeconds: 60,
      message: "rate limited",
    });
    expect(reports.at(-1)).toMatchObject({
      appliedActions: [expect.objectContaining({ type: "create-label", labelName: "bug" })],
      failedAction: expect.objectContaining({ type: "create-issue", upstreamNumber: 1 }),
      rateLimitStop: { retryAfterSeconds: 60, message: "rate limited" },
    });
  });

  it("reports close actions for missing closed upstream issues during dry-run", async () => {
    const sourceIssue = issue({ number: 1, title: "Closed new mirror", state: "closed", closed_at: "2026-01-05T00:00:00Z" });
    const client = fakeClient({
      async listIssues(repo, state) {
        client.calls.push(`listIssues:${repo}:${state}`);
        return repo === SOURCE_REPO ? [sourceIssue] : [];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return [labelBug];
      },
    });

    const result = await runMirrorCli(["--dry-run"], { publicReader: client, wait: async () => {} });

    expect(result.report.plannedActionCounts).toMatchObject({ "create-issue": 1, "close-issue": 1 });
    expect(result.report.plannedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "create-issue", upstreamNumber: 1 }),
        expect.objectContaining({ type: "close-issue", upstreamNumber: 1, targetNumber: null }),
      ]),
    );
  });

  it("verify fails for missing mirror, duplicate marker, multi-marker, state, label, target-label, and comment drift", async () => {
    const sourceIssue = issue({ number: 1, state: "closed", comments: 1, labels: [labelBug], closed_at: "2026-01-05T00:00:00Z" });
    const sourceComment = comment({ id: 7001 });
    const client = fakeClient({
      async listIssues(repo) {
        client.calls.push(`listIssues:${repo}:all`);
        if (repo === SOURCE_REPO) return [sourceIssue, issue({ number: 2 }), issue({ number: 3 }), issue({ number: 4 })];
        return [
          mirrorTarget(sourceIssue, { state: "open", labels: [], comments: 0 }),
          issue({ number: 602, body: buildUpstreamMarker(2), labels: [labelBug] }),
          issue({ number: 603, body: buildUpstreamMarker(2), labels: [labelBug] }),
          issue({ number: 604, body: `${buildUpstreamMarker(4)}\n${buildUpstreamMarker(5)}`, labels: [labelBug] }),
        ];
      },
      async listLabels(repo) {
        client.calls.push(`listLabels:${repo}`);
        return repo === TARGET_REPO ? [] : [labelBug];
      },
      async listComments(repo, issueNumber) {
        client.calls.push(`listComments:${repo}:${issueNumber}`);
        return repo === SOURCE_REPO && issueNumber === 1 ? [sourceComment] : [];
      },
    });

    const result = await runMirrorCli(["--verify"], { publicReader: client, wait: async () => {} });

    expect(result.exitCode).toBe(1);
    expect(result.report.verification.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("state mismatch for upstream issue 1"),
        expect.stringContaining("label mismatch for upstream issue 1"),
        expect.stringContaining("missing target label: bug"),
        expect.stringContaining("missing imported comment marker for upstream issue 1 comment 7001"),
        expect.stringContaining("comment-count mismatch for upstream issue 1"),
        expect.stringContaining("duplicate marker for upstream issue 2"),
        expect.stringContaining("missing mirror for upstream issue 3"),
        expect.stringContaining("multiple upstream issue markers in target issue 604"),
      ]),
    );
  });

  it("excludes pull request endpoint items from source counts", async () => {
    const client = fakeClient({
      async listIssues(repo) {
        client.calls.push(`listIssues:${repo}:all`);
        return repo === SOURCE_REPO ? [issue({ number: 1 }), issue({ number: 2, pull_request: { url: "https://api.github.com/pr" } })] : [];
      },
    });

    const result = await runMirrorCli(["--dry-run"], { publicReader: client, wait: async () => {} });

    expect(result.report.sourceIssueEndpointItems).toBe(2);
    expect(result.report.sourcePullRequestItemsExcluded).toBe(1);
    expect(result.report.sourceNonPrIssues).toBe(1);
  });

  it("reports sanitization counts from source issue bodies during dry-run", async () => {
    const client = fakeClient({
      async listIssues(repo) {
        client.calls.push(`listIssues:${repo}:all`);
        return repo === SOURCE_REPO
          ? [issue({ body: "Ping @alice, fixes #1, resolves GH-2, closes rohitg00/agentmemory#3." })]
          : [];
      },
    });

    const result = await runMirrorCli(["--dry-run"], { publicReader: client, wait: async () => {} });

    expect(result.report.sanitizationCountsAvailable).toBe(true);
    expect(result.report.sanitizationCounts).toEqual({
      mentions: 1,
      references: 3,
      closingKeywords: 3,
    });
  });

  it("counts sanitizations in comment bodies with sanitizer-compatible categories", () => {
    expect(countSanitizations("Hi @org/team, fixes #123 and resolves GH-456; closes rohitg00/agentmemory#789.")).toEqual({
      mentions: 1,
      references: 3,
      closingKeywords: 3,
    });
  });

  it("flattens gh api --paginate --slurp pages", () => {
    expect(flattenGhSlurpPages<{ id: number }>([[{ id: 1 }], [{ id: 2 }, { id: 3 }]])).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(() => flattenGhSlurpPages([{ id: 1 }])).toThrow("Expected each gh api --slurp page to be an array.");
  });

  it("builds gh write argv with raw fields for source-derived strings", () => {
    const createLabel = buildGhCreateLabelArgs(TARGET_REPO, { name: "@team", color: "123456", description: "@description-file" });
    const createIssue = buildGhCreateIssueArgs(TARGET_REPO, {
      title: "@secret",
      body: "@file\nmultiline",
      labels: ["123", "@team"],
    });
    const updateIssue = buildGhUpdateIssueRequest(TARGET_REPO, 12, {
      title: "@secret",
      body: "@file\nmultiline",
      labels: ["123", "@team"],
      state: "closed",
    });
    const createComment = buildGhCreateCommentArgs(TARGET_REPO, 12, "@comment-file\nsecond line");

    for (const args of [createLabel, createIssue, updateIssue.args, createComment]) {
      expect(args).not.toContain("--field");
    }
    expect(createLabel).toEqual([
      "api",
      `/repos/${TARGET_REPO}/labels`,
      "--method",
      "POST",
      "--raw-field",
      "name=@team",
      "--raw-field",
      "color=123456",
      "--raw-field",
      "description=@description-file",
    ]);
    expect(createIssue).toEqual([
      "api",
      `/repos/${TARGET_REPO}/issues`,
      "--method",
      "POST",
      "--raw-field",
      "title=@secret",
      "--raw-field",
      "body=@file\nmultiline",
      "--raw-field",
      "labels[]=123",
      "--raw-field",
      "labels[]=@team",
    ]);
    expect(updateIssue).toEqual({
      args: ["api", `/repos/${TARGET_REPO}/issues/12`, "--method", "PATCH", "--input", "-"],
      input: JSON.stringify({
        title: "@secret",
        body: "@file\nmultiline",
        state: "closed",
        labels: ["123", "@team"],
      }),
    });
    expect(createComment).toEqual([
      "api",
      `/repos/${TARGET_REPO}/issues/12/comments`,
      "--method",
      "POST",
      "--raw-field",
      "body=@comment-file\nsecond line",
    ]);
  });

  it("builds update gh payloads that explicitly clear labels", () => {
    const updateIssue = buildGhUpdateIssueRequest(TARGET_REPO, 12, { labels: [] });

    expect(updateIssue.args).toEqual(["api", `/repos/${TARGET_REPO}/issues/12`, "--method", "PATCH", "--input", "-"]);
    expect(JSON.parse(updateIssue.input)).toEqual({ labels: [] });
    expect(buildGhUpdateIssueArgs(TARGET_REPO, 12, { labels: [] })).toEqual(updateIssue.args);
    expect(updateIssue.args).not.toContain("--field");
  });

  it("classifies public rate-limit responses as stop conditions without retry loops", async () => {
    const calls: string[] = [];
    const fetchImpl = async () => {
      calls.push("fetch");
      return {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers({ "x-ratelimit-remaining": "0", "retry-after": "45" }),
        text: async () => "API rate limit exceeded",
      } as Response;
    };
    const reader = createPublicGitHubReader(fetchImpl);

    await expect(reader.listIssues(SOURCE_REPO, "all")).rejects.toMatchObject({
      operation: `GET /repos/${SOURCE_REPO}/issues?state=all&per_page=100`,
      retryAfterSeconds: 45,
    });
    expect(calls).toEqual(["fetch"]);
  });

  it("records rate-limit stops in the report", async () => {
    const client = fakeClient({
      async listIssues() {
        throw new RateLimitStopError("GET /repos/rohitg00/agentmemory/issues?state=all&per_page=100", 30, "rate limited");
      },
    });

    const result = await runMirrorCli(["--dry-run"], { publicReader: client, wait: async () => {} });

    expect(result.exitCode).toBe(2);
    expect(result.report.rateLimitStop).toMatchObject({ retryAfterSeconds: 30, message: "rate limited" });
  });

  it("parses CLI defaults and confirmation flags", () => {
    expect(parseCliArgs([])).toMatchObject({
      source: SOURCE_REPO,
      target: TARGET_REPO,
      state: "all",
      mode: "dry-run",
      includeComments: false,
      readMode: "public-read",
    });
    expect(parseCliArgs(["--apply", "--read-with-gh", "--include-comments", "--report", "out.json"])).toMatchObject({
      mode: "apply",
      readMode: "read-with-gh",
      includeComments: true,
      reportPath: "out.json",
    });
    expect(parseCliArgs(["--write-delay-ms", "5000"])).toMatchObject({
      writeDelayMs: 5000,
    });
    expect(parseCliArgs(["--defer-comments"])).toMatchObject({
      deferComments: true,
    });
  });
});
