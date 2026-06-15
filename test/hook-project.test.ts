import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { resolveCwd, resolveProject } from "../src/hooks/_project.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function initRepo(dir: string): void {
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "agentmemory-test@example.com"]);
  git(dir, ["config", "user.name", "agentmemory test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-m", "initial"]);
}

function canonicalProjectForGitCwd(cwd: string): string {
  const commonDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const realCommonDir = realpathSync(commonDir);
  const root = basename(realCommonDir) === ".git"
    ? realpathSync(dirname(realCommonDir))
    : realCommonDir;
  return `git:${createHash("sha256").update(root).digest("hex").slice(0, 32)}`;
}

describe("resolveProject — canonical project resolver", () => {
  const originalProjectId = process.env.AGENTMEMORY_PROJECT_ID;
  const originalProjectName = process.env.AGENTMEMORY_PROJECT_NAME;

  beforeEach(() => {
    delete process.env.AGENTMEMORY_PROJECT_ID;
    delete process.env.AGENTMEMORY_PROJECT_NAME;
  });

  afterEach(() => {
    if (originalProjectId === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_ID;
    } else {
      process.env.AGENTMEMORY_PROJECT_ID = originalProjectId;
    }
    if (originalProjectName === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = originalProjectName;
    }
  });

  it("AGENTMEMORY_PROJECT_ID env wins over everything", () => {
    process.env.AGENTMEMORY_PROJECT_ID = "knowledge-work";
    process.env.AGENTMEMORY_PROJECT_NAME = "legacy-name";

    expect(resolveProject("/var/log")).toBe("knowledge-work");
    expect(resolveProject(process.cwd())).toBe("knowledge-work");
  });

  it("AGENTMEMORY_PROJECT_NAME remains a backward-compatible override", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "my-override";

    expect(resolveProject("/var/log")).toBe("my-override");
    expect(resolveProject(process.cwd())).toBe("my-override");
  });

  it("trims whitespace on env overrides", () => {
    process.env.AGENTMEMORY_PROJECT_ID = "  scoped-project  ";
    expect(resolveProject("/var/log")).toBe("scoped-project");

    delete process.env.AGENTMEMORY_PROJECT_ID;
    process.env.AGENTMEMORY_PROJECT_NAME = "  legacy-scope  ";
    expect(resolveProject("/var/log")).toBe("legacy-scope");
  });

  it("ignores empty env overrides", () => {
    process.env.AGENTMEMORY_PROJECT_ID = "   ";
    process.env.AGENTMEMORY_PROJECT_NAME = "   ";

    expect(resolveProject(process.cwd())).toBe(canonicalProjectForGitCwd(process.cwd()));
  });

  it("returns canonical git common-dir parent when cwd is inside a repo", () => {
    const project = resolveProject(process.cwd());
    expect(project).toBe(canonicalProjectForGitCwd(process.cwd()));
    expect(project).toMatch(/^git:[a-f0-9]{32}$/);
    expect(project).not.toContain(process.cwd());
  });

  it("returns the same canonical project from a nested subdir", () => {
    const nested = join(process.cwd(), "src", "hooks");

    expect(resolveProject(nested)).toBe(canonicalProjectForGitCwd(process.cwd()));
  });

  it("linked worktrees share the parent repository project id", () => {
    const parent = mkdtempSync(join(tmpdir(), "amem-parent-"));
    const linkedParent = mkdtempSync(join(tmpdir(), "amem-linked-container-"));
    const linked = join(linkedParent, "same-name");

    try {
      initRepo(parent);
      git(parent, ["worktree", "add", "-b", "feature/test", linked]);

      const expected = canonicalProjectForGitCwd(parent);
      expect(resolveProject(parent)).toBe(expected);
      expect(resolveProject(linked)).toBe(expected);
    } finally {
      rmSync(linkedParent, { recursive: true, force: true });
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("unrelated repos with the same basename do not share a project id", () => {
    const rootA = mkdtempSync(join(tmpdir(), "amem-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "amem-b-"));
    const repoA = join(rootA, "same-name");
    const repoB = join(rootB, "same-name");

    try {
      mkdirSync(repoA);
      mkdirSync(repoB);
      initRepo(repoA);
      initRepo(repoB);

      expect(resolveProject(repoA)).toBe(canonicalProjectForGitCwd(repoA));
      expect(resolveProject(repoB)).toBe(canonicalProjectForGitCwd(repoB));
      expect(resolveProject(repoA)).not.toBe(resolveProject(repoB));
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  });

  it("falls back to basename(cwd) when not in a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "amem-noproj-"));
    try {
      expect(resolveProject(dir)).toBe(basename(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to process.cwd() when no cwd argument given", () => {
    expect(resolveProject()).toBe(canonicalProjectForGitCwd(process.cwd()));
  });

  it("defaults to process.cwd() when cwd argument is empty", () => {
    expect(resolveProject("")).toBe(canonicalProjectForGitCwd(process.cwd()));
    expect(resolveProject("   ")).toBe(canonicalProjectForGitCwd(process.cwd()));
  });

  it("preserves non-empty cwd strings exactly", () => {
    const cwd = join(tmpdir(), " amem-spaced-project ");

    expect(resolveCwd(cwd)).toBe(cwd);
    expect(resolveCwd("   ")).toBe(process.cwd());
  });

  it("defaults to process.cwd() when cwd argument is not a string", () => {
    const expected = canonicalProjectForGitCwd(process.cwd());

    expect(resolveProject({ path: process.cwd() })).toBe(expected);
    expect(resolveProject(42)).toBe(expected);
  });

  it("does not require the fallback directory to exist", () => {
    const missing = join(tmpdir(), "amem-missing-project-dir");
    if (existsSync(missing)) rmSync(missing, { recursive: true, force: true });

    expect(resolveProject(missing)).toBe("amem-missing-project-dir");
  });
});
