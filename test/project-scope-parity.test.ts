import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
// @ts-expect-error plain .mjs module without type declarations
import { FilesystemWatcher } from "../integrations/filesystem-watcher/watcher.mjs";
import { parseJsonlText } from "../src/replay/jsonl-parser.js";
// @ts-expect-error plain .mjs module without type declarations
import { configFromEnv } from "../integrations/filesystem-watcher/watcher.mjs";

// Project-scope parity: every capture surface must resolve `project` the same
// way the hooks do (env override, git toplevel basename, cwd basename), or the
// same repo fragments into per-agent memory buckets that never cross-recall.

function transcriptLine(cwd: string): string {
  return JSON.stringify({
    type: "user",
    uuid: "u1",
    sessionId: "sess-parity",
    timestamp: "2026-08-01T10:00:00.000Z",
    cwd,
    message: { role: "user", content: [{ type: "text", text: "hello" }] },
  });
}

describe("replay deriveProject (via parseJsonlText)", () => {
  it("uses the basename of a posix cwd", () => {
    const parsed = parseJsonlText(transcriptLine("/home/dev/myrepo"));
    expect(parsed.project).toBe("myrepo");
  });

  it("uses the basename of a Windows cwd instead of the whole raw path", () => {
    const parsed = parseJsonlText(transcriptLine("C:\\Users\\dev\\myrepo"));
    expect(parsed.project).toBe("myrepo");
  });

  it("handles mixed separators", () => {
    const parsed = parseJsonlText(transcriptLine("C:\\Users\\dev/myrepo"));
    expect(parsed.project).toBe("myrepo");
  });
});

describe("git-toplevel resolution parity", () => {
  let tmpRoot: string;
  let repoDir: string;
  let nestedDir: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "amem-parity-"));
    repoDir = join(tmpRoot, "parity-fixture-repo");
    nestedDir = join(repoDir, "packages", "core");
    mkdirSync(nestedDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir, stdio: "ignore" });
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("replay resolves a locally-present subdirectory cwd to the repo basename", () => {
    const parsed = parseJsonlText(transcriptLine(nestedDir));
    expect(parsed.project).toBe("parity-fixture-repo");
  });

  it("replay falls back to the basename for a cwd that no longer exists", () => {
    const parsed = parseJsonlText(transcriptLine(join(tmpRoot, "gone", "old-checkout")));
    expect(parsed.project).toBe("old-checkout");
  });

  it("watcher derives the repo basename when watching a subdirectory", () => {
    const w = new FilesystemWatcher({
      roots: [nestedDir],
      baseUrl: "http://localhost:3111",
      logger: {},
    });
    expect(w.project).toBe("parity-fixture-repo");
  });

  it("multi-root watcher stamps each event with its own root's project", async () => {
    const { writeFileSync } = await import("node:fs");
    const repoB = join(tmpRoot, "second-fixture-repo");
    mkdirSync(repoB, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repoB, stdio: "ignore" });
    writeFileSync(join(repoDir, "a.txt"), "alpha", "utf8");
    writeFileSync(join(repoB, "b.txt"), "beta", "utf8");

    const calls: Array<{ project: unknown; cwd: unknown }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}");
      calls.push({ project: body.project, cwd: body.cwd });
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch;
    try {
      const w = new FilesystemWatcher({
        roots: [repoDir, repoB],
        baseUrl: "http://localhost:3111",
        logger: {},
      });
      await w.flush(w.roots[0], "a.txt");
      await w.flush(w.roots[1], "b.txt");
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(calls).toHaveLength(2);
    expect(calls[0].project).toBe("parity-fixture-repo");
    expect(calls[1].project).toBe("second-fixture-repo");
  });

  it("watcher falls back to the root basename outside a repository", () => {
    const plain = join(tmpRoot, "plain-dir");
    mkdirSync(plain, { recursive: true });
    const w = new FilesystemWatcher({
      roots: [plain],
      baseUrl: "http://localhost:3111",
      logger: {},
    });
    expect(w.project).toBe("plain-dir");
  });
});

describe("fs-watcher configFromEnv project override", () => {
  it("prefers the canonical AGENTMEMORY_PROJECT_NAME", () => {
    const cfg = configFromEnv({
      AGENTMEMORY_FS_WATCH: "/tmp",
      AGENTMEMORY_PROJECT_NAME: "canonical-name",
      AGENTMEMORY_PROJECT: "legacy-name",
    });
    expect(cfg.project).toBe("canonical-name");
  });

  it("falls back to the deprecated AGENTMEMORY_PROJECT alias", () => {
    const cfg = configFromEnv({
      AGENTMEMORY_FS_WATCH: "/tmp",
      AGENTMEMORY_PROJECT: "legacy-name",
    });
    expect(cfg.project).toBe("legacy-name");
  });

  it("is null when neither is set (watcher derives from the root basename)", () => {
    const cfg = configFromEnv({ AGENTMEMORY_FS_WATCH: "/tmp" });
    expect(cfg.project).toBeNull();
  });

  it("trims values and treats whitespace-only as unset, like resolveProject", () => {
    expect(
      configFromEnv({
        AGENTMEMORY_FS_WATCH: "/tmp",
        AGENTMEMORY_PROJECT_NAME: "  padded  ",
      }).project,
    ).toBe("padded");
    expect(
      configFromEnv({
        AGENTMEMORY_FS_WATCH: "/tmp",
        AGENTMEMORY_PROJECT_NAME: "   ",
        AGENTMEMORY_PROJECT: "legacy-name",
      }).project,
    ).toBe("legacy-name");
    expect(
      configFromEnv({
        AGENTMEMORY_FS_WATCH: "/tmp",
        AGENTMEMORY_PROJECT_NAME: "   ",
        AGENTMEMORY_PROJECT: "  ",
      }).project,
    ).toBeNull();
  });
});
