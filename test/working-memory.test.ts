import { describe, it, expect, vi, beforeEach } from "vitest";

const mockKv = {
  get: vi.fn(),
  set: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
};

const mockSdk = {
  registerFunction: vi.fn(),
};

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

import { registerWorkingMemoryFunctions } from "../src/functions/working-memory.js";

describe("working-memory", () => {
  let handlers: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKv.list.mockResolvedValue([]);
    mockKv.get.mockResolvedValue(null);
    mockKv.set.mockResolvedValue(undefined);
    mockKv.delete.mockResolvedValue(undefined);

    handlers = {};
    mockSdk.registerFunction.mockImplementation((idOrMeta: any, handler: any) => {
      const id = typeof idOrMeta === "string" ? idOrMeta : idOrMeta.id;
      handlers[id] = handler;
    });

    registerWorkingMemoryFunctions(mockSdk as any, mockKv as any, 4000);
  });

  it("registers all working memory functions", () => {
    expect(handlers["mem::core-add"]).toBeDefined();
    expect(handlers["mem::core-remove"]).toBeDefined();
    expect(handlers["mem::core-list"]).toBeDefined();
    expect(handlers["mem::working-context"]).toBeDefined();
    expect(handlers["mem::auto-page"]).toBeDefined();
  });

  it("core-add creates an entry", async () => {
    const result = await handlers["mem::core-add"]({
      content: "Always use feature branches",
      importance: 8,
    });
    expect(result.success).toBe(true);
    expect(result.id).toMatch(/^core_/);
    expect(mockKv.set).toHaveBeenCalledOnce();
  });

  it("core-add rejects empty content", async () => {
    const result = await handlers["mem::core-add"]({ content: "" });
    expect(result.success).toBe(false);
  });

  it("core-add clamps importance", async () => {
    await handlers["mem::core-add"]({ content: "test", importance: 99 });
    const saved = mockKv.set.mock.calls[0][2];
    expect(saved.importance).toBe(10);
  });

  it("core-remove deletes entry", async () => {
    const result = await handlers["mem::core-remove"]({ id: "core_123" });
    expect(result.success).toBe(true);
    expect(mockKv.delete).toHaveBeenCalledOnce();
  });

  it("core-list returns sorted entries", async () => {
    mockKv.list.mockResolvedValue([
      { id: "a", content: "low", importance: 3 },
      { id: "b", content: "high", importance: 9 },
    ]);
    const result = await handlers["mem::core-list"]();
    expect(result.entries[0].importance).toBe(9);
  });

  it("working-context builds core + archival sections", async () => {
    mockKv.list.mockImplementation((scope: string) => {
      if (scope === "mem:core-memory") {
        return [
          {
            id: "c1",
            content: "Use iii primitives",
            importance: 9,
            pinned: true,
            accessCount: 5,
            lastAccessedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ];
      }
      if (scope === "mem:memories") {
        return [
          {
            id: "m1",
            type: "pattern",
            title: "API pattern",
            content: "REST endpoints follow /api/resource convention",
            isLatest: true,
            strength: 0.8,
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      return [];
    });

    const result = await handlers["mem::working-context"]({
      sessionId: "s1",
      project: "test",
    });
    expect(result.success).toBe(true);
    expect(result.coreEntries).toBe(1);
    expect(result.context).toContain("Core Memory");
    expect(result.context).toContain("Use iii primitives");
  });

  it("auto-page removes lowest-value unpinned entries", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      content: "x".repeat(300),
      importance: i,
      pinned: i === 19,
      accessCount: i,
      lastAccessedAt: new Date(Date.now() - i * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
    }));
    mockKv.list.mockResolvedValue(entries);

    const result = await handlers["mem::auto-page"]({ budget: 4000 });
    expect(result.success).toBe(true);
    expect(result.paged).toBeGreaterThan(0);
  });
});
