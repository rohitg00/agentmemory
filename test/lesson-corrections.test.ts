import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { getAllTools } from "../src/mcp/tools-registry.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import type { AuditEntry, Lesson } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

describe("lesson corrections", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerLessonsFunctions(sdk as never, kv as never);
  });

  async function saveLesson(content: string, project = "agentmemory") {
    const result = (await sdk.trigger("mem::lesson-save", {
      content,
      project,
      confidence: 0.8,
    })) as { lesson: Lesson };
    return result.lesson;
  }

  it("soft-deletes by exact ID with correction metadata and audit", async () => {
    const lesson = await saveLesson("Incorrect operational verdict");
    const expectedUpdatedAt = lesson.updatedAt;

    const result = (await sdk.trigger("mem::lesson-delete", {
      lessonId: lesson.id,
      reason: "Superseded by current evidence",
      actor: "codex",
      project: "agentmemory",
      expectedUpdatedAt,
    })) as { success: boolean; action: string; lesson: Lesson };

    expect(result).toMatchObject({
      success: true,
      action: "deleted",
      lesson: {
        id: lesson.id,
        deleted: true,
        lifecycle: "retracted",
        deletedBy: "codex",
        deleteReason: "Superseded by current evidence",
      },
    });
    expect(result.lesson.deletedAt).toBeDefined();
    expect(result.lesson.updatedAt).toBe(result.lesson.deletedAt);

    const recall = (await sdk.trigger("mem::lesson-recall", {
      query: "operational verdict",
      project: "agentmemory",
    })) as { lessons: Lesson[] };
    const list = (await sdk.trigger("mem::lesson-list", {
      project: "agentmemory",
    })) as { lessons: Lesson[] };
    expect(recall.lessons).toEqual([]);
    expect(list.lessons).toEqual([]);

    const audit = await kv.list<AuditEntry>("mem:audit");
    expect(audit.filter((entry) => entry.operation === "lesson_delete")).toEqual([
      expect.objectContaining({
        functionId: "mem::lesson-delete",
        targetIds: [lesson.id],
        details: expect.objectContaining({
          actor: "codex",
          reason: "Superseded by current evidence",
        }),
      }),
    ]);
  });

  it("is idempotent for the same delete and blocks silent resurrection", async () => {
    const lesson = await saveLesson("Do not resurrect this lesson");
    const correction = {
      lessonId: lesson.id,
      reason: "Incorrect",
      actor: "codex",
    };

    await sdk.trigger("mem::lesson-delete", correction);
    const repeated = (await sdk.trigger(
      "mem::lesson-delete",
      correction,
    )) as { success: boolean; action: string };
    const resave = (await sdk.trigger("mem::lesson-save", {
      content: lesson.content,
      project: lesson.project,
    })) as { success: boolean; code: string };

    expect(repeated).toMatchObject({
      success: true,
      action: "already_deleted",
    });
    expect(resave).toMatchObject({
      success: false,
      code: "lesson_deleted",
    });
    const audit = await kv.list<AuditEntry>("mem:audit");
    expect(
      audit.filter((entry) => entry.operation === "lesson_delete"),
    ).toHaveLength(1);
  });

  it("records supersession lineage to an existing same-project lesson", async () => {
    const original = await saveLesson("Old verdict");
    const replacement = await saveLesson("Corrected verdict");

    const result = (await sdk.trigger("mem::lesson-supersede", {
      lessonId: original.id,
      replacementLessonId: replacement.id,
      reason: "New evidence reversed the verdict",
      actor: "codex",
      project: "agentmemory",
      expectedUpdatedAt: original.updatedAt,
    })) as { success: boolean; action: string; lesson: Lesson };

    expect(result).toMatchObject({
      success: true,
      action: "superseded",
      lesson: {
        id: original.id,
        deleted: true,
        lifecycle: "superseded",
        supersededByLessonId: replacement.id,
      },
    });
    const storedReplacement = await kv.get<Lesson>(
      "mem:lessons",
      replacement.id,
    );
    expect(storedReplacement?.deleted).not.toBe(true);

    const audit = await kv.list<AuditEntry>("mem:audit");
    expect(
      audit.filter((entry) => entry.operation === "lesson_supersede"),
    ).toEqual([
      expect.objectContaining({
        targetIds: [original.id],
        details: expect.objectContaining({
          replacementLessonId: replacement.id,
        }),
      }),
    ]);
  });

  it("rejects stale, missing, and cross-project replacements", async () => {
    const original = await saveLesson("Original");
    const otherProject = await saveLesson("Other project", "trading-system");

    const stale = await sdk.trigger("mem::lesson-delete", {
      lessonId: original.id,
      reason: "Stale request",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    const missing = await sdk.trigger("mem::lesson-supersede", {
      lessonId: original.id,
      replacementLessonId: "lsn_missing",
      reason: "Missing replacement",
    });
    const crossProject = await sdk.trigger("mem::lesson-supersede", {
      lessonId: original.id,
      replacementLessonId: otherProject.id,
      reason: "Wrong project",
    });

    expect(stale).toMatchObject({
      success: false,
      code: "revision_conflict",
    });
    expect(missing).toMatchObject({
      success: false,
      code: "replacement_not_found",
    });
    expect(crossProject).toMatchObject({
      success: false,
      code: "project_mismatch",
    });
  });

  it("uses durable scope identity instead of project labels for structured supersession", async () => {
    const base = {
      project: "shared-label",
      mechanismId: "scope/identity",
      claim: "Durable scope identity controls correction joins.",
      scope: { ring: "repo", scopeId: "repo:one" },
    };
    const original = (await sdk.trigger("mem::lesson-save", {
      ...base,
      content: "Original scoped lesson",
    })) as { lesson: Lesson };
    const replacement = (await sdk.trigger("mem::lesson-save", {
      ...base,
      content: "Replacement in another repo",
      mechanismId: "scope/identity-v2",
      claim: "A project label is not a cross-repo join key.",
      scope: { ring: "repo", scopeId: "repo:two" },
    })) as { lesson: Lesson };

    const result = await sdk.trigger("mem::lesson-supersede", {
      lessonId: original.lesson.id,
      replacementLessonId: replacement.lesson.id,
      reason: "Attempted cross-scope correction",
    });

    expect(result).toMatchObject({
      success: false,
      code: "scope_mismatch",
    });
  });

  it("treats project as a label when structured lessons share a durable scope", async () => {
    const scope = { ring: "repo", scopeId: "repo:shared-authority" };
    const original = (await sdk.trigger("mem::lesson-save", {
      content: "Original label-scoped lesson",
      project: "legacy-label-one",
      mechanismId: "scope/shared-original",
      claim: "The original scoped claim applies.",
      scope,
    })) as { lesson: Lesson };
    const replacement = (await sdk.trigger("mem::lesson-save", {
      content: "Replacement label-scoped lesson",
      project: "legacy-label-two",
      mechanismId: "scope/shared-replacement",
      claim: "The corrected scoped claim applies.",
      scope,
    })) as { lesson: Lesson };

    const result = await sdk.trigger("mem::lesson-supersede", {
      lessonId: original.lesson.id,
      replacementLessonId: replacement.lesson.id,
      reason: "Durable scope, not project label, authorizes lineage",
    });

    expect(result).toMatchObject({
      success: true,
      action: "superseded",
    });
  });

  it("keeps refuted evidence recallable until it is explicitly retracted", async () => {
    const saved = (await sdk.trigger("mem::lesson-save", {
      content: "Refuted causal lesson remains negative evidence",
      mechanismId: "negative/evidence",
      claim: "The proposed mechanism improves outcomes.",
      evidenceVerdict: "refuted",
      evidenceRefs: [
        {
          kind: "experiment",
          projectId: "agentmemory",
          repoRemoteUrl: "https://github.com/rohitg00/agentmemory",
          commitSha: "c".repeat(40),
          recordedAt: "2026-08-02T20:00:00.000Z",
        },
      ],
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
    })) as { lesson: Lesson };
    const before = (await sdk.trigger("mem::lesson-recall", {
      query: "refuted negative evidence",
    })) as { lessons: Lesson[] };

    await sdk.trigger("mem::lesson-delete", {
      lessonId: saved.lesson.id,
      reason: "Underlying evidence artifact was invalid",
    });
    const after = (await sdk.trigger("mem::lesson-recall", {
      query: "refuted negative evidence",
    })) as { lessons: Lesson[] };

    expect(before.lessons).toHaveLength(1);
    expect(before.lessons[0]).toMatchObject({
      evidenceVerdict: "refuted",
      lifecycle: "active",
    });
    expect(after.lessons).toEqual([]);
  });

  it("serializes delete and strengthen so the tombstone wins", async () => {
    const lesson = await saveLesson("Concurrent lesson");
    const [deleted, strengthened] = await Promise.all([
      sdk.trigger("mem::lesson-delete", {
        lessonId: lesson.id,
        reason: "Concurrent correction",
      }),
      sdk.trigger("mem::lesson-strengthen", { lessonId: lesson.id }),
    ]);

    expect(deleted).toMatchObject({ success: true, action: "deleted" });
    expect(strengthened).toMatchObject({
      success: false,
      error: "lesson not found",
    });
    expect(await kv.get<Lesson>("mem:lessons", lesson.id)).toMatchObject({
      deleted: true,
      deleteReason: "Concurrent correction",
    });
  });

  it("exposes validated REST and MCP correction surfaces", async () => {
    registerApiTriggers(sdk as never, kv as never);
    registerMcpEndpoints(sdk as never, kv as never);
    const restLesson = await saveLesson("REST correction");
    const mcpOriginal = await saveLesson("MCP old");
    const mcpReplacement = await saveLesson("MCP replacement");

    const restResponse = (await sdk.trigger("api::lesson-delete", {
      headers: {},
      body: {
        lessonId: restLesson.id,
        reason: "REST evidence correction",
        actor: "codex",
      },
    })) as { status_code: number; body: { success: boolean } };
    expect(restResponse).toMatchObject({
      status_code: 200,
      body: { success: true },
    });

    const mcpResponse = (await sdk.trigger("mcp::tools::call", {
      headers: {},
      body: {
        name: "memory_lesson_supersede",
        arguments: {
          lessonId: mcpOriginal.id,
          replacementLessonId: mcpReplacement.id,
          reason: "MCP evidence correction",
          actor: "codex",
        },
      },
    })) as {
      status_code: number;
      body: { content: Array<{ type: string; text: string }> };
    };
    expect(mcpResponse.status_code).toBe(200);
    expect(JSON.parse(mcpResponse.body.content[0].text)).toMatchObject({
      success: true,
      action: "superseded",
    });

    const names = new Set(getAllTools().map((tool) => tool.name));
    expect(names.has("memory_lesson_delete")).toBe(true);
    expect(names.has("memory_lesson_supersede")).toBe(true);
  });
});
