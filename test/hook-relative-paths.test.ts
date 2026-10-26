import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { relativizePaths, repositoryRoots } from "../src/hooks/_relative-paths.js";

describe("relativizePaths", () => {
  const roots = ["/work/app/.claude/worktrees/fix", "/work/app"];

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
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("lists every worktree, longest first, from inside the main checkout", () => {
    expect(repositoryRoots(repoDir)).toEqual([worktreeDir, repoDir]);
  });

  it("lists the same roots from inside a worktree", () => {
    expect(repositoryRoots(join(worktreeDir))).toEqual([worktreeDir, repoDir]);
  });

  it("adds the symlinked spelling cwd was reached through", () => {
    expect(repositoryRoots(linkDir)).toContain(linkDir);
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
    if (flag !== undefined) vi.stubEnv("AGENTMEMORY_RELATIVE_PATHS", flag);
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
