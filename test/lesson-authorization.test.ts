import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerContextFunction } from "../src/functions/context.js";
import { registerCrystallizeFunction } from "../src/functions/crystallize.js";
import { systemLessonAccessContext } from "../src/functions/lesson-access.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerReflectFunctions } from "../src/functions/reflect.js";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import type {
  Crystal,
  ExportData,
  Insight,
  Lesson,
} from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

const REPO_ONE = {
  ring: "repo" as const,
  scopeId: "repo:https://github.com/wrightpt/agentmemory",
};
const REPO_TWO = {
  ring: "repo" as const,
  scopeId: "repo:https://github.com/wrightpt/trading-system",
};

function tokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function lessonInput(
  suffix: string,
  scope: typeof REPO_ONE | typeof REPO_TWO = REPO_ONE,
) {
  return {
    content: `Causal lesson ${suffix}`,
    project: "agentmemory",
    mechanismId: `authorization/${suffix}`,
    claim: `Caller ${suffix} can retrieve only authorized evidence.`,
    scope,
    sensitivity: "confidential" as const,
  };
}

function headers(token: string, agentId: string) {
  return {
    "x-agentmemory-caller-token": token,
    "x-agentmemory-agent-id": agentId,
  };
}

describe("lesson authorization boundaries", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let policyDir: string;
  let reflectionPrompts: string[];

  beforeEach(() => {
    policyDir = mkdtempSync(join(tmpdir(), "agentmemory-lesson-policy-"));
    const policyPath = join(policyDir, "callers.json");
    writeFileSync(
      policyPath,
      JSON.stringify({
        version: 1,
        principals: [
          {
            principalId: "codex",
            principalKind: "agent",
            tokenSha256: tokenDigest("codex-token"),
            clearance: "confidential",
            scopes: [{ ...REPO_ONE, access: "write" }],
            capabilities: ["lesson:export", "lesson:import"],
          },
          {
            principalId: "readonly",
            principalKind: "agent",
            tokenSha256: tokenDigest("readonly-token"),
            clearance: "confidential",
            scopes: [{ ...REPO_ONE, access: "read" }],
            capabilities: [],
          },
          {
            principalId: "patrick",
            principalKind: "human",
            tokenSha256: tokenDigest("human-token"),
            clearance: "restricted",
            scopes: [{ ring: "global", access: "write" }],
            capabilities: [
              "lesson:approve-global",
              "lesson:all-scopes",
              "lesson:export",
              "lesson:import",
            ],
          },
          {
            principalId: "backup-service",
            principalKind: "service",
            tokenSha256: tokenDigest("backup-token"),
            clearance: "restricted",
            scopes: [],
            capabilities: [
              "lesson:all-scopes",
              "lesson:export",
              "lesson:import",
            ],
          },
        ],
      }),
    );
    process.env["AGENTMEMORY_LESSON_ACCESS_MODE"] = "enforce";
    process.env["AGENTMEMORY_LESSON_CALLER_POLICY_FILE"] = policyPath;

    sdk = mockSdk();
    kv = mockKV();
    reflectionPrompts = [];
    registerLessonsFunctions(sdk as never, kv as never);
    registerCrystallizeFunction(
      sdk as never,
      kv as never,
      {
        summarize: async () =>
          JSON.stringify({
            narrative: "Authorized crystal",
            keyOutcomes: ["done"],
            filesAffected: [],
            lessons: ["Derived crystallization lesson"],
          }),
      } as never,
    );
    registerContextFunction(sdk as never, kv as never, 2000);
    registerSmartSearchFunction(
      sdk as never,
      kv as never,
      async () => [],
    );
    registerExportImportFunction(sdk as never, kv as never);
    registerReflectFunctions(
      sdk as never,
      kv as never,
      {
        summarize: async (_system: string, prompt: string) => {
          reflectionPrompts.push(prompt);
          return "";
        },
      } as never,
    );
    registerApiTriggers(sdk as never, kv as never);
    registerMcpEndpoints(sdk as never, kv as never);
  });

  afterEach(() => {
    delete process.env["AGENTMEMORY_LESSON_ACCESS_MODE"];
    delete process.env["AGENTMEMORY_LESSON_CALLER_POLICY_FILE"];
    rmSync(policyDir, { recursive: true, force: true });
  });

  it("requires server-resolved identity and ignores a caller-supplied context", async () => {
    const response = (await sdk.trigger("api::lesson-save", {
      headers: {},
      body: {
        ...lessonInput("spoof"),
        accessContext: systemLessonAccessContext(),
      },
    })) as { status_code: number; body: { code: string } };

    expect(response).toMatchObject({
      status_code: 401,
      body: { code: "caller_authentication_failed" },
    });
    expect(await kv.list("mem:lessons")).toEqual([]);
  });

  it("allows only the authenticated principal's scope and clearance", async () => {
    const allowed = (await sdk.trigger("api::lesson-save", {
      headers: headers("codex-token", "codex"),
      body: lessonInput("allowed"),
    })) as { status_code: number; body: { lesson: Lesson } };
    const denied = (await sdk.trigger("api::lesson-save", {
      headers: headers("codex-token", "codex"),
      body: lessonInput("denied", REPO_TWO),
    })) as { status_code: number; body: { code: string } };

    expect(allowed.status_code).toBe(201);
    expect(allowed.body.lesson.scope).toEqual(REPO_ONE);
    expect(denied).toMatchObject({
      status_code: 403,
      body: { code: "access_denied" },
    });
    expect(await kv.list("mem:lessons")).toHaveLength(1);
  });

  it("cannot create a contradiction relation to a lesson above its clearance", async () => {
    const hidden = (await sdk.trigger("mem::lesson-save", {
      ...lessonInput("restricted-target"),
      sensitivity: "restricted",
      accessContext: systemLessonAccessContext(),
    })) as { lesson: Lesson };

    const response = (await sdk.trigger("api::lesson-save", {
      headers: headers("codex-token", "codex"),
      body: {
        ...lessonInput("relation-source"),
        contradictedByLessonIds: [hidden.lesson.id],
      },
    })) as { status_code: number; body: { code: string } };

    expect(response).toMatchObject({
      status_code: 403,
      body: { code: "access_denied" },
    });
    expect(await kv.list("mem:lessons")).toHaveLength(1);
  });

  it("filters list and recall totals without revealing other scopes", async () => {
    const system = systemLessonAccessContext();
    await sdk.trigger("mem::lesson-save", {
      ...lessonInput("visible"),
      accessContext: system,
    });
    await sdk.trigger("mem::lesson-save", {
      ...lessonInput("hidden", REPO_TWO),
      accessContext: system,
    });

    const list = (await sdk.trigger("api::lesson-list", {
      headers: headers("codex-token", "codex"),
      query_params: {},
    })) as {
      status_code: number;
      body: { total: number; lessons: Lesson[] };
    };
    const recall = (await sdk.trigger("api::lesson-search", {
      headers: headers("codex-token", "codex"),
      body: { query: "causal lesson" },
    })) as {
      status_code: number;
      body: { lessons: Lesson[] };
    };
    expect(list.body.total).toBe(1);
    expect(list.body.lessons.map((lesson) => lesson.mechanismId)).toEqual([
      "authorization/visible",
    ]);
    expect(recall.body.lessons).toHaveLength(1);
  });

  it("reserves whole-database export for a restricted all-scopes operator", async () => {
    const system = systemLessonAccessContext();
    await sdk.trigger("mem::lesson-save", {
      ...lessonInput("operator-visible"),
      accessContext: system,
    });
    await sdk.trigger("mem::lesson-save", {
      ...lessonInput("operator-other", REPO_TWO),
      accessContext: system,
    });

    const repoCaller = (await sdk.trigger("api::export", {
      headers: headers("codex-token", "codex"),
      query_params: {},
    })) as { status_code: number; body: { code: string } };
    const operator = (await sdk.trigger("api::export", {
      headers: headers("human-token", "patrick"),
      query_params: {},
    })) as { status_code: number; body: ExportData };

    expect(repoCaller).toMatchObject({
      status_code: 403,
      body: { code: "access_denied" },
    });
    expect(operator.status_code).toBe(200);
    expect(operator.body.lessons).toHaveLength(2);
  });

  it("filters injected context and smart-search lesson results", async () => {
    const system = systemLessonAccessContext();
    await sdk.trigger("mem::lesson-save", {
      ...lessonInput("context-visible"),
      accessContext: system,
    });
    await sdk.trigger("mem::lesson-save", {
      ...lessonInput("context-hidden", REPO_TWO),
      accessContext: system,
    });

    const context = (await sdk.trigger("api::context", {
      headers: headers("codex-token", "codex"),
      body: {
        sessionId: "ses_current",
        project: "agentmemory",
        budget: 2000,
      },
    })) as { status_code: number; body: { context: string } };
    const smart = (await sdk.trigger("api::smart-search", {
      headers: headers("codex-token", "codex"),
      body: {
        query: "causal lesson context",
        includeLessons: true,
        project: "agentmemory",
      },
    })) as {
      status_code: number;
      body: { lessons: Array<{ lessonId: string; content: string }> };
    };

    expect(context.body.context).toContain("Causal lesson context-visible");
    expect(context.body.context).not.toContain("context-hidden");
    expect(smart.body.lessons).toHaveLength(1);
    expect(smart.body.lessons[0].content).toContain("context-visible");
  });

  it("filters unauthorized lessons before constructing reflection prompts", async () => {
    const system = systemLessonAccessContext();
    for (const suffix of ["reflect-visible-a", "reflect-visible-b", "reflect-visible-c"]) {
      await sdk.trigger("mem::lesson-save", {
        ...lessonInput(suffix),
        tags: ["shared", "authorization"],
        accessContext: system,
      });
    }
    await sdk.trigger("mem::lesson-save", {
      ...lessonInput("reflect-hidden", REPO_TWO),
      tags: ["shared", "authorization"],
      accessContext: system,
    });

    const response = (await sdk.trigger("api::reflect", {
      headers: headers("codex-token", "codex"),
      body: { project: "agentmemory" },
    })) as { status_code: number };

    expect(response.status_code).toBe(200);
    expect(reflectionPrompts.length).toBeGreaterThan(0);
    expect(reflectionPrompts.join("\n")).toContain("reflect-visible-a");
    expect(reflectionPrompts.join("\n")).not.toContain("reflect-hidden");
  });

  it("requires explicit export capability before reading lesson state", async () => {
    const response = (await sdk.trigger("api::export", {
      headers: headers("readonly-token", "readonly"),
      query_params: {},
    })) as { status_code: number; body: { code: string } };

    expect(response).toMatchObject({
      status_code: 403,
      body: { code: "access_denied" },
    });
  });

  it("rejects a non-operator import before writing any lesson", async () => {
    const candidate = (await sdk.trigger("mem::lesson-save", {
      ...lessonInput("import-hidden", REPO_TWO),
      accessContext: systemLessonAccessContext(),
    })) as { lesson: Lesson };
    await kv.delete("mem:lessons", candidate.lesson.id);
    const exportData: ExportData = {
      version: "0.9.27",
      exportedAt: "2026-08-03T01:00:00.000Z",
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      lessons: [candidate.lesson],
    };

    const response = (await sdk.trigger("api::import", {
      headers: headers("codex-token", "codex"),
      body: { exportData, strategy: "merge" },
    })) as { status_code: number; body: { code: string } };

    expect(response).toMatchObject({
      status_code: 403,
      body: { code: "access_denied" },
    });
    expect(await kv.list("mem:lessons")).toEqual([]);
  });

  it("server-stamps global human approval and rejects agent approval", async () => {
    const body = {
      content: "Human-approved global causal lesson",
      mechanismId: "authorization/global",
      claim: "Global lessons require authenticated human approval.",
      scope: {
        ring: "global",
        humanApproval: {
          approvedAt: "2026-08-03T01:00:00.000Z",
          reason: "Reviewed for global publication.",
        },
      },
      sensitivity: "internal",
    };
    const human = (await sdk.trigger("api::lesson-save", {
      headers: headers("human-token", "patrick"),
      body,
    })) as { status_code: number; body: { lesson: Lesson } };
    const agent = (await sdk.trigger("api::lesson-save", {
      headers: headers("codex-token", "codex"),
      body,
    })) as { status_code: number; body: { code: string } };

    expect(human.status_code).toBe(201);
    expect(human.body.lesson.scope?.humanApproval?.approvedBy).toBe("patrick");
    expect(human.body.lesson.scope?.humanApproval?.approvedAt).not.toBe(
      body.scope.humanApproval.approvedAt,
    );
    expect(
      Date.parse(human.body.lesson.scope?.humanApproval?.approvedAt ?? ""),
    ).not.toBeNaN();
    expect(agent).toMatchObject({
      status_code: 403,
      body: { code: "access_denied" },
    });
  });

  it("requires a human operator to restore a global lesson", async () => {
    const saved = (await sdk.trigger("api::lesson-save", {
      headers: headers("human-token", "patrick"),
      body: {
        content: "Restorable global causal lesson",
        mechanismId: "authorization/global-restore",
        claim: "Global restoration requires a fresh human approval.",
        scope: {
          ring: "global",
          humanApproval: {
            approvedAt: "2026-08-03T01:00:00.000Z",
            reason: "Approved for backup restoration.",
          },
        },
        sensitivity: "internal",
      },
    })) as { body: { lesson: Lesson } };
    await kv.delete("mem:lessons", saved.body.lesson.id);
    const exportData: ExportData = {
      version: "0.9.27",
      exportedAt: "2026-08-03T01:00:00.000Z",
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      lessons: [saved.body.lesson],
    };

    const service = (await sdk.trigger("api::import", {
      headers: headers("backup-token", "backup-service"),
      body: { exportData, strategy: "merge" },
    })) as { status_code: number; body: { code: string } };
    expect(service).toMatchObject({
      status_code: 403,
      body: { code: "access_denied" },
    });
    expect(await kv.list("mem:lessons")).toEqual([]);

    const human = (await sdk.trigger("api::import", {
      headers: headers("human-token", "patrick"),
      body: { exportData, strategy: "merge" },
    })) as { status_code: number; body: { success: boolean } };
    const restored = await kv.get<Lesson>(
      "mem:lessons",
      saved.body.lesson.id,
    );
    expect(human).toMatchObject({
      status_code: 200,
      body: { success: true },
    });
    expect(restored?.scope?.humanApproval?.approvedBy).toBe("patrick");
    expect(restored?.scope?.humanApproval?.approvedAt).not.toBe(
      saved.body.lesson.scope?.humanApproval?.approvedAt,
    );
  });

  it("filters crystals and insights by their lesson provenance", async () => {
    const system = systemLessonAccessContext();
    const visible = (await sdk.trigger("mem::lesson-save", {
      ...lessonInput("projection-visible"),
      accessContext: system,
    })) as { lesson: Lesson };
    const hidden = (await sdk.trigger("mem::lesson-save", {
      ...lessonInput("projection-hidden", REPO_TWO),
      accessContext: system,
    })) as { lesson: Lesson };

    const visibleCrystal: Crystal = {
      id: "crys_visible",
      narrative: "Visible crystal",
      keyOutcomes: [],
      filesAffected: [],
      lessons: [visible.lesson.content],
      sourceLessonIds: [visible.lesson.id],
      sourceActionIds: [],
      createdAt: "2026-08-03T01:00:00.000Z",
    };
    const hiddenCrystal: Crystal = {
      ...visibleCrystal,
      id: "crys_hidden",
      narrative: "Hidden crystal",
      lessons: [hidden.lesson.content],
      sourceLessonIds: [hidden.lesson.id],
    };
    await kv.set("mem:crystals", visibleCrystal.id, visibleCrystal);
    await kv.set("mem:crystals", hiddenCrystal.id, hiddenCrystal);

    const insightBase: Insight = {
      id: "ins_visible",
      title: "Visible insight",
      content: "Visible derived content",
      confidence: 0.8,
      reinforcements: 0,
      sourceConceptCluster: [],
      sourceMemoryIds: [],
      sourceLessonIds: [visible.lesson.id],
      sourceCrystalIds: [visibleCrystal.id],
      tags: [],
      createdAt: "2026-08-03T01:00:00.000Z",
      updatedAt: "2026-08-03T01:00:00.000Z",
      decayRate: 0.05,
    };
    await kv.set("mem:insights", insightBase.id, insightBase);
    await kv.set("mem:insights", "ins_hidden", {
      ...insightBase,
      id: "ins_hidden",
      title: "Hidden insight",
      content: "Hidden derived content",
      sourceLessonIds: [hidden.lesson.id],
      sourceCrystalIds: [hiddenCrystal.id],
    });
    await kv.set("mem:crystals", "crys_spoofed", {
      ...visibleCrystal,
      id: "crys_spoofed",
      narrative: "Spoofed crystal",
      lessons: ["Hidden derived content with visible provenance"],
    });

    const crystals = (await sdk.trigger("api::crystal-list", {
      headers: headers("codex-token", "codex"),
      query_params: {},
    })) as { body: { crystals: Crystal[] } };
    const insights = (await sdk.trigger("api::insight-list", {
      headers: headers("codex-token", "codex"),
      query_params: {},
    })) as { body: { insights: Insight[] } };

    expect(crystals.body.crystals.map((crystal) => crystal.id)).toEqual([
      visibleCrystal.id,
    ]);
    expect(insights.body.insights.map((insight) => insight.id)).toEqual([
      insightBase.id,
    ]);
    expect(JSON.stringify({ crystals, insights })).not.toContain(
      "Hidden derived",
    );
    expect(crystals.body.crystals.map((crystal) => crystal.id)).not.toContain(
      "crys_spoofed",
    );
  });

  it("does not mint system authority for public crystallization", async () => {
    await kv.set("mem:actions", "act_crystallize", {
      id: "act_crystallize",
      title: "Crystallize safely",
      status: "done",
      lifecycle: "done",
      priority: 5,
      tags: [],
      createdAt: "2026-08-03T01:00:00.000Z",
      updatedAt: "2026-08-03T01:00:00.000Z",
    });

    const response = (await sdk.trigger("api::crystallize", {
      headers: headers("codex-token", "codex"),
      body: { actionIds: ["act_crystallize"], project: "agentmemory" },
    })) as { status_code: number; body: { crystal: Crystal } };

    expect(response.status_code).toBe(200);
    expect(response.body.crystal.lessons).toEqual([]);
    expect(response.body.crystal.sourceLessonIds).toEqual([]);
    expect(await kv.list("mem:lessons")).toEqual([]);
  });

  it("server-stamps correction actors across REST and MCP", async () => {
    const saved = (await sdk.trigger("api::lesson-save", {
      headers: headers("codex-token", "codex"),
      body: lessonInput("correction"),
    })) as { body: { lesson: Lesson } };

    const deleted = (await sdk.trigger("api::lesson-delete", {
      headers: headers("codex-token", "codex"),
      body: {
        lessonId: saved.body.lesson.id,
        reason: "Evidence was invalidated.",
        actor: "spoofed-human",
      },
    })) as { status_code: number };
    const stored = await kv.get<Lesson>("mem:lessons", saved.body.lesson.id);

    expect(deleted.status_code).toBe(200);
    expect(stored?.deletedBy).toBe("codex");

    const mcp = (await sdk.trigger("mcp::tools::call", {
      headers: headers("readonly-token", "readonly"),
      body: {
        name: "memory_lesson_delete",
        arguments: {
          lessonId: saved.body.lesson.id,
          reason: "Read-only caller cannot mutate.",
          actor: "codex",
        },
      },
    })) as { status_code: number; body: { content: Array<{ text: string }> } };
    expect(mcp.status_code).toBe(200);
    expect(JSON.parse(mcp.body.content[0].text)).toMatchObject({
      success: false,
      code: "access_denied",
    });
  });
});
