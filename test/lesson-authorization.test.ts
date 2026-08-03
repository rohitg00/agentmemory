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
import { systemLessonAccessContext } from "../src/functions/lesson-access.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerReflectFunctions } from "../src/functions/reflect.js";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import type { ExportData, Lesson } from "../src/types.js";
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
            capabilities: ["lesson:approve-global"],
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

  it("filters list, recall, and export totals without revealing other scopes", async () => {
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
    const exported = (await sdk.trigger("api::export", {
      headers: headers("codex-token", "codex"),
      query_params: {},
    })) as { status_code: number; body: ExportData };

    expect(list.body.total).toBe(1);
    expect(list.body.lessons.map((lesson) => lesson.mechanismId)).toEqual([
      "authorization/visible",
    ]);
    expect(recall.body.lessons).toHaveLength(1);
    expect(exported.status_code).toBe(200);
    expect(exported.body.lessons).toHaveLength(1);
    expect(exported.body.lessons?.[0].mechanismId).toBe(
      "authorization/visible",
    );
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

  it("rejects an out-of-scope import before writing any lesson", async () => {
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
