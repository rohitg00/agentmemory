import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerFacetsFunction } from "../src/functions/facets.js";
import type { Facet } from "../src/types.js";

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
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

describe("Facets Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerFacetsFunction(sdk as never, kv as never);
  });

  describe("mem::facet-tag", () => {
    it("tags a target with a facet", async () => {
      const result = (await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "priority",
        value: "high",
      })) as { success: boolean; facet: Facet };

      expect(result.success).toBe(true);
      expect(result.facet.id).toMatch(/^fct_/);
      expect(result.facet.targetId).toBe("act_123");
      expect(result.facet.targetType).toBe("action");
      expect(result.facet.dimension).toBe("priority");
      expect(result.facet.value).toBe("high");
      expect(result.facet.createdAt).toBeDefined();
    });

    it("returns error when dimension is empty", async () => {
      const result = (await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "  ",
        value: "high",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("dimension is required");
    });

    it("returns error when value is empty", async () => {
      const result = (await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "priority",
        value: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("value is required");
    });

    it("returns error for invalid targetType", async () => {
      const result = (await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "invalid",
        dimension: "priority",
        value: "high",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("targetType must be one of");
    });

    it("skips duplicate tag", async () => {
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "priority",
        value: "high",
      });

      const result = (await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "priority",
        value: "high",
      })) as { success: boolean; facet: Facet; skipped: boolean };

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });
  });

  describe("mem::facet-untag", () => {
    it("removes a specific value from a dimension", async () => {
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "priority",
        value: "high",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "priority",
        value: "urgent",
      });

      const result = (await sdk.trigger("mem::facet-untag", {
        targetId: "act_123",
        dimension: "priority",
        value: "high",
      })) as { success: boolean; removed: number };

      expect(result.success).toBe(true);
      expect(result.removed).toBe(1);

      const remaining = (await sdk.trigger("mem::facet-get", {
        targetId: "act_123",
      })) as { success: boolean; dimensions: Array<{ dimension: string; values: string[] }> };

      expect(remaining.dimensions[0].values).toEqual(["urgent"]);
    });

    it("removes all values in a dimension when value is omitted", async () => {
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "priority",
        value: "high",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_123",
        targetType: "action",
        dimension: "priority",
        value: "urgent",
      });

      const result = (await sdk.trigger("mem::facet-untag", {
        targetId: "act_123",
        dimension: "priority",
      })) as { success: boolean; removed: number };

      expect(result.success).toBe(true);
      expect(result.removed).toBe(2);

      const remaining = (await sdk.trigger("mem::facet-get", {
        targetId: "act_123",
      })) as { success: boolean; dimensions: Array<{ dimension: string; values: string[] }> };

      expect(remaining.dimensions).toEqual([]);
    });
  });

  describe("mem::facet-query", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_1",
        targetType: "action",
        dimension: "priority",
        value: "high",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_1",
        targetType: "action",
        dimension: "status",
        value: "active",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_2",
        targetType: "action",
        dimension: "priority",
        value: "low",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_2",
        targetType: "action",
        dimension: "status",
        value: "active",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "mem_1",
        targetType: "memory",
        dimension: "priority",
        value: "high",
      });
    });

    it("queries with matchAll (AND logic)", async () => {
      const result = (await sdk.trigger("mem::facet-query", {
        matchAll: ["priority:high", "status:active"],
      })) as { success: boolean; results: Array<{ targetId: string }> };

      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].targetId).toBe("act_1");
    });

    it("queries with matchAny (OR logic)", async () => {
      const result = (await sdk.trigger("mem::facet-query", {
        matchAny: ["priority:high", "priority:low"],
      })) as { success: boolean; results: Array<{ targetId: string }> };

      expect(result.success).toBe(true);
      expect(result.results.length).toBe(3);
    });

    it("queries with both matchAll and matchAny", async () => {
      const result = (await sdk.trigger("mem::facet-query", {
        matchAll: ["status:active"],
        matchAny: ["priority:high"],
      })) as { success: boolean; results: Array<{ targetId: string; matchedFacets: string[] }> };

      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].targetId).toBe("act_1");
      expect(result.results[0].matchedFacets).toContain("status:active");
      expect(result.results[0].matchedFacets).toContain("priority:high");
    });

    it("returns error when neither matchAll nor matchAny provided", async () => {
      const result = (await sdk.trigger("mem::facet-query", {})) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("at least one of matchAll or matchAny is required");
    });

    it("filters by targetType", async () => {
      const result = (await sdk.trigger("mem::facet-query", {
        matchAny: ["priority:high"],
        targetType: "memory",
      })) as { success: boolean; results: Array<{ targetId: string; targetType: string }> };

      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].targetId).toBe("mem_1");
      expect(result.results[0].targetType).toBe("memory");
    });

    it("respects limit", async () => {
      const result = (await sdk.trigger("mem::facet-query", {
        matchAny: ["priority:high", "priority:low"],
        limit: 1,
      })) as { success: boolean; results: Array<{ targetId: string }> };

      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
    });
  });

  describe("mem::facet-get", () => {
    it("returns facets grouped by dimension", async () => {
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_1",
        targetType: "action",
        dimension: "priority",
        value: "high",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_1",
        targetType: "action",
        dimension: "priority",
        value: "urgent",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_1",
        targetType: "action",
        dimension: "status",
        value: "active",
      });

      const result = (await sdk.trigger("mem::facet-get", {
        targetId: "act_1",
      })) as { success: boolean; dimensions: Array<{ dimension: string; values: string[] }> };

      expect(result.success).toBe(true);
      expect(result.dimensions.length).toBe(2);

      const priorityDim = result.dimensions.find((d) => d.dimension === "priority");
      expect(priorityDim).toBeDefined();
      expect(priorityDim!.values).toEqual(["high", "urgent"]);

      const statusDim = result.dimensions.find((d) => d.dimension === "status");
      expect(statusDim).toBeDefined();
      expect(statusDim!.values).toEqual(["active"]);
    });

    it("returns empty dimensions for target with no facets", async () => {
      const result = (await sdk.trigger("mem::facet-get", {
        targetId: "nonexistent",
      })) as { success: boolean; dimensions: Array<{ dimension: string; values: string[] }> };

      expect(result.success).toBe(true);
      expect(result.dimensions).toEqual([]);
    });
  });

  describe("mem::facet-stats", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_1",
        targetType: "action",
        dimension: "priority",
        value: "high",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_2",
        targetType: "action",
        dimension: "priority",
        value: "high",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_3",
        targetType: "action",
        dimension: "priority",
        value: "low",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "mem_1",
        targetType: "memory",
        dimension: "category",
        value: "bugfix",
      });
    });

    it("returns dimensions with value counts", async () => {
      const result = (await sdk.trigger("mem::facet-stats", {})) as {
        success: boolean;
        dimensions: Array<{
          dimension: string;
          values: Array<{ value: string; count: number }>;
        }>;
        totalFacets: number;
      };

      expect(result.success).toBe(true);
      expect(result.totalFacets).toBe(4);
      expect(result.dimensions.length).toBe(2);

      const priorityDim = result.dimensions.find((d) => d.dimension === "priority");
      expect(priorityDim).toBeDefined();
      const highVal = priorityDim!.values.find((v) => v.value === "high");
      expect(highVal!.count).toBe(2);
      const lowVal = priorityDim!.values.find((v) => v.value === "low");
      expect(lowVal!.count).toBe(1);
    });

    it("filters by targetType", async () => {
      const result = (await sdk.trigger("mem::facet-stats", {
        targetType: "memory",
      })) as {
        success: boolean;
        dimensions: Array<{
          dimension: string;
          values: Array<{ value: string; count: number }>;
        }>;
        totalFacets: number;
      };

      expect(result.success).toBe(true);
      expect(result.totalFacets).toBe(1);
      expect(result.dimensions.length).toBe(1);
      expect(result.dimensions[0].dimension).toBe("category");
      expect(result.dimensions[0].values[0].value).toBe("bugfix");
      expect(result.dimensions[0].values[0].count).toBe(1);
    });
  });

  describe("mem::facet-dimensions", () => {
    it("returns unique dimension names with counts", async () => {
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_1",
        targetType: "action",
        dimension: "priority",
        value: "high",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_2",
        targetType: "action",
        dimension: "priority",
        value: "low",
      });
      await sdk.trigger("mem::facet-tag", {
        targetId: "act_1",
        targetType: "action",
        dimension: "status",
        value: "active",
      });

      const result = (await sdk.trigger("mem::facet-dimensions", {})) as {
        success: boolean;
        dimensions: Array<{ dimension: string; count: number }>;
      };

      expect(result.success).toBe(true);
      expect(result.dimensions.length).toBe(2);

      const priorityDim = result.dimensions.find((d) => d.dimension === "priority");
      expect(priorityDim).toBeDefined();
      expect(priorityDim!.count).toBe(2);

      const statusDim = result.dimensions.find((d) => d.dimension === "status");
      expect(statusDim).toBeDefined();
      expect(statusDim!.count).toBe(1);
    });
  });
});
