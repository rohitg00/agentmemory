import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerSketchesFunction } from "../src/functions/sketches.js";
import type { Action, ActionEdge, Sketch } from "../src/types.js";

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

describe("Sketches Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerSketchesFunction(sdk as never, kv as never);
  });

  describe("mem::sketch-create", () => {
    it("creates a sketch with valid title", async () => {
      const result = (await sdk.trigger("mem::sketch-create", {
        title: "Refactor auth module",
      })) as { success: boolean; sketch: Sketch };

      expect(result.success).toBe(true);
      expect(result.sketch.id).toMatch(/^sk_/);
      expect(result.sketch.title).toBe("Refactor auth module");
      expect(result.sketch.status).toBe("active");
      expect(result.sketch.actionIds).toEqual([]);
      expect(result.sketch.createdAt).toBeDefined();
      expect(result.sketch.expiresAt).toBeDefined();
    });

    it("returns error when title is empty", async () => {
      const result = (await sdk.trigger("mem::sketch-create", {
        title: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("title is required");
    });

    it("returns error when title is missing", async () => {
      const result = (await sdk.trigger("mem::sketch-create", {})) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("title is required");
    });

    it("creates a sketch with custom TTL", async () => {
      const result = (await sdk.trigger("mem::sketch-create", {
        title: "Short-lived sketch",
        expiresInMs: 60000,
      })) as { success: boolean; sketch: Sketch };

      expect(result.success).toBe(true);
      const created = new Date(result.sketch.createdAt).getTime();
      const expires = new Date(result.sketch.expiresAt).getTime();
      expect(expires - created).toBe(60000);
    });

    it("defaults TTL to one hour", async () => {
      const result = (await sdk.trigger("mem::sketch-create", {
        title: "Default TTL",
      })) as { success: boolean; sketch: Sketch };

      expect(result.success).toBe(true);
      const created = new Date(result.sketch.createdAt).getTime();
      const expires = new Date(result.sketch.expiresAt).getTime();
      expect(expires - created).toBe(3600000);
    });

    it("stores project on sketch", async () => {
      const result = (await sdk.trigger("mem::sketch-create", {
        title: "Project sketch",
        project: "webapp",
      })) as { success: boolean; sketch: Sketch };

      expect(result.success).toBe(true);
      expect(result.sketch.project).toBe("webapp");
    });
  });

  describe("mem::sketch-add", () => {
    let sketchId: string;

    beforeEach(async () => {
      const result = (await sdk.trigger("mem::sketch-create", {
        title: "Test sketch",
        project: "myproject",
      })) as { success: boolean; sketch: Sketch };
      sketchId = result.sketch.id;
    });

    it("adds an action to the sketch", async () => {
      const result = (await sdk.trigger("mem::sketch-add", {
        sketchId,
        title: "Implement login",
        description: "Add SSO support",
        priority: 8,
      })) as { success: boolean; action: Action; edges: ActionEdge[] };

      expect(result.success).toBe(true);
      expect(result.action.id).toMatch(/^act_/);
      expect(result.action.title).toBe("Implement login");
      expect(result.action.description).toBe("Add SSO support");
      expect(result.action.priority).toBe(8);
      expect(result.action.sketchId).toBe(sketchId);
      expect(result.action.project).toBe("myproject");
      expect(result.action.createdBy).toBe("sketch");
      expect(result.edges).toEqual([]);
    });

    it("returns error for non-existent sketch", async () => {
      const result = (await sdk.trigger("mem::sketch-add", {
        sketchId: "nonexistent",
        title: "Some action",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sketch not found");
    });

    it("returns error for non-active sketch", async () => {
      await sdk.trigger("mem::sketch-promote", { sketchId });

      const result = (await sdk.trigger("mem::sketch-add", {
        sketchId,
        title: "Late action",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sketch is not active");
    });

    it("adds action with dependsOn within sketch", async () => {
      const first = (await sdk.trigger("mem::sketch-add", {
        sketchId,
        title: "First step",
      })) as { success: boolean; action: Action };

      const second = (await sdk.trigger("mem::sketch-add", {
        sketchId,
        title: "Second step",
        dependsOn: [first.action.id],
      })) as { success: boolean; action: Action; edges: ActionEdge[] };

      expect(second.success).toBe(true);
      expect(second.edges.length).toBe(1);
      expect(second.edges[0].type).toBe("requires");
      expect(second.edges[0].sourceActionId).toBe(second.action.id);
      expect(second.edges[0].targetActionId).toBe(first.action.id);
    });

    it("returns error for dependsOn referencing action outside sketch", async () => {
      const result = (await sdk.trigger("mem::sketch-add", {
        sketchId,
        title: "Depends on external",
        dependsOn: ["act_outside"],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found in this sketch");
    });

    it("returns error when sketchId is missing", async () => {
      const result = (await sdk.trigger("mem::sketch-add", {
        title: "No sketch",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sketchId is required");
    });

    it("returns error when title is missing", async () => {
      const result = (await sdk.trigger("mem::sketch-add", {
        sketchId,
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("title is required");
    });
  });

  describe("mem::sketch-promote", () => {
    it("promotes sketch and removes sketchId from actions", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "Promotable sketch",
        project: "alpha",
      })) as { success: boolean; sketch: Sketch };

      const a1 = (await sdk.trigger("mem::sketch-add", {
        sketchId: sketch.sketch.id,
        title: "Action 1",
      })) as { success: boolean; action: Action };

      const a2 = (await sdk.trigger("mem::sketch-add", {
        sketchId: sketch.sketch.id,
        title: "Action 2",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::sketch-promote", {
        sketchId: sketch.sketch.id,
      })) as { success: boolean; promotedIds: string[] };

      expect(result.success).toBe(true);
      expect(result.promotedIds).toContain(a1.action.id);
      expect(result.promotedIds).toContain(a2.action.id);
      expect(result.promotedIds.length).toBe(2);

      const stored = await kv.get<Action>("mem:actions", a1.action.id);
      expect(stored!.sketchId).toBeUndefined();
      expect(stored!.project).toBe("alpha");
    });

    it("promotes sketch with project override", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "Override project",
        project: "original",
      })) as { success: boolean; sketch: Sketch };

      const a = (await sdk.trigger("mem::sketch-add", {
        sketchId: sketch.sketch.id,
        title: "Task",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::sketch-promote", {
        sketchId: sketch.sketch.id,
        project: "newproject",
      })) as { success: boolean; promotedIds: string[] };

      expect(result.success).toBe(true);

      const stored = await kv.get<Action>("mem:actions", a.action.id);
      expect(stored!.project).toBe("newproject");
      expect(stored!.sketchId).toBeUndefined();
    });

    it("returns error for non-active sketch", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "To be discarded",
      })) as { success: boolean; sketch: Sketch };

      await sdk.trigger("mem::sketch-discard", {
        sketchId: sketch.sketch.id,
      });

      const result = (await sdk.trigger("mem::sketch-promote", {
        sketchId: sketch.sketch.id,
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sketch is not active");
    });

    it("returns error for non-existent sketch", async () => {
      const result = (await sdk.trigger("mem::sketch-promote", {
        sketchId: "nonexistent",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sketch not found");
    });

    it("sets sketch status to promoted", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "Promote me",
      })) as { success: boolean; sketch: Sketch };

      await sdk.trigger("mem::sketch-promote", {
        sketchId: sketch.sketch.id,
      });

      const stored = await kv.get<Sketch>("mem:sketches", sketch.sketch.id);
      expect(stored!.status).toBe("promoted");
      expect(stored!.promotedAt).toBeDefined();
    });
  });

  describe("mem::sketch-discard", () => {
    it("discards sketch and deletes actions and edges", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "Discard me",
      })) as { success: boolean; sketch: Sketch };

      const a1 = (await sdk.trigger("mem::sketch-add", {
        sketchId: sketch.sketch.id,
        title: "Action 1",
      })) as { success: boolean; action: Action };

      const a2 = (await sdk.trigger("mem::sketch-add", {
        sketchId: sketch.sketch.id,
        title: "Action 2",
        dependsOn: [a1.action.id],
      })) as { success: boolean; action: Action; edges: ActionEdge[] };

      const result = (await sdk.trigger("mem::sketch-discard", {
        sketchId: sketch.sketch.id,
      })) as { success: boolean; discardedCount: number };

      expect(result.success).toBe(true);
      expect(result.discardedCount).toBe(2);

      const storedA1 = await kv.get<Action>("mem:actions", a1.action.id);
      expect(storedA1).toBeNull();

      const storedA2 = await kv.get<Action>("mem:actions", a2.action.id);
      expect(storedA2).toBeNull();

      const storedEdge = await kv.get<ActionEdge>(
        "mem:action-edges",
        a2.edges[0].id,
      );
      expect(storedEdge).toBeNull();

      const storedSketch = await kv.get<Sketch>(
        "mem:sketches",
        sketch.sketch.id,
      );
      expect(storedSketch!.status).toBe("discarded");
      expect(storedSketch!.discardedAt).toBeDefined();
    });

    it("returns error for non-active sketch", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "Promote first",
      })) as { success: boolean; sketch: Sketch };

      await sdk.trigger("mem::sketch-promote", {
        sketchId: sketch.sketch.id,
      });

      const result = (await sdk.trigger("mem::sketch-discard", {
        sketchId: sketch.sketch.id,
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sketch is not active");
    });

    it("returns error for non-existent sketch", async () => {
      const result = (await sdk.trigger("mem::sketch-discard", {
        sketchId: "nonexistent",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sketch not found");
    });
  });

  describe("mem::sketch-list", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::sketch-create", {
        title: "Active alpha",
        project: "alpha",
      });
      await new Promise((r) => setTimeout(r, 5));
      await sdk.trigger("mem::sketch-create", {
        title: "Active beta",
        project: "beta",
      });
      await new Promise((r) => setTimeout(r, 5));
      const toPromote = (await sdk.trigger("mem::sketch-create", {
        title: "Promoted alpha",
        project: "alpha",
      })) as { success: boolean; sketch: Sketch };
      await sdk.trigger("mem::sketch-promote", {
        sketchId: toPromote.sketch.id,
      });
    });

    it("returns all sketches", async () => {
      const result = (await sdk.trigger("mem::sketch-list", {})) as {
        success: boolean;
        sketches: (Sketch & { actionCount: number })[];
      };

      expect(result.success).toBe(true);
      expect(result.sketches.length).toBe(3);
    });

    it("filters by status", async () => {
      const result = (await sdk.trigger("mem::sketch-list", {
        status: "active",
      })) as {
        success: boolean;
        sketches: (Sketch & { actionCount: number })[];
      };

      expect(result.success).toBe(true);
      expect(result.sketches.length).toBe(2);
      expect(result.sketches.every((s) => s.status === "active")).toBe(true);
    });

    it("filters by project", async () => {
      const result = (await sdk.trigger("mem::sketch-list", {
        project: "alpha",
      })) as {
        success: boolean;
        sketches: (Sketch & { actionCount: number })[];
      };

      expect(result.success).toBe(true);
      expect(result.sketches.length).toBe(2);
      expect(result.sketches.every((s) => s.project === "alpha")).toBe(true);
    });

    it("includes actionCount in results", async () => {
      const result = (await sdk.trigger("mem::sketch-list", {})) as {
        success: boolean;
        sketches: (Sketch & { actionCount: number })[];
      };

      expect(result.success).toBe(true);
      expect(result.sketches[0].actionCount).toBe(0);
    });
  });

  describe("mem::sketch-gc", () => {
    it("collects expired active sketches", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "Expired sketch",
        expiresInMs: 1,
      })) as { success: boolean; sketch: Sketch };

      await sdk.trigger("mem::sketch-add", {
        sketchId: sketch.sketch.id,
        title: "Doomed action",
      });

      await new Promise((r) => setTimeout(r, 10));

      const result = (await sdk.trigger("mem::sketch-gc", {})) as {
        success: boolean;
        collected: number;
      };

      expect(result.success).toBe(true);
      expect(result.collected).toBe(1);

      const stored = await kv.get<Sketch>("mem:sketches", sketch.sketch.id);
      expect(stored!.status).toBe("discarded");
      expect(stored!.discardedAt).toBeDefined();
    });

    it("skips non-expired sketches", async () => {
      await sdk.trigger("mem::sketch-create", {
        title: "Still alive",
        expiresInMs: 3600000,
      });

      const result = (await sdk.trigger("mem::sketch-gc", {})) as {
        success: boolean;
        collected: number;
      };

      expect(result.success).toBe(true);
      expect(result.collected).toBe(0);
    });

    it("skips non-active sketches", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "Already promoted",
        expiresInMs: 1,
      })) as { success: boolean; sketch: Sketch };

      await sdk.trigger("mem::sketch-promote", {
        sketchId: sketch.sketch.id,
      });

      await new Promise((r) => setTimeout(r, 10));

      const result = (await sdk.trigger("mem::sketch-gc", {})) as {
        success: boolean;
        collected: number;
      };

      expect(result.success).toBe(true);
      expect(result.collected).toBe(0);
    });

    it("deletes actions and edges of expired sketches", async () => {
      const sketch = (await sdk.trigger("mem::sketch-create", {
        title: "GC with cleanup",
        expiresInMs: 1,
      })) as { success: boolean; sketch: Sketch };

      const a1 = (await sdk.trigger("mem::sketch-add", {
        sketchId: sketch.sketch.id,
        title: "Step 1",
      })) as { success: boolean; action: Action };

      await sdk.trigger("mem::sketch-add", {
        sketchId: sketch.sketch.id,
        title: "Step 2",
        dependsOn: [a1.action.id],
      });

      await new Promise((r) => setTimeout(r, 10));

      await sdk.trigger("mem::sketch-gc", {});

      const storedAction = await kv.get<Action>("mem:actions", a1.action.id);
      expect(storedAction).toBeNull();
    });
  });
});
