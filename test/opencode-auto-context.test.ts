import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

// OpenCode plugin needs zero-config memory injection. Plugin
// already wires experimental.chat.system.transform; this PR threads
// the /session/start context through a cache so injection happens
// without a second /context fetch and is documented as the
// SessionStart-equivalent behaviour.
describe("OpenCode plugin auto-context injection (#431)", () => {
  const plugin = readFileSync(
    "plugin/opencode/agentmemory-capture.ts",
    "utf-8",
  );

  it("captures context returned by POST /session/start", () => {
    expect(plugin).toMatch(/startContextCache\s*=\s*new Map<string,\s*string>/);
    expect(plugin).toMatch(
      /postJson\(["']\/session\/start["']/,
    );
    // Snapshot `activeSessionId` into a local before the await so the cached
    // context binds to the session that opened it, not a later one.
    expect(plugin).toMatch(
      /const\s+sessionId\s*=\s*activeSessionId[\s\S]*?startContextCache\.set\(sessionId/,
    );
  });

  it("chat.system.transform reads cached context first, falls back to /context", () => {
    expect(plugin).toMatch(/startContextCache\.get\(sid\)/);
    expect(plugin).toMatch(/postJson\(["']\/context["']/);
    expect(plugin).toMatch(/startContextCache\.delete\(sid\)/);
  });

  it("session.deleted clears the cache to avoid stale entries", () => {
    const deletedBlock = plugin.slice(plugin.indexOf("session.deleted"));
    expect(deletedBlock).toMatch(/startContextCache\.delete\(sid\)/);
  });
});

describe("OpenCode plugin project name resolution", () => {
  const savedProjectName = process.env.AGENTMEMORY_PROJECT_NAME;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    delete process.env.AGENTMEMORY_PROJECT_NAME;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedProjectName === undefined) delete process.env.AGENTMEMORY_PROJECT_NAME;
    else process.env.AGENTMEMORY_PROJECT_NAME = savedProjectName;
  });

  async function startPayloadFor(
    ctx: Record<string, unknown>,
  ): Promise<{ project: unknown; cwd: unknown }> {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
    }>)(ctx);
    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "s1" } } },
    });
    const startCall = fetchMock.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/session/start"),
    );
    if (!startCall) throw new Error("no /session/start call captured");
    const body = JSON.parse((startCall[1] as { body: string }).body);
    return { project: body.project, cwd: body.cwd };
  }

  async function projectFor(ctx: Record<string, unknown>): Promise<unknown> {
    return (await startPayloadFor(ctx)).project;
  }

  it("uses trimmed AGENTMEMORY_PROJECT_NAME when set", async () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "  my-proj  ";
    expect(await projectFor({ worktree: "/should/be/ignored" })).toBe("my-proj");
  });

  it("treats whitespace-only env value as unset and falls back to the basename", async () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "   ";
    expect(await projectFor({ worktree: "/repo/alpha" })).toBe("alpha");
  });

  // Canonicalization: project is the git-toplevel/cwd BASENAME (matching the
  // hooks' resolveProject), while cwd keeps the full path. A nonexistent dir
  // cannot be a git repo, so these exercise the basename fallback.
  it("sends the basename as project and the full path as cwd", async () => {
    const payload = await startPayloadFor({ worktree: "/repo/alpha" });
    expect(payload.project).toBe("alpha");
    expect(payload.cwd).toBe("/repo/alpha");
  });

  it("falls back to ctx.project.id when worktree is absent", async () => {
    expect(await projectFor({ project: { id: "/repo/beta" } })).toBe("beta");
  });

  it("resolves the git toplevel basename inside a real repository", async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { execFileSync } = await import("node:child_process");
    const root = mkdtempSync(join(tmpdir(), "amem-oc-"));
    const repo = join(root, "oc-fixture-repo");
    const nested = join(repo, "src", "deep");
    mkdirSync(nested, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repo, stdio: "ignore" });
    try {
      // Subdirectory of the repo still resolves to the repo basename.
      expect(await projectFor({ worktree: nested })).toBe("oc-fixture-repo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("OpenCode plugin file-tool matching", () => {
  const plugin = readFileSync("plugin/opencode/agentmemory-capture.ts", "utf-8");

  it("matches OpenCode's lowercase tool names case-insensitively", () => {
    // OpenCode reports "read"/"edit"/... in lowercase; the old capitalized
    // set never matched, silently disabling file enrichment.
    expect(plugin).toContain('FILE_TOOLS = new Set(["read", "write", "edit", "glob", "grep"])');
    expect(plugin).toContain('FILE_TOOLS.has(String(input.tool ?? "").toLowerCase())');
  });
});
