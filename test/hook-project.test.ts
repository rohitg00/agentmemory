import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { resolveProject, normalizeGitRemote } from "../src/hooks/_project.js";

// The checkout directory is not necessarily named "agentmemory" — contributors clone
// into forks, worktrees and arbitrary paths — so the git-toplevel assertions run against
// a throwaway repo whose name we control instead of against process.cwd().
const REPO_NAME = "amem-fixture-repo";
// Fixture for the opt-in git-remote identity mode: a repo whose remote we set
// ourselves, so the expected identity is fixed rather than inherited from the
// contributor's own checkout.
const REMOTE_REPO_NAME = "amem-remote-repo";
const FIXTURE_REMOTE_URL = "https://github.com/devon3000/amem-remote-repo.git";
const FIXTURE_REMOTE_IDENTITY = "github.com/devon3000/amem-remote-repo";

describe("resolveProject — hook project basename resolver", () => {
  const originalEnv = process.env.AGENTMEMORY_PROJECT_NAME;
  const originalRemoteFlag = process.env.AGENTMEMORY_PROJECT_FROM_REMOTE;

  let tmpRoot: string;
  let repoDir: string;
  let nestedDir: string;
  // A repo with a known remote, so remote-mode assertions are deterministic
  // instead of reading whatever remote the current checkout happens to have.
  let remoteRepoDir: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "amem-project-"));
    repoDir = join(tmpRoot, REPO_NAME);
    nestedDir = join(repoDir, "src", "hooks");
    mkdirSync(nestedDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir, stdio: "ignore" });

    remoteRepoDir = join(tmpRoot, REMOTE_REPO_NAME);
    mkdirSync(remoteRepoDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: remoteRepoDir, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", FIXTURE_REMOTE_URL], {
      cwd: remoteRepoDir,
      stdio: "ignore",
    });
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    delete process.env.AGENTMEMORY_PROJECT_NAME;
    delete process.env.AGENTMEMORY_PROJECT_FROM_REMOTE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = originalEnv;
    }
    if (originalRemoteFlag === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_FROM_REMOTE;
    } else {
      process.env.AGENTMEMORY_PROJECT_FROM_REMOTE = originalRemoteFlag;
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

  it("ignores the remote flag by default (basename behavior unchanged)", () => {
    // Flag unset -> still basename even though this repo has a remote.
    expect(resolveProject(remoteRepoDir)).toBe(REMOTE_REPO_NAME);
  });

  it("uses git remote identity when AGENTMEMORY_PROJECT_FROM_REMOTE is set", () => {
    process.env.AGENTMEMORY_PROJECT_FROM_REMOTE = "1";
    expect(resolveProject(remoteRepoDir)).toBe(FIXTURE_REMOTE_IDENTITY);
  });

  it("remote mode falls back to basename for a repo with no remote", () => {
    process.env.AGENTMEMORY_PROJECT_FROM_REMOTE = "1";
    expect(resolveProject(repoDir)).toBe(REPO_NAME);
  });

  it("env override still wins over remote mode", () => {
    process.env.AGENTMEMORY_PROJECT_FROM_REMOTE = "1";
    process.env.AGENTMEMORY_PROJECT_NAME = "explicit";
    expect(resolveProject(remoteRepoDir)).toBe("explicit");
  });
});

describe("normalizeGitRemote — git URL -> host/org/repo", () => {
  it("https with .git", () => {
    expect(normalizeGitRemote("https://github.com/devon3000/chessboard.git")).toBe(
      "github.com/devon3000/chessboard",
    );
  });

  it("https without .git", () => {
    expect(normalizeGitRemote("https://github.com/devon3000/chessboard")).toBe(
      "github.com/devon3000/chessboard",
    );
  });

  it("scp-style ssh", () => {
    expect(normalizeGitRemote("git@github.com:devon3000/chessboard.git")).toBe(
      "github.com/devon3000/chessboard",
    );
  });

  it("ssh:// url", () => {
    expect(normalizeGitRemote("ssh://git@github.com/devon3000/chessboard.git")).toBe(
      "github.com/devon3000/chessboard",
    );
  });

  it("git:// url", () => {
    expect(normalizeGitRemote("git://github.com/devon3000/chessboard.git")).toBe(
      "github.com/devon3000/chessboard",
    );
  });

  it("strips embedded credentials", () => {
    expect(
      normalizeGitRemote("https://user:token@github.com/devon3000/chessboard.git"),
    ).toBe("github.com/devon3000/chessboard");
  });

  it("lowercases host and drops port", () => {
    expect(normalizeGitRemote("https://GitHub.com:443/Org/Repo.git")).toBe(
      "github.com/org/repo",
    );
  });

  // #716 specifies the identity is lowercased end-to-end. Providers treat
  // owner/repo case-insensitively, so two clones of one repo whose remotes
  // differ only in case must land on the same project key.
  it("lowercases the owner/repo path, not just the host", () => {
    expect(normalizeGitRemote("git@github.com:Acme/Widgets.git")).toBe(
      "github.com/acme/widgets",
    );
    expect(normalizeGitRemote("https://github.com/Devon3000/Chessboard")).toBe(
      "github.com/devon3000/chessboard",
    );
  });

  it("case-variant remotes of the same repo resolve to one identity", () => {
    const variants = [
      "https://github.com/acme/widgets.git",
      "https://github.com/Acme/Widgets.git",
      "git@github.com:ACME/WIDGETS.git",
      "ssh://git@GitHub.com/Acme/widgets",
    ].map((u) => normalizeGitRemote(u));
    expect(new Set(variants).size).toBe(1);
    expect(variants[0]).toBe("github.com/acme/widgets");
  });

  it("handles nested groups (gitlab subgroups)", () => {
    expect(
      normalizeGitRemote("git@gitlab.com:group/subgroup/proj.git"),
    ).toBe("gitlab.com/group/subgroup/proj");
  });

  it("returns null for empty / unparseable input", () => {
    expect(normalizeGitRemote("")).toBeNull();
    expect(normalizeGitRemote(null)).toBeNull();
    expect(normalizeGitRemote("not-a-url")).toBeNull();
  });
});
