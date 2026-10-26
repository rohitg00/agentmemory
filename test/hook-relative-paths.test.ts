import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { relativizePaths, repositoryRoots } from "../src/hooks/_relative-paths.js";

describe("relativizePaths", () => {
  const roots = [
    { from: "/work/app/.claude/worktrees/fix", to: "" },
    { from: "/work/app", to: "" },
  ];

  it("strips the root from a file path", () => {
    expect(relativizePaths({ file_path: "/work/app/src/a.ts" }, roots)).toEqual({ file_path: "src/a.ts" });
  });

  it("strips a nested worktree before the checkout that contains it", () => {
    expect(relativizePaths("/work/app/.claude/worktrees/fix/src/a.ts", roots)).toBe("src/a.ts");
  });

  it("rewrites every occurrence inside free text", () => {
    expect(relativizePaths("cd /work/app && cat /work/app/README.md", roots)).toBe("cd . && cat README.md");
  });

  it("leaves a sibling directory that shares the root as a prefix", () => {
    expect(relativizePaths("/work/app-old/src/a.ts", roots)).toBe("/work/app-old/src/a.ts");
  });

  it("leaves a path that only contains the root further in", () => {
    expect(relativizePaths("/mnt/work/app/src/a.ts", roots)).toBe("/mnt/work/app/src/a.ts");
  });

  it("walks arrays and nested objects and keeps other values", () => {
    expect(
      relativizePaths({ edits: [{ path: "/work/app/x.ts", line: 3 }], ok: true, none: null }, roots),
    ).toEqual({ edits: [{ path: "x.ts", line: 3 }], ok: true, none: null });
  });

  it("maps an alias onto its path inside the repository", () => {
    const aliases = [{ from: "/links/sub", to: "packages/sub" }];
    expect(relativizePaths("cat /links/sub/a.ts /links/sub", aliases)).toBe("cat packages/sub/a.ts packages/sub");
  });

  it("matches Windows roots in any case and writes forward slashes", () => {
    const aliases = [{ from: "C:\\work\\app", to: "" }];
    expect(relativizePaths("c:\\Work\\App\\src\\a.ts", aliases, true)).toBe("src/a.ts");
    expect(relativizePaths("type C:\\work\\app\\x.ts", aliases, true)).toBe("type x.ts");
  });

  it("keeps a POSIX path's case and backslashes", () => {
    expect(relativizePaths("/work/app/my\\ file.ts /Work/App/x", roots, false)).toBe("my\\ file.ts /Work/App/x");
  });

  it("returns the value untouched when there are no roots", () => {
    const value = { file_path: "/work/app/src/a.ts" };
    expect(relativizePaths(value, [])).toBe(value);
  });
});

describe("repositoryRoots", () => {
  let tmpRoot: string;
  let repoDir: string;
  let worktreeDir: string;
  let linkDir: string;
  let subLinkDir: string;
  let newlineWorktreeDir: string;
  const froms = (cwd: string) => repositoryRoots(cwd).map((alias) => alias.from).filter((from) => from !== newlineWorktreeDir);

  beforeAll(() => {
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), "amem-roots-")));
    repoDir = join(tmpRoot, "repo");
    worktreeDir = join(repoDir, ".claude", "worktrees", "fix");
    linkDir = join(tmpRoot, "linked");
    mkdirSync(repoDir, { recursive: true });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repoDir, stdio: "ignore" });
    git("init", "--quiet");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "--allow-empty", "-m", "init");
    mkdirSync(dirname(worktreeDir), { recursive: true });
    git("worktree", "add", "--quiet", "-b", "fix", worktreeDir);
    symlinkSync(repoDir, linkDir);
    mkdirSync(join(repoDir, "packages", "sub"), { recursive: true });
    subLinkDir = join(tmpRoot, "sub-link");
    symlinkSync(join(repoDir, "packages", "sub"), subLinkDir);
    newlineWorktreeDir = join(tmpRoot, "odd\nname");
    git("worktree", "add", "--quiet", "-b", "odd", newlineWorktreeDir);
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("lists every worktree, longest first, from inside the main checkout", () => {
    expect(froms(repoDir)).toEqual([worktreeDir, repoDir]);
  });

  it("lists the same roots from inside a worktree", () => {
    expect(froms(worktreeDir)).toEqual([worktreeDir, repoDir]);
  });

  it("adds the symlinked spelling cwd was reached through", () => {
    expect(repositoryRoots(linkDir)).toContainEqual({ from: linkDir, to: "" });
  });

  it("maps a symlink to a subdirectory onto that subdirectory", () => {
    expect(repositoryRoots(subLinkDir)).toContainEqual({ from: subLinkDir, to: join("packages", "sub") });
  });

  it("reads a worktree path that contains a newline", () => {
    expect(repositoryRoots(repoDir)).toContainEqual({ from: newlineWorktreeDir, to: "" });
  });

  it("returns nothing outside a repository", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "amem-noroots-")));
    vi.stubEnv("GIT_CEILING_DIRECTORIES", dirname(dir));
    try {
      expect(repositoryRoots(dir)).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("captureObservation with AGENTMEMORY_RELATIVE_PATHS", () => {
  let tmpRoot: string;
  let repoDir: string;

  beforeAll(() => {
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), "amem-capture-rel-")));
    repoDir = join(tmpRoot, "repo");
    mkdirSync(repoDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir, stdio: "ignore" });
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function sentBody(flag: string | undefined): Promise<Record<string, unknown>> {
    vi.stubEnv("AGENTMEMORY_RELATIVE_PATHS", flag);
    vi.stubEnv("AGENTMEMORY_CAPTURE_SPOOL_DIR", join(tmpRoot, "spool"));
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { captureObservation } = await import("../src/hooks/_capture.js");
    await captureObservation(
      {
        hookType: "post_tool_use",
        sessionId: "ses_rel",
        project: "repo",
        cwd: repoDir,
        timestamp: new Date().toISOString(),
        data: { tool_name: "Read", tool_input: { file_path: join(repoDir, "src", "a.ts") } },
      },
      1000,
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    return JSON.parse(String(init?.body));
  }

  it("sends repository-relative paths when enabled, and keeps cwd as it is", async () => {
    const body = await sentBody("true");
    expect(body.data).toEqual({ tool_name: "Read", tool_input: { file_path: "src/a.ts" } });
    expect(body.cwd).toBe(repoDir);
  });

  it("sends absolute paths by default", async () => {
    const body = await sentBody(undefined);
    expect(body.data).toEqual({ tool_name: "Read", tool_input: { file_path: join(repoDir, "src", "a.ts") } });
  });
});
