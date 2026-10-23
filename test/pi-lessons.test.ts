import { afterEach, describe, expect, it, vi } from "vitest";
import agentmemoryExtension from "../integrations/pi/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("Pi lesson recall", () => {
  it("includes lessons in manual search and automatic recall", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith("/health")
        ? { status: "healthy" }
        : { results: [], lessons: [{ content: "Check indexes before retrying", score: 0.9 }] }),
      { status: 200 }),
    ));

    const tools = new Map<string, { execute: (...args: never[]) => Promise<{ content: { text: string }[] }> }>();
    const events = new Map<string, (event: never, ctx: never) => Promise<{ systemPrompt: string }>>();
    agentmemoryExtension({
      registerCommand: () => {},
      registerTool: (tool: { name: string; execute: (...args: never[]) => Promise<{ content: { text: string }[] }> }) => tools.set(tool.name, tool),
      on: (name: string, handler: (event: never, ctx: never) => Promise<{ systemPrompt: string }>) => events.set(name, handler),
    } as never);

    const search = await tools.get("memory_search")!.execute("call", { query: "index" } as never);
    expect(search.content[0].text).toContain("Check indexes before retrying");
    expect(search.content[0].text).not.toContain("No relevant memories found");

    const recalled = await events.get("before_agent_start")!(
      { prompt: "index", systemPrompt: "Base prompt", systemPromptOptions: { cwd: process.cwd() } } as never,
      { ui: { setStatus: () => {} } } as never,
    );
    expect(recalled.systemPrompt).toContain("Check indexes before retrying");
  });
});
