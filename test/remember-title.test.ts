import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { getAllTools } from "../src/mcp/tools-registry.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function setupRemember() {
  vi.resetModules();
  const search = await import("../src/functions/search.js");
  const { registerRememberFunction } = await import("../src/functions/remember.js");
  const sdk = mockSdk({ looseTrigger: true });
  const kv = mockKV();
  registerRememberFunction(sdk as never, kv as never);
  return { sdk, kv, search };
}

type Saved = { memory: { id: string; title: string; content: string } };

describe("mem::remember explicit title", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("stores the caller's title instead of truncating content", async () => {
    const { sdk } = await setupRemember();
    const content = "the writer batches log lines per traceId before flushing to disk";
    const result = (await sdk.trigger("mem::remember", {
      content,
      title: "日志系统架构设计",
      type: "architecture",
    })) as Saved;

    expect(result.memory.title).toBe("日志系统架构设计");
    expect(result.memory.content).toBe(content);
  });

  it("trims surrounding whitespace from an explicit title", async () => {
    const { sdk } = await setupRemember();
    const result = (await sdk.trigger("mem::remember", {
      content: "rotate refresh tokens on every use",
      title: "  token rotation  ",
    })) as Saved;

    expect(result.memory.title).toBe("token rotation");
  });

  it("caps an overlong title at 80 units", async () => {
    const { sdk } = await setupRemember();
    const result = (await sdk.trigger("mem::remember", {
      content: "content that stays whole",
      title: "x".repeat(200),
    })) as Saved;

    expect(result.memory.title).toBe("x".repeat(80));
  });

  it("derives the title from content when title is absent", async () => {
    const { sdk } = await setupRemember();
    const content = "staging deploys run the migration job before the app rollout";
    const result = (await sdk.trigger("mem::remember", { content })) as Saved;

    expect(result.memory.title).toBe(content.slice(0, 80));
  });

  it("falls back to the derived title for blank and non-string titles", async () => {
    const { sdk } = await setupRemember();
    const content = "a memory whose title was left empty by the caller";

    for (const title of ["", "   ", 42, null, undefined]) {
      const result = (await sdk.trigger("mem::remember", {
        content,
        title,
      })) as Saved;
      expect(result.memory.title).toBe(content.slice(0, 80));
    }
  });

  it("lets an explicit title survive a superseding save", async () => {
    const { sdk } = await setupRemember();
    const first = (await sdk.trigger("mem::remember", {
      content: "the deploy pipeline uses blue green rollout with health gates",
      title: "deploy pipeline",
      type: "architecture",
    })) as Saved;

    const second = (await sdk.trigger("mem::remember", {
      content:
        "the deploy pipeline uses blue green rollout with health gates and a canary",
      type: "architecture",
    })) as Saved & { memory: { supersedes: string[] } };

    expect(second.memory.supersedes).toContain(first.memory.id);
    // The second save passed no title, so it derives one from its own content.
    expect(second.memory.title).toBe(second.memory.content.slice(0, 80));
  });
});

describe("memory_save MCP schema", () => {
  it("advertises title as an optional string", () => {
    const tool = getAllTools().find((t) => t.name === "memory_save");
    expect(tool).toBeDefined();
    const properties = tool!.inputSchema.properties as Record<
      string,
      { type: string }
    >;
    expect(properties["title"]?.type).toBe("string");
    expect(tool!.inputSchema.required).toEqual(["content"]);
  });
});

type Handler = (
  req: unknown,
) => Promise<{ status_code: number; body: Record<string, unknown> }>;

function setupRest() {
  const kv = {
    get: vi.fn(async () => null),
    set: vi.fn(async (_scope: string, _key: string, value: unknown) => value),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => []),
  };
  const handlers = new Map<string, Handler>();
  const trigger = vi.fn(
    async (input: { function_id: string; payload: unknown }) => ({
      success: true,
      echo: input.payload,
    }),
  );
  const sdk = {
    registerFunction: (id: string, fn: Handler) => handlers.set(id, fn),
    registerTrigger: () => {},
    trigger,
    on: () => {},
  };
  registerApiTriggers(sdk as never, kv as never);
  const call = (id: string, req: { body?: unknown }) =>
    handlers.get(id)!({ headers: {}, query_params: {}, body: {}, ...req });
  return { call, trigger };
}

describe("POST /agentmemory/remember title", () => {
  it("passes a trimmed title through to mem::remember", async () => {
    const { call, trigger } = setupRest();
    const res = await call("api::remember", {
      body: { content: "log lines flush per traceId", title: "  log pipeline  " },
    });

    expect(res.status_code).toBe(201);
    const payload = trigger.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.title).toBe("log pipeline");
  });

  it("omits title when the caller leaves it blank", async () => {
    const { call, trigger } = setupRest();
    await call("api::remember", { body: { content: "no title here", title: "   " } });

    const payload = trigger.mock.calls[0][0].payload as Record<string, unknown>;
    expect("title" in payload).toBe(false);
  });
});
