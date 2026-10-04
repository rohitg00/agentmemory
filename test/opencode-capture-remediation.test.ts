import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("OpenCode plugin remediation test suite (#1184, #720, #1188)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/session/start")) {
        return {
          ok: true,
          json: async () => ({ context: "## Start Context from Server" }),
        };
      }
      if (typeof url === "string" && url.includes("/context")) {
        return {
          ok: true,
          json: async () => ({ context: "## Fresh Context from /context" }),
        };
      }
      if (typeof url === "string" && url.includes("/enrich")) {
        return {
          ok: true,
          json: async () => ({ context: "## File Enrichment Context for app.ts" }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Issue #1184: ignores diverse internal title-generator requests and preserves context injection for main turn", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
      "experimental.chat.system.transform": (input: any, output: any) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-1184" } } },
    });

    // Test variant 1: "You are a title generator."
    const titleOutput1 = { system: ["You are a title generator. You output ONLY a thread title."] };
    await handlers["experimental.chat.system.transform"](
      { sessionID: "sess-1184" },
      titleOutput1,
    );
    expect(titleOutput1.system).toHaveLength(1);

    // Test variant 2: "Generate a title for this conversation"
    const titleOutput2 = { system: ["Generate a title for this conversation:"] };
    await handlers["experimental.chat.system.transform"](
      { sessionID: "sess-1184" },
      titleOutput2,
    );
    expect(titleOutput2.system).toHaveLength(1);

    // Main conversation turn arrives
    const userTurnOutput = { system: ["You are a helpful assistant."] };
    await handlers["experimental.chat.system.transform"](
      { sessionID: "sess-1184" },
      userTurnOutput,
    );

    // User turn MUST receive AGENTMEMORY_INSTRUCTIONS and Start Context
    expect(userTurnOutput.system.length).toBeGreaterThanOrEqual(2);
    expect(userTurnOutput.system.some((s: string) => s.includes("agentmemory"))).toBe(true);
    expect(userTurnOutput.system.some((s: string) => s.includes("Start Context from Server"))).toBe(true);
  });

  it("Issue #720: keeps system prompt frozen on Turn 2+ to preserve LLM prefix caching", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
      "experimental.chat.system.transform": (input: any, output: any) => Promise<void>;
      "tool.execute.before": (input: any, output: any) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-720" } } },
    });

    // Turn 1
    const turn1Output = { system: ["Base System Prompt"] };
    await handlers["experimental.chat.system.transform"](
      { sessionID: "sess-720" },
      turn1Output,
    );

    // Simulate file tool execution between turns (e.g. read/edit)
    await handlers["tool.execute.before"](
      { sessionID: "sess-720", tool: "read" },
      { args: { filePath: "/test/src/app.ts" } },
    );

    // Turn 2
    const turn2Output = { system: ["Base System Prompt"] };
    await handlers["experimental.chat.system.transform"](
      { sessionID: "sess-720" },
      turn2Output,
    );

    // System prompt on Turn 2 MUST NOT be mutated
    expect(turn2Output.system).toEqual(["Base System Prompt"]);
  });

  it("Issue #720 (Cache-Safe Dynamic File Enrichment): injects file context into experimental.chat.messages.transform at tail", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
      "tool.execute.before": (input: any, output: any) => Promise<void>;
      "chat.message": (input: any, output: any) => Promise<void>;
      "experimental.chat.messages.transform": (input: any, output: any) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-enrich-tail" } } },
    });

    // 1. Tool executed before touches a file
    await handlers["tool.execute.before"](
      { sessionID: "sess-enrich-tail", tool: "read" },
      { args: { filePath: "/test/src/app.ts" } },
    );

    // 2. Chat message hook is clean (does not pollute DB parts)
    const chatOutput = {
      parts: [
        { type: "text", text: "Please refactor app.ts for me" }
      ]
    };
    await handlers["chat.message"](
      { sessionID: "sess-enrich-tail", messageID: "msg-123" },
      chatOutput,
    );
    expect(chatOutput.parts[0].text).toBe("Please refactor app.ts for me");

    // 3. Before sending to LLM, experimental.chat.messages.transform injects context in-memory
    const msgsOutput = {
      messages: [
        {
          info: { role: "user", sessionID: "sess-enrich-tail" },
          parts: [{ type: "text", text: "Please refactor app.ts for me" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, msgsOutput);

    // 4. Verify /enrich was called with the file
    const enrichCall = fetchMock.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/enrich"),
    );
    expect(enrichCall).toBeDefined();

    // 5. Verify context is appended in-memory to the user message
    expect(msgsOutput.messages[0].parts[0].text).toContain("Please refactor app.ts for me");
    expect(msgsOutput.messages[0].parts[0].text).toContain("<agentmemory-file-context>");
    expect(msgsOutput.messages[0].parts[0].text).toContain("File Enrichment Context for app.ts");
  });

  it("Issue #720: clears stashed files even when /enrich returns empty context in messages.transform", async () => {
    fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/enrich")) {
        return {
          ok: true,
          json: async () => ({ context: "" }), // empty context
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
      "tool.execute.before": (input: any, output: any) => Promise<void>;
      "chat.message": (input: any, output: any) => Promise<void>;
      "experimental.chat.messages.transform": (input: any, output: any) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-empty-enrich" } } },
    });

    // 1. Tool executed touches file
    await handlers["tool.execute.before"](
      { sessionID: "sess-empty-enrich", tool: "read" },
      { args: { filePath: "/test/src/unknown.ts" } },
    );

    // 2. First messages.transform triggers /enrich (which returns empty)
    const msgsOutput1 = {
      messages: [
        {
          info: { role: "user", sessionID: "sess-empty-enrich" },
          parts: [{ type: "text", text: "Turn 1" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, msgsOutput1);

    const enrichCallsBefore = fetchMock.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/enrich"),
    ).length;
    expect(enrichCallsBefore).toBe(1);

    // 3. Second messages.transform without new file access MUST NOT re-query /enrich
    const msgsOutput2 = {
      messages: [
        {
          info: { role: "user", sessionID: "sess-empty-enrich" },
          parts: [{ type: "text", text: "Turn 2" }],
        },
      ],
    };
    await handlers["experimental.chat.messages.transform"]({}, msgsOutput2);

    const enrichCallsAfter = fetchMock.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/enrich"),
    ).length;
    expect(enrichCallsAfter).toBe(1); // Stash was cleared, no second call!
  });

  it("Cleans up session state completely on session.deleted", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
      "experimental.chat.system.transform": (input: any, output: any) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-del" } } },
    });

    // Fire turn 1
    const turn1 = { system: ["Base"] };
    await handlers["experimental.chat.system.transform"](
      { sessionID: "sess-del" },
      turn1,
    );
    expect(turn1.system.length).toBeGreaterThan(1);

    // Fire session.deleted
    await handlers.event({
      event: { type: "session.deleted", properties: { info: { id: "sess-del" } } },
    });

    // Verify /session/end was called
    const endCall = fetchMock.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/session/end"),
    );
    expect(endCall).toBeDefined();
  });

  it("Zero Schema Mutation in chat.message: verifies output.parts reference and contents are untouched without synthetic additions", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as any)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-zero-mutation" } } },
    });

    const initialParts = [
      { type: "text", text: "Please refactor the database query layer" },
      { type: "file", url: "/src/db.ts", filename: "db.ts" },
      { type: "image", data: "base64data", mime: "image/png" },
    ];
    const initialPartsDeepCopy = JSON.parse(JSON.stringify(initialParts));
    const output = { parts: initialParts };

    await handlers["chat.message"](
      { sessionID: "sess-zero-mutation", messageID: "msg-test-01" },
      output,
    );

    // 1. Array reference is strictly preserved (no new array assigned)
    expect(output.parts).toBe(initialParts);
    // 2. Length remains unchanged
    expect(output.parts).toHaveLength(3);
    // 3. Deep contents of all parts are identical and untouched
    expect(output.parts).toEqual(initialPartsDeepCopy);
    // 4. No synthetic or auxiliary parts were injected
    expect(output.parts.some((p: any) => p.synthetic || p.type === "synthetic")).toBe(false);
  });

  it("Non-text / Media-only user messages: cleanly ignores messages with only non-text parts without throwing errors or mutating parts", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as any)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-media-only" } } },
    });

    // Stash files via tool execution before turn
    await handlers["tool.execute.before"](
      { sessionID: "sess-media-only", tool: "read" },
      { args: { filePath: "/test/src/app.ts" } },
    );

    // User message containing ONLY non-text media parts (image + binary file)
    const imagePart = { type: "image", url: "https://example.com/screenshot.png", mime: "image/png" };
    const filePart = { type: "file", url: "/test/src/asset.bin", filename: "asset.bin" };
    const originalImageCopy = { ...imagePart };
    const originalFileCopy = { ...filePart };

    const msgsOutput = {
      messages: [
        {
          info: { role: "user", sessionID: "sess-media-only" },
          parts: [imagePart, filePart],
        },
      ],
    };

    // Transform must execute and resolve cleanly without throwing
    await expect(
      handlers["experimental.chat.messages.transform"]({}, msgsOutput),
    ).resolves.not.toThrow();

    // Verify parts array length and content are completely unmutated
    expect(msgsOutput.messages[0].parts).toHaveLength(2);
    expect(msgsOutput.messages[0].parts[0]).toEqual(originalImageCopy);
    expect(msgsOutput.messages[0].parts[1]).toEqual(originalFileCopy);
    expect((msgsOutput.messages[0].parts[0] as any).text).toBeUndefined();
    expect((msgsOutput.messages[0].parts[1] as any).text).toBeUndefined();
  });

  describe("Daemon Down / Network Error Resilience", () => {
    const errorScenarios = [
      { name: "NetworkError (connection refused / DNS error)", error: new TypeError("Failed to fetch: NetworkError") },
      { name: "AbortError (request timeout)", error: new DOMException("The operation was aborted", "AbortError") },
      { name: "HTTP 500 Internal Server Error", response: { ok: false, status: 500, statusText: "Internal Server Error" } },
      { name: "HTTP 503 Service Unavailable", response: { ok: false, status: 503, statusText: "Service Unavailable" } },
    ];

    for (const scenario of errorScenarios) {
      it(`handles ${scenario.name} gracefully across all hooks (/enrich, /context, /observe, /session/start, /session/end) without unhandled rejections`, async () => {
        if (scenario.error) {
          fetchMock = vi.fn().mockRejectedValue(scenario.error);
        } else {
          fetchMock = vi.fn().mockResolvedValue(scenario.response);
        }
        vi.stubGlobal("fetch", fetchMock);

        const { AgentmemoryCapturePlugin } = await import(
          "../plugin/opencode/agentmemory-capture.ts"
        );
        const handlers = await (AgentmemoryCapturePlugin as any)({ project: { id: "test-proj" } });

        // 1. session.created calls POST /session/start
        await expect(
          handlers.event({
            event: { type: "session.created", properties: { info: { id: "sess-daemon-down" } } },
          }),
        ).resolves.not.toThrow();

        // 2. chat.message calls POST /observe (prompt_submit)
        const chatOutput = { parts: [{ type: "text", text: "Hello" }] };
        await expect(
          handlers["chat.message"]({ sessionID: "sess-daemon-down" }, chatOutput),
        ).resolves.not.toThrow();

        // 3. tool execution calls POST /observe (post_tool_use)
        await expect(
          handlers["tool.execute.before"](
            { sessionID: "sess-daemon-down", tool: "read" },
            { args: { filePath: "/test/src/app.ts" } },
          ),
        ).resolves.not.toThrow();

        await expect(
          handlers.event({
            event: {
              type: "message.part.updated",
              properties: {
                sessionID: "sess-daemon-down",
                part: {
                  id: "p1",
                  type: "tool",
                  tool: "read",
                  state: { status: "completed", input: { filePath: "/test/src/app.ts" }, output: "file content" },
                },
              },
            },
          }),
        ).resolves.not.toThrow();

        // 4. experimental.chat.system.transform calls POST /context (fallback when start context missed)
        const systemOutput = { system: ["Base prompt"] };
        await expect(
          handlers["experimental.chat.system.transform"]({ sessionID: "sess-daemon-down" }, systemOutput),
        ).resolves.not.toThrow();
        expect(systemOutput.system).toContainEqual(expect.stringContaining("agentmemory-instructions"));

        // 5. experimental.chat.messages.transform calls POST /enrich
        const msgsOutput = {
          messages: [
            {
              info: { role: "user", sessionID: "sess-daemon-down" },
              parts: [{ type: "text", text: "User prompt" }],
            },
          ],
        };
        await expect(
          handlers["experimental.chat.messages.transform"]({}, msgsOutput),
        ).resolves.not.toThrow();
        expect(msgsOutput.messages[0].parts[0].text).toBe("User prompt");

        // 6. experimental.session.compacting calls POST /context
        const compactOutput = { context: [] };
        await expect(
          handlers["experimental.session.compacting"]({ sessionID: "sess-daemon-down" }, compactOutput),
        ).resolves.not.toThrow();

        // 7. session.deleted calls POST /session/end, /crystals/auto, /consolidate-pipeline
        await expect(
          handlers.event({
            event: { type: "session.deleted", properties: { info: { id: "sess-daemon-down" } } },
          }),
        ).resolves.not.toThrow();
      });
    }
  });

  it("Multi-turn Cache-Safety Invariant: across 5 consecutive turns, output.system is transformed only on turn 1 and remains identical across turns 2, 3, 4, and 5", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as any)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-5-turns" } } },
    });

    const basePrompt = "You are a senior TypeScript architect.";

    // Turn 1: Should be transformed with instructions and start context
    const turn1Output = { system: [basePrompt] };
    await handlers["experimental.chat.system.transform"](
      { sessionID: "sess-5-turns" },
      turn1Output,
    );
    expect(turn1Output.system.length).toBeGreaterThanOrEqual(2);
    expect(turn1Output.system[0]).toBe(basePrompt);
    expect(turn1Output.system.some((s: string) => s.includes("agentmemory"))).toBe(true);
    expect(turn1Output.system.some((s: string) => s.includes("Start Context from Server"))).toBe(true);

    // Turns 2, 3, 4, and 5: System prompt must remain completely untouched
    for (let turn = 2; turn <= 5; turn++) {
      // Simulate tool activity touching new files between turns
      await handlers["tool.execute.before"](
        { sessionID: "sess-5-turns", tool: "read" },
        { args: { filePath: `/test/src/module${turn}.ts` } },
      );

      const turnOutput = { system: [basePrompt] };
      await handlers["experimental.chat.system.transform"](
        { sessionID: "sess-5-turns" },
        turnOutput,
      );

      // Verify that system prompt was not modified
      expect(turnOutput.system).toEqual([basePrompt]);
      expect(turnOutput.system).toHaveLength(1);
    }
  });

  describe("OpenCode Desktop Mode & Multi-Candidate Project Resolution (PR #857 Parity)", () => {
    it("filters out macOS .app bundles in info.directory and resolves real project directory", async () => {
      const { AgentmemoryCapturePlugin } = await import(
        "../plugin/opencode/agentmemory-capture.ts"
      );
      const handlers = await (AgentmemoryCapturePlugin as any)({
        project: { directory: "/Volumes/DB/Example Projects/agentmemory" },
        worktree: "/Volumes/DB/Example Projects/agentmemory",
      });

      // Desktop fires session.created with info.directory pointing to the Desktop app bundle
      await handlers.event({
        event: {
          type: "session.created",
          properties: {
            info: {
              id: "sess-desktop-app-bundle",
              directory: "/Applications/OpenCode.app/Contents/Resources",
            },
          },
        },
      });

      const startCall = fetchMock.mock.calls.find(
        (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/session/start"),
      );
      expect(startCall).toBeDefined();
      const body = JSON.parse(startCall[1].body);

      // Verify that the project name resolved to the git repo "agentmemory" and NOT "Resources" or "OpenCode.app"
      expect(body.project).toBe("agentmemory");
      expect(body.cwd).toContain("agentmemory");
    });

    it("respects AGENTMEMORY_PROJECT_NAME environment variable as highest priority override", async () => {
      process.env.AGENTMEMORY_PROJECT_NAME = "custom-override-project";
      try {
        const { AgentmemoryCapturePlugin } = await import(
          "../plugin/opencode/agentmemory-capture.ts"
        );
        const handlers = await (AgentmemoryCapturePlugin as any)({
          worktree: "/Volumes/DB/Example Projects/agentmemory",
        });

        await handlers.event({
          event: {
            type: "session.created",
            properties: { info: { id: "sess-env-override", directory: "/some/other/dir" } },
          },
        });

        const startCall = fetchMock.mock.calls.find(
          (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/session/start"),
        );
        expect(startCall).toBeDefined();
        const body = JSON.parse(startCall[1].body);
        expect(body.project).toBe("custom-override-project");
      } finally {
        delete process.env.AGENTMEMORY_PROJECT_NAME;
      }
    });

    it("falls back to non-.app basename when outside git repos", async () => {
      const { AgentmemoryCapturePlugin } = await import(
        "../plugin/opencode/agentmemory-capture.ts"
      );
      const handlers = await (AgentmemoryCapturePlugin as any)({
        directory: "/tmp/my-non-git-workspace",
      });

      await handlers.event({
        event: {
          type: "session.created",
          properties: {
            info: {
              id: "sess-non-git",
              directory: "/Applications/OpenCode.app", // .app bundle skipped
            },
          },
        },
      });

      const startCall = fetchMock.mock.calls.find(
        (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("/session/start"),
      );
      expect(startCall).toBeDefined();
      const body = JSON.parse(startCall[1].body);
      expect(body.project).toBe("my-non-git-workspace");
      expect(body.cwd).toBe("/tmp/my-non-git-workspace");
    });
  });
});
