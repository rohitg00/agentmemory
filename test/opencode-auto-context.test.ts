import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

describe("OpenCode plugin auto-context injection (#431, #720, #1184)", () => {
  const plugin = readFileSync(
    "plugin/opencode/agentmemory-capture.ts",
    "utf-8",
  );

  it("captures and caches session context at initialization", () => {
    expect(plugin).toMatch(/startContextCache\s*=\s*new Map<string,\s*string>/);
    expect(plugin).toMatch(/postJson\(["']\/session\/start["']/);
    expect(plugin).toMatch(
      /const\s+sessionId\s*=\s*activeSessionId[\s\S]*?startContextCache\.set\(sessionId/,
    );
  });

  it("injects frozen context on every conversational turn without deleting cached entries", () => {
    const transformBlock = plugin.slice(
      plugin.indexOf('"experimental.chat.system.transform"'),
      plugin.indexOf('"experimental.session.compacting"'),
    );
    expect(transformBlock).toMatch(/startContextCache\.get\(sid\)/);
    expect(transformBlock).toMatch(/postJson\(["']\/context["']/);
    expect(transformBlock).not.toContain("startContextCache.delete(sid)");
  });

  it("clears cached session state upon session deletion", () => {
    const deletedBlock = plugin.slice(plugin.indexOf("session.deleted"));
    expect(deletedBlock).toMatch(/startContextCache\.delete\(sid\)/);
  });
});

describe("OpenCode plugin system prompt transformation behavior", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ context: "<agentmemory-context project=\"demo\">mock data</agentmemory-context>" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function getPluginHooks(ctx: Record<string, unknown> = { worktree: "/repo/demo" }) {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    return (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
      "experimental.chat.system.transform": (
        input: { sessionID?: string; agent?: string; small?: boolean },
        output: { system?: string[] },
      ) => Promise<void>;
    }>)(ctx);
  }

  it("preserves identical memory context across multi-turn chat interactions", async () => {
    const hooks = await getPluginHooks();

    // 1. Session created -> fetches and caches start context
    await hooks.event({
      event: { type: "session.created", properties: { info: { id: "ses_multi_turn" } } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2. Turn 1
    const turn1Output: { system: string[] } = { system: [] };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_multi_turn" },
      turn1Output,
    );
    expect(turn1Output.system).toHaveLength(2);
    expect(turn1Output.system[0]).toContain("<agentmemory-instructions>");
    expect(turn1Output.system[1]).toContain("<agentmemory-context project=\"demo\">mock data</agentmemory-context>");
    // Should NOT have made an extra network call (used cached start context)
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 3. Turn 2 (OpenCode creates a fresh output.system array)
    const turn2Output: { system: string[] } = { system: [] };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_multi_turn" },
      turn2Output,
    );
    expect(turn2Output.system).toHaveLength(2);
    expect(turn2Output.system[0]).toBe(turn1Output.system[0]);
    expect(turn2Output.system[1]).toBe(turn1Output.system[1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 4. Turn 3
    const turn3Output: { system: string[] } = { system: [] };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_multi_turn" },
      turn3Output,
    );
    expect(turn3Output.system[0]).toBe(turn1Output.system[0]);
    expect(turn3Output.system[1]).toBe(turn1Output.system[1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips internal utility requests such as title generation and compaction", async () => {
    const hooks = await getPluginHooks();
    await hooks.event({
      event: { type: "session.created", properties: { info: { id: "ses_internal_guard" } } },
    });

    // Internal title agent request
    const titleOutput: { system: string[] } = { system: [] };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_internal_guard", agent: "title" },
      titleOutput,
    );
    expect(titleOutput.system).toEqual([]);

    // Compaction agent request
    const compactionOutput: { system: string[] } = { system: [] };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_internal_guard", agent: "compaction" },
      compactionOutput,
    );
    expect(compactionOutput.system).toEqual([]);

    // Small model request
    const smallOutput: { system: string[] } = { system: [] };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_internal_guard", small: true },
      smallOutput,
    );
    expect(smallOutput.system).toEqual([]);

    // Legacy title prompt regex fallback when agent metadata is missing
    const legacyTitleOutput: { system: string[] } = {
      system: ["You are a title generator. Output only a short title."],
    };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_internal_guard" },
      legacyTitleOutput,
    );
    expect(legacyTitleOutput.system).toHaveLength(1);
    expect(legacyTitleOutput.system[0]).not.toContain("<agentmemory-instructions>");
  });

  it("fetches and re-caches context on cache miss for resumed sessions", async () => {
    const hooks = await getPluginHooks();

    // Directly call transform without prior session.created event
    const output: { system: string[] } = { system: [] };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_resumed_session" },
      output,
    );

    expect(output.system).toHaveLength(2);
    expect(output.system[0]).toContain("<agentmemory-instructions>");
    expect(output.system[1]).toContain("<agentmemory-context project=\"demo\">mock data</agentmemory-context>");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second turn on resumed session should now hit the cache
    const secondTurnOutput: { system: string[] } = { system: [] };
    await hooks["experimental.chat.system.transform"](
      { sessionID: "ses_resumed_session" },
      secondTurnOutput,
    );
    expect(secondTurnOutput.system).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1); // No new network call
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
