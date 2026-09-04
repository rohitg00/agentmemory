import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Live Verification: 5 Key Fixes for Agentmemory OpenCode Plugin", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let capturedRequests: Array<{ url: string; body: any }>;

  beforeEach(() => {
    capturedRequests = [];
    fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      capturedRequests.push({ url, body });

      if (url.includes("/session/start")) {
        return {
          ok: true,
          json: async () => ({ context: "## Injected Start Context" }),
        };
      }
      if (url.includes("/enrich")) {
        const isProjectA = body.project === "agentmemory";
        const hasScopedFile = (body.files || []).some((f: string) => f.includes("scoped-file.ts"));
        const hasAuthFile = (body.files || []).some((f: string) => f.includes("auth.ts"));
        let context = "";
        if (hasScopedFile && isProjectA) {
          context = "PROJECT_A_SECRET: 11111 for scoped-file in project agentmemory";
        } else if (hasAuthFile) {
          context = "## Relevant security context for auth.ts";
        }
        return {
          ok: true,
          json: async () => ({ context }),
        };
      }
      return { ok: true, json: async () => ({ status: "ok" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── FIX 1: Prefix Cache Invariance ──
  it("Fix 1 (Prefix Cache Invariance): output.system is transformed on Turn 1 and remains 100% frozen/identical across Turns 2, 3, 4, and 5", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/Volumes/DB/Example Projects/agentmemory" });

    const sessionID = "sess-cache-eval";
    await handlers.event({
      event: { type: "session.created", properties: { sessionID } },
    });

    // Turn 1 System Prompt Transform
    const turn1Output = { system: ["You are a helpful coding assistant."] };
    await handlers["experimental.chat.system.transform"]({ sessionID }, turn1Output);
    expect(turn1Output.system.length).toBeGreaterThanOrEqual(2);
    const frozenSystemState = [...turn1Output.system];

    // Simulate multiple turns with file reads in between
    for (let turn = 2; turn <= 5; turn++) {
      // Simulate file tool execution between turns
      await handlers["tool.execute.before"](
        { sessionID, tool: "read" },
        { args: { filePath: `src/file-${turn}.ts` } },
      );

      const subsequentTurnOutput = { system: ["You are a helpful coding assistant."] };
      await handlers["experimental.chat.system.transform"]({ sessionID }, subsequentTurnOutput);

      // Invariant: System prompt on Turn 2+ matches Turn 1 exactly (identical bytes, 100% prefix cache preserved #720)
      expect(subsequentTurnOutput.system).toEqual(turn1Output.system);
    }
  });

  // ── FIX 2: Zero DB Schema Error & Clean UI ──
  it("Fix 2 (Zero DB Schema Error & Clean UI): chat.message never pushes invalid parts into DB, and context is attached in-memory only", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/Volumes/DB/Example Projects/agentmemory" });

    const sessionID = "sess-db-clean";
    await handlers.event({
      event: { type: "session.created", properties: { sessionID } },
    });

    // User touches a file
    await handlers["tool.execute.before"](
      { sessionID, tool: "read" },
      { args: { filePath: "src/auth.ts" } },
    );

    // chat.message is called by OpenCode to persist the user message into SQLite
    const userMessageData = {
      parts: [
        { type: "text", text: "Please refactor auth.ts" },
      ],
    };
    await handlers["chat.message"]({ sessionID, messageID: "msg-001" }, userMessageData);

    // Verification 2A: Persistent DB parts array is completely untouched (0 schema errors, 0 XML tags in DB/UI)
    expect(userMessageData.parts.length).toBe(1);
    expect(userMessageData.parts[0].text).toBe("Please refactor auth.ts");
    expect(userMessageData.parts[0].text).not.toContain("<agentmemory-file-context>");

    // Verification 2B: In-memory transform attaches context immediately before model invocation
    const inMemoryMsgs = {
      messages: [
        {
          info: { role: "user", sessionID },
          parts: [{ type: "text", text: "Please refactor auth.ts" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, inMemoryMsgs);
    expect(inMemoryMsgs.messages[0].parts[0].text).toContain("Please refactor auth.ts");
    expect(inMemoryMsgs.messages[0].parts[0].text).toContain("<agentmemory-file-context>");
  });

  // ── FIX 3: Stash Loop Fixed (No Infinite API Calls) ──
  it("Fix 3 (Stash Loop Fixed): opening a fresh file without memory records does NOT cause repetitive /enrich calls on subsequent turns", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/Volumes/DB/Example Projects/agentmemory" });

    const sessionID = "sess-stash-loop";
    await handlers.event({
      event: { type: "session.created", properties: { sessionID } },
    });

    // Step 1: Tool accesses a fresh file that has no memory
    await handlers["tool.execute.before"](
      { sessionID, tool: "read" },
      { args: { filePath: "test-fixtures/fresh-file.ts" } },
    );

    // Step 2: Turn 1 triggers /enrich (which returns empty context)
    const turn1Msgs = {
      messages: [
        {
          info: { role: "user", sessionID },
          parts: [{ type: "text", text: "Turn 1 question" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, turn1Msgs);

    const enrichCallsAfterTurn1 = capturedRequests.filter(r => r.url.includes("/enrich")).length;
    expect(enrichCallsAfterTurn1).toBe(1);

    // Step 3: Turn 2 user asks another question without touching any new files
    const turn2Msgs = {
      messages: [
        {
          info: { role: "user", sessionID },
          parts: [{ type: "text", text: "Turn 2 follow-up question" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, turn2Msgs);

    // Verification: Stash was cleared immediately on Turn 1; Turn 2 makes ZERO /enrich calls!
    const enrichCallsAfterTurn2 = capturedRequests.filter(r => r.url.includes("/enrich")).length;
    expect(enrichCallsAfterTurn2).toBe(1);
  });

  // ── FIX 4: Search Pattern & Regex Exclusion ──
  it("Fix 4 (Search Pattern Exclusion): glob wildcards (**/*.ts) and grep regex patterns are excluded from file stash", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/Volumes/DB/Example Projects/agentmemory" });

    const sessionID = "sess-pattern-eval";
    await handlers.event({
      event: { type: "session.created", properties: { sessionID } },
    });

    // Simulate glob with wildcard pattern and valid path
    await handlers["tool.execute.before"](
      { sessionID, tool: "glob" },
      { args: { pattern: "**/*.{ts,tsx}", path: "src/components" } },
    );

    // Simulate grep with regex pattern and valid filePath
    await handlers["tool.execute.before"](
      { sessionID, tool: "grep" },
      { args: { pattern: "export\\s+const\\s+API_URL", filePath: "src/constants.ts" } },
    );

    // Trigger transform to inspect what gets sent to /enrich
    const msgs = {
      messages: [
        {
          info: { role: "user", sessionID },
          parts: [{ type: "text", text: "Find constants" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, msgs);

    const enrichCall = capturedRequests.find(r => r.url.includes("/enrich"));
    expect(enrichCall).toBeDefined();
    const stashedFiles: string[] = enrichCall?.body.files || [];

    // Verification: Literal file paths ARE included, but regex/glob patterns ARE EXCLUDED
    expect(stashedFiles).toContain("src/components");
    expect(stashedFiles).toContain("src/constants.ts");
    expect(stashedFiles).not.toContain("**/*.{ts,tsx}");
    expect(stashedFiles).not.toContain("export\\s+const\\s+API_URL");
  });

  // ── FIX 5: Project Scoping Isolation ──
  it("Fix 5 (Project Scoping Isolation): /enrich passes project scope, ensuring memory isolation between repositories", async () => {
    const { AgentmemoryCapturePlugin } = await import("../plugin/opencode/agentmemory-capture.ts");
    const handlers = await (AgentmemoryCapturePlugin as any)({ worktree: "/Volumes/DB/Example Projects/agentmemory" });

    const sessionID = "sess-project-scope";
    await handlers.event({
      event: { type: "session.created", properties: { sessionID, info: { directory: "/Volumes/DB/Example Projects/agentmemory" } } },
    });

    // Touch scoped file
    await handlers["tool.execute.before"](
      { sessionID, tool: "read" },
      { args: { filePath: "test-fixtures/scoped-file.ts" } },
    );

    const msgs = {
      messages: [
        {
          info: { role: "user", sessionID },
          parts: [{ type: "text", text: "Check scoped secret" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, msgs);

    const enrichCall = capturedRequests.find(r => r.url.includes("/enrich"));
    expect(enrichCall).toBeDefined();

    // Verification 5A: Payload explicitly specifies project name
    expect(enrichCall?.body.project).toBe("agentmemory");

    // Verification 5B: Injected context contains Project A secret and excludes Project B
    expect(msgs.messages[0].parts[0].text).toContain("PROJECT_A_SECRET: 11111");
    expect(msgs.messages[0].parts[0].text).not.toContain("PROJECT_B_SECRET: 22222");
  });
});
