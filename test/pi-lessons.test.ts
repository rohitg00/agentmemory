import { afterEach, describe, expect, it, vi } from "vitest";
import agentmemoryExtension from "../integrations/pi/index.js";

afterEach(() => vi.unstubAllGlobals());

type Tool = { execute: (...args: never[]) => Promise<{ content: { text: string }[]; details?: unknown }> };
type Handler = (event: never, ctx: never) => Promise<{ systemPrompt: string; message?: { content: string } }>;

const LESSON_PREVIEW = "Check indexes before retrying…";
const LESSON_FULL = "Check indexes before retrying. Then restore the snapshot.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function loadPi(): { tools: Map<string, Tool>; events: Map<string, Handler> } {
  const tools = new Map<string, Tool>();
  const events = new Map<string, Handler>();
  agentmemoryExtension({
    registerCommand: () => {},
    registerTool: (tool: { name: string } & Tool) => tools.set(tool.name, tool),
    on: (name: string, handler: Handler) => events.set(name, handler),
  } as never);
  return { tools, events };
}

describe("Pi lesson recall", () => {
  it("shows lessons in manual search, reads the full lesson by ID, and recalls both", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const href = String(url);
      if (href.endsWith("/health")) return json({ status: "healthy" });
      if (href.endsWith("/lessons/get")) return json({ success: true, lesson: { content: LESSON_FULL } });
      if (href.endsWith("/session/start") || href.endsWith("/sessions")) return json({ success: true });
      return json({ results: [], lessons: [{ lessonId: "lsn_1", content: LESSON_PREVIEW, score: 0.9 }] });
    }));

    const { tools, events } = loadPi();

    const search = await tools.get("memory_search")!.execute("call", { query: "index" } as never);
    expect(search.content[0].text).toContain(LESSON_PREVIEW);
    expect(search.content[0].text).toContain("lessonId: lsn_1");
    expect(search.content[0].text).not.toContain("No relevant memories found");

    const full = await tools.get("memory_get_lesson")!.execute("call", { lessonId: "lsn_1" } as never);
    expect(full.content[0].text).toBe(LESSON_FULL);

    const recalled = await events.get("before_agent_start")!(
      { prompt: "index", systemPrompt: "Base prompt" } as never,
      { cwd: process.cwd() } as never,
    );
    expect(recalled.message?.content).toContain(LESSON_PREVIEW);
    expect(recalled.message?.content).toContain("lessonId: lsn_1");
  });

  it("reports an unreachable server without claiming the lesson is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const href = String(url);
      if (href.endsWith("/health")) return json({ status: "healthy" });
      if (href.endsWith("/lessons/get")) throw new Error("connection refused");
      return json({ results: [], lessons: [] });
    }));

    const { tools } = loadPi();
    const result = await tools.get("memory_get_lesson")!.execute("call", { lessonId: "lsn_1" } as never);

    expect(result.content[0].text).toContain("Could not retrieve lesson lsn_1");
    expect(result.content[0].text).not.toContain("No lesson");
  });

  it("says a lesson is missing only when the API answers 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const href = String(url);
      if (href.endsWith("/health")) return json({ status: "healthy" });
      if (href.endsWith("/lessons/get")) return json({ error: "lesson not found" }, 404);
      return json({ results: [], lessons: [] });
    }));

    const { tools } = loadPi();
    const result = await tools.get("memory_get_lesson")!.execute("call", { lessonId: "lsn_9" } as never);

    expect(result.content[0].text).toContain("No lesson lsn_9");
    expect(result.content[0].text).not.toContain("Could not retrieve");
  });
});
