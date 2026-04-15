import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerActionsFunction } from "../src/functions/actions.js";
import type { Action, ActionEdge } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

describe("Actions Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerActionsFunction(sdk as never, kv as never);
  });

  describe("mem::action-create", () => {
    it("creates an action with valid data", async () => {
      const result = (await sdk.trigger("mem::action-create", {
        title: "Fix login bug",
        description: "Users cannot log in with SSO",
        priority: 7,
        createdBy: "agent-1",
        project: "webapp",
        tags: ["bug", "auth"],
      })) as { success: boolean; action: Action; edges: ActionEdge[] };

      expect(result.success).toBe(true);
      expect(result.action.id).toMatch(/^act_/);
      expect(result.action.title).toBe("Fix login bug");
      expect(result.action.description).toBe("Users cannot log in with SSO");
      expect(result.action.status).toBe("pending");
      expect(result.action.priority).toBe(7);
      expect(result.action.createdBy).toBe("agent-1");
      expect(result.action.project).toBe("webapp");
      expect(result.action.tags).toEqual(["bug", "auth"]);
      expect(result.action.createdAt).toBeDefined();
      expect(result.action.updatedAt).toBeDefined();
      expect(result.edges).toEqual([]);
    });

    it("returns error when title is missing", async () => {
      const result = (await sdk.trigger("mem::action-create", {
        description: "No title provided",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("title is required");
    });

    it("clamps priority 0 to default 5 (falsy fallback)", async () => {
      const result = (await sdk.trigger("mem::action-create", {
        title: "Zero priority task",
        priority: 0,
      })) as { success: boolean; action: Action };

      expect(result.success).toBe(true);
      expect(result.action.priority).toBe(5);
    });

    it("clamps negative priority to 1", async () => {
      const result = (await sdk.trigger("mem::action-create", {
        title: "Negative priority task",
        priority: -3,
      })) as { success: boolean; action: Action };

      expect(result.success).toBe(true);
      expect(result.action.priority).toBe(1);
    });

    it("clamps priority 15 to 10", async () => {
      const result = (await sdk.trigger("mem::action-create", {
        title: "High priority task",
        priority: 15,
      })) as { success: boolean; action: Action };

      expect(result.success).toBe(true);
      expect(result.action.priority).toBe(10);
    });

    it("validates parent action exists", async () => {
      const result = (await sdk.trigger("mem::action-create", {
        title: "Child task",
        parentId: "nonexistent_parent",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("parent action not found");
    });

    it("creates action with valid parent", async () => {
      const parentResult = (await sdk.trigger("mem::action-create", {
        title: "Parent task",
      })) as { success: boolean; action: Action };

      const childResult = (await sdk.trigger("mem::action-create", {
        title: "Child task",
        parentId: parentResult.action.id,
      })) as { success: boolean; action: Action };

      expect(childResult.success).toBe(true);
      expect(childResult.action.parentId).toBe(parentResult.action.id);
    });

    it("creates inline edges with valid types", async () => {
      const targetResult = (await sdk.trigger("mem::action-create", {
        title: "Target action",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::action-create", {
        title: "Source action",
        edges: [
          { type: "requires", targetActionId: targetResult.action.id },
          { type: "unlocks", targetActionId: targetResult.action.id },
        ],
      })) as { success: boolean; action: Action; edges: ActionEdge[] };

      expect(result.success).toBe(true);
      expect(result.edges.length).toBe(2);
      expect(result.edges[0].id).toMatch(/^ae_/);
      expect(result.edges[0].type).toBe("requires");
      expect(result.edges[0].sourceActionId).toBe(result.action.id);
      expect(result.edges[0].targetActionId).toBe(targetResult.action.id);
      expect(result.edges[1].type).toBe("unlocks");
    });

    it("returns error for inline edge with invalid type", async () => {
      const targetResult = (await sdk.trigger("mem::action-create", {
        title: "Target action",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::action-create", {
        title: "Source action",
        edges: [
          { type: "invalid_type", targetActionId: targetResult.action.id },
        ],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("invalid edge type");
    });

    it("returns error for inline edge with nonexistent target", async () => {
      const result = (await sdk.trigger("mem::action-create", {
        title: "Source action",
        edges: [{ type: "requires", targetActionId: "nonexistent_id" }],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("target action not found");
    });
  });

  describe("mem::action-update", () => {
    it("updates an action with valid data", async () => {
      const createResult = (await sdk.trigger("mem::action-create", {
        title: "Original title",
        priority: 5,
      })) as { success: boolean; action: Action };

      const updateResult = (await sdk.trigger("mem::action-update", {
        actionId: createResult.action.id,
        title: "Updated title",
        priority: 8,
        status: "active",
        assignedTo: "agent-2",
        tags: ["updated"],
      })) as { success: boolean; action: Action };

      expect(updateResult.success).toBe(true);
      expect(updateResult.action.title).toBe("Updated title");
      expect(updateResult.action.priority).toBe(8);
      expect(updateResult.action.status).toBe("active");
      expect(updateResult.action.assignedTo).toBe("agent-2");
      expect(updateResult.action.tags).toEqual(["updated"]);
    });

    it("returns error when actionId is missing", async () => {
      const result = (await sdk.trigger("mem::action-update", {
        title: "no id",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("actionId is required");
    });

    it("returns error for nonexistent action", async () => {
      const result = (await sdk.trigger("mem::action-update", {
        actionId: "nonexistent_id",
        status: "done",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("action not found");
    });

    it("propagates completion when status set to done", async () => {
      const actionB = (await sdk.trigger("mem::action-create", {
        title: "Dependency B",
      })) as { success: boolean; action: Action };

      const actionA = (await sdk.trigger("mem::action-create", {
        title: "Action A depends on B",
        edges: [{ type: "requires", targetActionId: actionB.action.id }],
      })) as { success: boolean; action: Action };

      await sdk.trigger("mem::action-update", {
        actionId: actionA.action.id,
        status: "blocked",
      });

      await sdk.trigger("mem::action-update", {
        actionId: actionB.action.id,
        status: "done",
      });

      const getResult = (await sdk.trigger("mem::action-get", {
        actionId: actionA.action.id,
      })) as { success: boolean; action: Action };

      expect(getResult.action.status).toBe("pending");
    });
  });

  describe("mem::action-edge-create", () => {
    it("creates an edge between two actions", async () => {
      const source = (await sdk.trigger("mem::action-create", {
        title: "Source",
      })) as { success: boolean; action: Action };

      const target = (await sdk.trigger("mem::action-create", {
        title: "Target",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::action-edge-create", {
        sourceActionId: source.action.id,
        targetActionId: target.action.id,
        type: "requires",
      })) as { success: boolean; edge: ActionEdge };

      expect(result.success).toBe(true);
      expect(result.edge.id).toMatch(/^ae_/);
      expect(result.edge.type).toBe("requires");
      expect(result.edge.sourceActionId).toBe(source.action.id);
      expect(result.edge.targetActionId).toBe(target.action.id);
      expect(result.edge.createdAt).toBeDefined();
    });

    it("returns error when required fields are missing", async () => {
      const result = (await sdk.trigger("mem::action-edge-create", {
        sourceActionId: "some_id",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("required");
    });

    it("returns error for invalid edge type", async () => {
      const source = (await sdk.trigger("mem::action-create", {
        title: "Source",
      })) as { success: boolean; action: Action };

      const target = (await sdk.trigger("mem::action-create", {
        title: "Target",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::action-edge-create", {
        sourceActionId: source.action.id,
        targetActionId: target.action.id,
        type: "invalid_type",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("type must be one of");
    });

    it("returns error for nonexistent source action", async () => {
      const target = (await sdk.trigger("mem::action-create", {
        title: "Target",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::action-edge-create", {
        sourceActionId: "nonexistent",
        targetActionId: target.action.id,
        type: "requires",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("source action not found");
    });

    it("returns error for nonexistent target action", async () => {
      const source = (await sdk.trigger("mem::action-create", {
        title: "Source",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::action-edge-create", {
        sourceActionId: source.action.id,
        targetActionId: "nonexistent",
        type: "requires",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("target action not found");
    });
  });

  describe("mem::action-list", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::action-create", {
        title: "Task A",
        status: "pending",
        project: "alpha",
        tags: ["frontend"],
      });
      await new Promise((r) => setTimeout(r, 5));
      await sdk.trigger("mem::action-create", {
        title: "Task B",
        project: "alpha",
        tags: ["backend"],
      });
      await new Promise((r) => setTimeout(r, 5));
      await sdk.trigger("mem::action-create", {
        title: "Task C",
        project: "beta",
        tags: ["frontend", "backend"],
      });
    });

    it("returns all actions", async () => {
      const result = (await sdk.trigger("mem::action-list", {})) as {
        success: boolean;
        actions: Action[];
      };

      expect(result.success).toBe(true);
      expect(result.actions.length).toBe(3);
    });

    it("filters by status", async () => {
      const all = (await sdk.trigger("mem::action-list", {})) as {
        actions: Action[];
      };
      const firstAction = all.actions[0];

      await sdk.trigger("mem::action-update", {
        actionId: firstAction.id,
        status: "done",
      });

      const result = (await sdk.trigger("mem::action-list", {
        status: "done",
      })) as { success: boolean; actions: Action[] };

      expect(result.success).toBe(true);
      expect(result.actions.length).toBe(1);
      expect(result.actions[0].status).toBe("done");
    });

    it("filters by project", async () => {
      const result = (await sdk.trigger("mem::action-list", {
        project: "alpha",
      })) as { success: boolean; actions: Action[] };

      expect(result.success).toBe(true);
      expect(result.actions.length).toBe(2);
      expect(result.actions.every((a) => a.project === "alpha")).toBe(true);
    });

    it("filters by tags", async () => {
      const result = (await sdk.trigger("mem::action-list", {
        tags: ["backend"],
      })) as { success: boolean; actions: Action[] };

      expect(result.success).toBe(true);
      expect(result.actions.length).toBe(2);
      expect(
        result.actions.every((a) => a.tags.includes("backend")),
      ).toBe(true);
    });

    it("respects limit", async () => {
      const result = (await sdk.trigger("mem::action-list", {
        limit: 2,
      })) as { success: boolean; actions: Action[] };

      expect(result.success).toBe(true);
      expect(result.actions.length).toBe(2);
    });
  });

  describe("mem::action-get", () => {
    it("returns action with edges and children", async () => {
      const parent = (await sdk.trigger("mem::action-create", {
        title: "Parent",
      })) as { success: boolean; action: Action };

      const child = (await sdk.trigger("mem::action-create", {
        title: "Child",
        parentId: parent.action.id,
      })) as { success: boolean; action: Action };

      const other = (await sdk.trigger("mem::action-create", {
        title: "Other",
      })) as { success: boolean; action: Action };

      await sdk.trigger("mem::action-edge-create", {
        sourceActionId: parent.action.id,
        targetActionId: other.action.id,
        type: "unlocks",
      });

      const result = (await sdk.trigger("mem::action-get", {
        actionId: parent.action.id,
      })) as {
        success: boolean;
        action: Action;
        edges: ActionEdge[];
        children: Action[];
      };

      expect(result.success).toBe(true);
      expect(result.action.id).toBe(parent.action.id);
      expect(result.edges.length).toBe(1);
      expect(result.edges[0].type).toBe("unlocks");
      expect(result.children.length).toBe(1);
      expect(result.children[0].id).toBe(child.action.id);
    });

    it("returns error for missing actionId", async () => {
      const result = (await sdk.trigger("mem::action-get", {})) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("actionId is required");
    });

    it("returns error for nonexistent action", async () => {
      const result = (await sdk.trigger("mem::action-get", {
        actionId: "nonexistent",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("action not found");
    });
  });
});
