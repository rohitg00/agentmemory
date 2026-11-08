import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { resolveProject } from "../src/hooks/_project.js";

// The checkout directory is not necessarily named "agentmemory" — contributors clone
// into forks, worktrees and arbitrary paths — so the git-toplevel assertions run against
// a throwaway repo whose name we control instead of against process.cwd().
const REPO_NAME = "amem-fixture-repo";

describe("resolveProject — hook project basename resolver", () => {
  const originalEnv = process.env.AGENTMEMORY_PROJECT_NAME;

  let tmpRoot: string;
  let repoDir: string;
  let nestedDir: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "amem-project-"));
    repoDir = join(tmpRoot, REPO_NAME);
    nestedDir = join(repoDir, "src", "hooks");
    mkdirSync(nestedDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir, stdio: "ignore" });
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    delete process.env.AGENTMEMORY_PROJECT_NAME;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = originalEnv;
    }
  });

  it("AGENTMEMORY_PROJECT_NAME env wins over everything", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "my-override";
    expect(resolveProject("/var/log")).toBe("my-override");
    expect(resolveProject(repoDir)).toBe("my-override");
  });

  it("trims whitespace on env override", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "  spaced  ";
    expect(resolveProject("/var/log")).toBe("spaced");
  });

  it("ignores empty env override", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "   ";
    expect(resolveProject(repoDir)).toBe(REPO_NAME);
  });

  it("returns git toplevel basename when cwd is inside a repo", () => {
    expect(resolveProject(repoDir)).toBe(REPO_NAME);
  });

  it("returns git toplevel basename from a nested subdir", () => {
    expect(resolveProject(nestedDir)).toBe(REPO_NAME);
  });

  it("falls back to basename(cwd) when not in a git repo", () => {
    // mkdtemp lands under os.tmpdir(), which is not always outside a repository —
    // TMPDIR pointed at a working directory makes git walk up and find one, and the
    // fallback under test never runs. Ceiling the upward search at the parent so the
    // directory is genuinely repo-less. The ceiling must be a resolved path: git
    // compares it after resolving symlinks, and on macOS tmpdir() is one.
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "amem-noproj-")));
    const priorCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = dirname(dir);
    try {
      expect(resolveProject(dir)).toBe(basename(dir));
    } finally {
      if (priorCeiling === undefined) {
        delete process.env.GIT_CEILING_DIRECTORIES;
      } else {
        process.env.GIT_CEILING_DIRECTORIES = priorCeiling;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to process.cwd() when no cwd argument given", () => {
    vi.spyOn(process, "cwd").mockReturnValue(repoDir);
    expect(resolveProject()).toBe(REPO_NAME);
  });

  it("defaults to process.cwd() when cwd argument is empty", () => {
    vi.spyOn(process, "cwd").mockReturnValue(repoDir);
    expect(resolveProject("")).toBe(REPO_NAME);
    expect(resolveProject("   ")).toBe(REPO_NAME);
  });
});

describe("resolveProject — linked worktrees", () => {
  const originalEnv = process.env.AGENTMEMORY_PROJECT_NAME;
  const MAIN_NAME = "amem-fixture-main";

  let tmpRoot: string;
  let mainDir: string;
  let worktreeDir: string;

  function git(cwd: string, ...args: string[]): void {
    execFileSync(
      "git",
      [
        "-c", "user.name=amem",
        "-c", "user.email=amem@example.invalid",
        "-c", "commit.gpgsign=false",
        "-c", "protocol.file.allow=always",
        ...args,
      ],
      { cwd, stdio: "ignore" },
    );
  }

  function initRepo(dir: string): void {
    mkdirSync(dir, { recursive: true });
    git(dir, "init", "--quiet");
    git(dir, "commit", "--quiet", "--allow-empty", "--no-verify", "-m", "init");
  }

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "amem-worktree-"));
    mainDir = join(tmpRoot, MAIN_NAME);
    initRepo(mainDir);
    worktreeDir = join(tmpRoot, "feature-branch");
    git(mainDir, "worktree", "add", "-b", "feature-branch", worktreeDir);
    mkdirSync(join(worktreeDir, "src", "deep"), { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    delete process.env.AGENTMEMORY_PROJECT_NAME;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = originalEnv;
    }
  });

  it("names a linked worktree after its main checkout", () => {
    expect(resolveProject(worktreeDir)).toBe(MAIN_NAME);
  });

  it("names a subdirectory of a linked worktree after its main checkout", () => {
    expect(resolveProject(join(worktreeDir, "src", "deep"))).toBe(MAIN_NAME);
  });

  it("keeps the main checkout's own name", () => {
    expect(resolveProject(mainDir)).toBe(MAIN_NAME);
  });

  it("keeps a submodule's own name instead of its superproject's module store", () => {
    const lib = join(tmpRoot, "amem-fixture-lib");
    const superproject = join(tmpRoot, "amem-fixture-super");
    initRepo(lib);
    initRepo(superproject);
    git(superproject, "submodule", "--quiet", "add", lib, "vendor/lib");
    expect(resolveProject(join(superproject, "vendor", "lib"))).toBe("lib");
  });

  it("resolves a symlink into a repository subdirectory to the repository name", () => {
    const nested = join(mainDir, "pkg", "core");
    mkdirSync(nested, { recursive: true });
    const link = join(tmpRoot, "shortcut");
    symlinkSync(nested, link);
    expect(resolveProject(link)).toBe(MAIN_NAME);
  });
});
