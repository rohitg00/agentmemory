import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  expandProjectAliases,
  resolveProjectIdentity,
  sessionMatchesProjectAliases,
} from "../src/functions/project-identity.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

describe("project identity", () => {
  it("canonicalizes git worktree sessions to the main repository root", async () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-project-"));
    const mainRepo = join(root, "repo");
    const worktree = join(root, "repo-feature");

    execFileSync("git", ["init", mainRepo], { stdio: "ignore" });
    git(mainRepo, ["config", "user.name", "AgentMemory Test"]);
    git(mainRepo, ["config", "user.email", "agentmemory@example.com"]);
    writeFileSync(join(mainRepo, "README.md"), "# test\n");
    git(mainRepo, ["add", "README.md"]);
    git(mainRepo, ["commit", "-m", "init"]);
    git(mainRepo, ["worktree", "add", "-b", "feature", worktree]);

    const identity = await resolveProjectIdentity({
      project: worktree,
      cwd: worktree,
    });

    const realMainRepo = realpathSync(mainRepo);

    expect(identity.project).toBe(realMainRepo);
    expect(identity.cwd).toBe(worktree);
    expect(identity.git?.isWorktree).toBe(true);
    expect(identity.aliases).toContain(realMainRepo);
    expect(identity.aliases).toContain(worktree);
    expect(identity.aliases).toContain("repo");
  });

  it("reuses a cached git identity when a later lookup fails under the same repo path", async () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-project-cache-"));
    const mainRepo = join(root, "repo");
    const worktree = join(root, "repo-feature");

    execFileSync("git", ["init", mainRepo], { stdio: "ignore" });
    git(mainRepo, ["config", "user.name", "AgentMemory Test"]);
    git(mainRepo, ["config", "user.email", "agentmemory@example.com"]);
    writeFileSync(join(mainRepo, "README.md"), "# test\n");
    git(mainRepo, ["add", "README.md"]);
    git(mainRepo, ["commit", "-m", "init"]);
    git(mainRepo, ["worktree", "add", "-b", "feature", worktree]);

    const identity = await resolveProjectIdentity({
      project: worktree,
      cwd: worktree,
    });
    const fallback = await resolveProjectIdentity({
      project: join(worktree, "missing-dir"),
      cwd: join(worktree, "missing-dir"),
    });

    expect(fallback.project).toBe(identity.project);
    expect(fallback.git?.mainRepoRoot).toBe(identity.git?.mainRepoRoot);
  });

  it("normalizes detached HEAD to a null branch name", async () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-project-detached-"));
    const mainRepo = join(root, "repo");

    execFileSync("git", ["init", mainRepo], { stdio: "ignore" });
    git(mainRepo, ["config", "user.name", "AgentMemory Test"]);
    git(mainRepo, ["config", "user.email", "agentmemory@example.com"]);
    writeFileSync(join(mainRepo, "README.md"), "# test\n");
    git(mainRepo, ["add", "README.md"]);
    git(mainRepo, ["commit", "-m", "init"]);
    const commit = git(mainRepo, ["rev-parse", "HEAD"]);
    git(mainRepo, ["checkout", commit]);

    const identity = await resolveProjectIdentity({
      project: mainRepo,
      cwd: mainRepo,
    });

    expect(identity.git?.branch).toBeNull();
  });

  it("matches sessions saved under project aliases and nested cwd paths", () => {
    const aliases = new Set(
      expandProjectAliases("/tmp/repo", "/tmp/repo-worktrees/feature"),
    );

    expect(
      sessionMatchesProjectAliases(
        {
          project: "/tmp/repo-worktrees/feature",
          cwd: "/tmp/repo-worktrees/feature/src",
        },
        aliases,
      ),
    ).toBe(true);

    expect(
      sessionMatchesProjectAliases(
        { project: "other", cwd: "/tmp/other/src" },
        aliases,
      ),
    ).toBe(false);
  });

  it("does not match unrelated path-like projects only by basename", () => {
    const aliases = new Set(expandProjectAliases("/tmp/team-a/app"));

    expect(
      sessionMatchesProjectAliases(
        { project: "/tmp/team-b/app", cwd: "/tmp/team-b/app" },
        aliases,
      ),
    ).toBe(false);

    expect(
      sessionMatchesProjectAliases(
        { project: "app", cwd: "/tmp/legacy/app" },
        aliases,
      ),
    ).toBe(true);
  });
});
