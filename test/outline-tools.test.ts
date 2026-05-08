import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerOutlineFunctions } from "../src/functions/outline-build.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (opts: { id: string }, handler: Function) => {
      functions.set(opts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, data: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(data);
    },
  };
}

describe("outline functions roundtrip", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let tmpFile: string;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerOutlineFunctions(sdk as any, kv as any);
  });

  it("build → get → section roundtrip extracts correct lines", async () => {
    tmpFile = join(tmpdir(), `outline-test-${Date.now()}-${Math.random()}.md`);
    const content = [
      "# Project",
      "intro",
      "",
      "## Setup",
      "Run npm install.",
      "",
      "## Usage",
      "Call the API.",
      "More usage details.",
    ].join("\n");
    await fs.writeFile(tmpFile, content, "utf-8");

    const built = await sdk.trigger("mem::outline-build", { path: tmpFile });
    expect(built.success).toBe(true);
    expect(built.artifact_id).toBe(tmpFile);
    expect(built.nodeCount).toBe(3);

    const got = await sdk.trigger("mem::outline-get", { artifact_id: tmpFile });
    expect(got.success).toBe(true);
    expect(got.outline.title).toBe("Project");
    expect(got.outline.nodes).toHaveLength(1);
    expect(got.outline.nodes[0].children).toHaveLength(2);

    const setup = await sdk.trigger("mem::outline-section", {
      artifact_id: tmpFile,
      node_id: "1.1",
    });
    expect(setup.success).toBe(true);
    expect(setup.node.title).toBe("Setup");
    expect(setup.text).toContain("Run npm install.");
    expect(setup.text).not.toContain("Call the API");

    const usage = await sdk.trigger("mem::outline-section", {
      artifact_id: tmpFile,
      node_id: "1.2",
    });
    expect(usage.text).toContain("Call the API");
    expect(usage.text).toContain("More usage details");

    await fs.unlink(tmpFile);
  });

  it("get returns error when outline missing", async () => {
    const got = await sdk.trigger("mem::outline-get", {
      artifact_id: "/nonexistent/path.md",
    });
    expect(got.success).toBe(false);
    expect(got.error).toContain("outline not built");
  });

  it("section detects stale outline (size mismatch)", async () => {
    tmpFile = join(tmpdir(), `outline-stale-${Date.now()}-${Math.random()}.md`);
    await fs.writeFile(tmpFile, "# A\nbody", "utf-8");
    await sdk.trigger("mem::outline-build", { path: tmpFile });

    await fs.writeFile(tmpFile, "# A\nbody updated longer content", "utf-8");

    const r = await sdk.trigger("mem::outline-section", {
      artifact_id: tmpFile,
      node_id: "1",
    });
    expect(r.success).toBe(false);
    expect(r.stale).toBe(true);

    await fs.unlink(tmpFile);
  });

  it("section returns error for missing node_id", async () => {
    tmpFile = join(tmpdir(), `outline-mn-${Date.now()}-${Math.random()}.md`);
    await fs.writeFile(tmpFile, "# A\nbody", "utf-8");
    await sdk.trigger("mem::outline-build", { path: tmpFile });

    const r = await sdk.trigger("mem::outline-section", {
      artifact_id: tmpFile,
      node_id: "9.9.9",
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("not found");

    await fs.unlink(tmpFile);
  });

  it("build fails gracefully on missing file", async () => {
    const r = await sdk.trigger("mem::outline-build", {
      path: "/nope/missing.md",
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("read failed");
  });
});
