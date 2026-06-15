import { describe, expect, it } from "vitest";

import {
  activeSourceReferenceCount,
  neutralizeGithubCrossReferences,
  planCrossReferenceNeutralization,
} from "../scripts/github/github-cross-reference-neutralizer.js";
import {
  parseCliArgs,
  runCrossReferenceNeutralizer,
  type CrossReferenceNeutralizerClient,
} from "../scripts/github/neutralize-github-cross-references.js";

describe("GitHub cross-reference neutralizer", () => {
  it("rewrites old issue and PR markers plus source URLs without changing unrelated text", () => {
    const input = [
      "<!-- upstream-issue: rohitg00/agentmemory#42 -->",
      "<!-- upstream-pr: rohitg00/agentmemory#904 -->",
      "Source: https://github.com/rohitg00/agentmemory/issues/42",
      "Source: https://github.com/rohitg00/agentmemory/pull/904",
      "Source comment: https://github.com/rohitg00/agentmemory/issues/42#issuecomment-9001",
      "Related source rohitg00/agentmemory#123 but keep target wbugitlab1/agentmemory#5 alone.",
    ].join("\n");

    const result = neutralizeGithubCrossReferences(input, "rohitg00/agentmemory");

    expect(result.changed).toBe(true);
    expect(result.text).toContain("<!-- upstream-issue-neutral: source=rohitg00/agentmemory number=42 -->");
    expect(result.text).toContain("<!-- upstream-pr-neutral: source=rohitg00/agentmemory number=904 -->");
    expect(result.text).toContain("Source issue number: 42");
    expect(result.text).toContain("Source pull request number: 904");
    expect(result.text).toContain("Source comment id: 9001");
    expect(result.text).toContain("source=rohitg00/agentmemory number=123");
    expect(result.text).toContain("wbugitlab1/agentmemory#5");
    expect(activeSourceReferenceCount(result.text, "rohitg00/agentmemory")).toBe(0);
  });

  it("plans issue and comment updates without creating or deleting issues", () => {
    const plan = planCrossReferenceNeutralization({
      sourceRepo: "rohitg00/agentmemory",
      issues: [
        {
          number: 393,
          body: "<!-- upstream-pr: rohitg00/agentmemory#904 -->\nSource: https://github.com/rohitg00/agentmemory/pull/904",
          comments: [
            {
              id: 1,
              body: "Source comment: https://github.com/rohitg00/agentmemory/issues/42#issuecomment-9001",
            },
          ],
        },
        { number: 394, body: "already neutral", comments: [] },
      ],
    });

    expect(plan.issueUpdates).toHaveLength(1);
    expect(plan.issueUpdates[0]).toEqual(expect.objectContaining({ issueNumber: 393 }));
    expect(plan.commentUpdates).toHaveLength(1);
    expect(plan.commentUpdates[0]).toEqual(expect.objectContaining({ issueNumber: 393, commentId: 1 }));
    expect(plan.issueUpdates[0].after).not.toContain("github.com/rohitg00/agentmemory");
    expect(plan.commentUpdates[0].after).not.toContain("github.com/rohitg00/agentmemory");
  });

  it("parses CLI gates for dry-run, apply, and verify", () => {
    expect(parseCliArgs(["--dry-run"]).mode).toBe("dry-run");
    expect(parseCliArgs(["--verify", "--confirm-credentialed-reads"]).mode).toBe("verify");
    expect(() => parseCliArgs(["--apply", "--confirm-credentialed-reads"])).toThrow("--apply requires --confirm-remote-writes");
    expect(parseCliArgs(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes", "--write-delay-ms", "5"]).writeDelayMs).toBe(5);
  });

  it("dry-runs and applies only issue/comment body updates", async () => {
    const client = fakeNeutralizerClient();

    const dryRun = await runCrossReferenceNeutralizer(["--dry-run", "--confirm-credentialed-reads"], {
      client,
      writeReport: async () => {},
      wait: async () => {},
    });
    expect(dryRun.exitCode).toBe(0);
    expect(dryRun.report.issueUpdateCount).toBe(1);
    expect(dryRun.report.commentUpdateCount).toBe(1);
    expect(client.calls).toEqual(["listIssues:wbugitlab1/agentmemory", "listComments:wbugitlab1/agentmemory:393"]);

    const apply = await runCrossReferenceNeutralizer(["--apply", "--confirm-credentialed-reads", "--confirm-remote-writes"], {
      client,
      writeReport: async () => {},
      wait: async () => {},
    });
    expect(apply.exitCode).toBe(0);
    expect(client.calls).toContain("updateIssue:wbugitlab1/agentmemory:393");
    expect(client.calls).toContain("updateComment:wbugitlab1/agentmemory:1");
    expect(client.issues[0].body).not.toContain("github.com/rohitg00/agentmemory");
    expect(client.comments.get(393)?.[0].body).not.toContain("rohitg00/agentmemory#42");
  });
});

function fakeNeutralizerClient(): CrossReferenceNeutralizerClient & {
  calls: string[];
  issues: Array<{ number: number; body: string | null; comments: number; pull_request?: unknown }>;
  comments: Map<number, Array<{ id: number; body: string | null }>>;
} {
  const calls: string[] = [];
  const issues = [
    {
      number: 393,
      body: "<!-- upstream-pr: rohitg00/agentmemory#904 -->\nSource: https://github.com/rohitg00/agentmemory/pull/904",
      comments: 1,
    },
    { number: 394, body: "already neutral", comments: 0 },
  ];
  const comments = new Map([[393, [{ id: 1, body: "Source comment: https://github.com/rohitg00/agentmemory/issues/42#issuecomment-9001" }]]]);

  return {
    calls,
    issues,
    comments,
    async listIssues(repo) {
      calls.push(`listIssues:${repo}`);
      return issues;
    },
    async listComments(repo, issueNumber) {
      calls.push(`listComments:${repo}:${issueNumber}`);
      return comments.get(issueNumber) ?? [];
    },
    async updateIssue(repo, issueNumber, body) {
      calls.push(`updateIssue:${repo}:${issueNumber}`);
      const issue = issues.find((candidate) => candidate.number === issueNumber);
      if (!issue) throw new Error(`missing issue ${issueNumber}`);
      issue.body = body;
    },
    async updateComment(repo, commentId, body) {
      calls.push(`updateComment:${repo}:${commentId}`);
      for (const issueComments of comments.values()) {
        const comment = issueComments.find((candidate) => candidate.id === commentId);
        if (comment) comment.body = body;
      }
    },
  };
}
