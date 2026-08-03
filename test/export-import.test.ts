import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerExportImportFunction } from "../src/functions/export-import.js";
import type {
  Session,
  CompressedObservation,
  Memory,
  SessionSummary,
  ExportData,
  Action,
  ActionEdge,
  ActionCollectionState,
  ActionEvent,
  Lesson,
} from "../src/types.js";

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

const testSession: Session = {
  id: "ses_1",
  project: "my-project",
  cwd: "/tmp",
  startedAt: "2026-02-01T00:00:00Z",
  status: "completed",
  observationCount: 1,
};

const testObs: CompressedObservation = {
  id: "obs_1",
  sessionId: "ses_1",
  timestamp: "2026-02-01T10:00:00Z",
  type: "file_edit",
  title: "Edit auth",
  facts: ["Added check"],
  narrative: "Auth changes",
  concepts: ["auth"],
  files: ["src/auth.ts"],
  importance: 7,
};

const testMemory: Memory = {
  id: "mem_1",
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  type: "pattern",
  title: "Auth pattern",
  content: "Always validate tokens",
  concepts: ["auth"],
  files: [],
  sessionIds: ["ses_1"],
  strength: 5,
  version: 1,
  isLatest: true,
};

const testSummary: SessionSummary = {
  sessionId: "ses_1",
  project: "my-project",
  createdAt: "2026-02-01T00:00:00Z",
  title: "Auth work",
  narrative: "Worked on auth",
  keyDecisions: ["Use JWT"],
  filesModified: ["src/auth.ts"],
  concepts: ["auth"],
  observationCount: 1,
};

describe("Export/Import Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);

    await kv.set("mem:sessions", "ses_1", testSession);
    await kv.set("mem:obs:ses_1", "obs_1", testObs);
    await kv.set("mem:memories", "mem_1", testMemory);
    await kv.set("mem:summaries", "ses_1", testSummary);
  });

  it("export produces valid ExportData structure", async () => {
    const result = (await sdk.trigger("mem::export", {})) as ExportData;

    expect(result.version).toBe("0.9.27");
    expect(result.exportedAt).toBeDefined();
    expect(result.sessions.length).toBe(1);
    expect(result.sessions[0].id).toBe("ses_1");
    expect(result.observations["ses_1"].length).toBe(1);
    expect(result.memories.length).toBe(1);
    expect(result.summaries.length).toBe(1);
  });

  it("import with merge strategy adds data", async () => {
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [{ ...testSession, id: "ses_2", observationCount: 0 }],
      observations: {},
      memories: [{ ...testMemory, id: "mem_2", title: "New pattern" }],
      summaries: [],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; sessions: number; memories: number };

    expect(result.success).toBe(true);
    expect(result.sessions).toBe(1);
    expect(result.memories).toBe(1);

    const allSessions = await kv.list("mem:sessions");
    expect(allSessions.length).toBe(2);
  });

  it("import with skip strategy does not overwrite existing", async () => {
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [testSession],
      observations: { ses_1: [testObs] },
      memories: [testMemory],
      summaries: [testSummary],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "skip",
    })) as { success: boolean; skipped: number; sessions: number };

    expect(result.success).toBe(true);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.sessions).toBe(0);
  });

  it("import with replace strategy clears existing data first", async () => {
    const newSession: Session = {
      id: "ses_new",
      project: "new-project",
      cwd: "/tmp/new",
      startedAt: "2026-03-01T00:00:00Z",
      status: "active",
      observationCount: 0,
    };
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [newSession],
      observations: {},
      memories: [],
      summaries: [],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "replace",
    })) as { success: boolean; sessions: number };

    expect(result.success).toBe(true);
    expect(result.sessions).toBe(1);

    const oldSession = await kv.get("mem:sessions", "ses_1");
    expect(oldSession).toBeNull();
  });

  it("export then import round-trip preserves data", async () => {
    const exported = (await sdk.trigger("mem::export", {})) as ExportData;

    const freshKv = mockKV();
    const freshSdk = mockSdk();
    registerExportImportFunction(freshSdk as never, freshKv as never);

    const importResult = (await freshSdk.trigger("mem::import", {
      exportData: exported,
      strategy: "merge",
    })) as {
      success: boolean;
      sessions: number;
      observations: number;
      memories: number;
    };

    expect(importResult.success).toBe(true);
    expect(importResult.sessions).toBe(1);
    expect(importResult.observations).toBe(1);
    expect(importResult.memories).toBe(1);

    const reExported = (await freshSdk.trigger(
      "mem::export",
      {},
    )) as ExportData;
    expect(reExported.sessions.length).toBe(exported.sessions.length);
    expect(reExported.memories.length).toBe(exported.memories.length);
  });

  it("exports legacy lessons with normalized defaults without rewriting live state", async () => {
    const legacy: Lesson = {
      id: "lsn_legacy_export",
      content: "Legacy export lesson",
      context: "",
      confidence: 0.7,
      reinforcements: 0,
      source: "manual",
      sourceIds: [],
      project: "agentmemory",
      tags: ["legacy"],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      decayRate: 0.05,
    };
    await kv.set("mem:lessons", legacy.id, legacy);

    const exported = (await sdk.trigger("mem::export", {})) as ExportData;
    const stored = await kv.get<Lesson>("mem:lessons", legacy.id);

    expect(exported.lessons).toEqual([
      expect.objectContaining({
        id: legacy.id,
        schemaVersion: 1,
        evidenceVerdict: "unverified",
        lifecycle: "active",
        sensitivity: "restricted",
        scope: { ring: "worktree" },
        contentFingerprint: expect.stringMatching(/^lfp_[a-f0-9]{16}$/),
      }),
    ]);
    expect(stored).toEqual(legacy);
    expect(stored?.schemaVersion).toBeUndefined();
  });

  it("normalizes legacy lessons during explicit import and preserves structured fields", async () => {
    const legacy = {
      id: "lsn_legacy_import",
      content: "Imported legacy lesson",
      context: "",
      confidence: 0.6,
      reinforcements: 0,
      source: "manual",
      sourceIds: [],
      project: "agentmemory",
      tags: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      decayRate: 0.05,
    } as Lesson;
    const structured = {
      ...legacy,
      id: "lsn_structured_import",
      content: "Structured imported lesson",
      mechanismId: "import/normalization",
      claim: "Explicit import produces a stable normalized lesson.",
      claimType: "causal",
      evidenceVerdict: "supported",
      lifecycle: "active",
      evidenceRefs: [
        {
          kind: "experiment",
          projectId: "agentmemory",
          repoRemoteUrl: "https://github.com/rohitg00/agentmemory",
          commitSha: "d".repeat(40),
          recordedAt: "2026-08-02T20:00:00.000Z",
          sampleCount: 1,
        },
      ],
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
      sensitivity: "confidential",
    } as Lesson;
    const exportData: ExportData = {
      version: "0.9.27",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      lessons: [legacy, structured],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; lessons: number };
    const storedLegacy = await kv.get<Lesson>(
      "mem:lessons",
      legacy.id,
    );
    const storedStructured = await kv.get<Lesson>(
      "mem:lessons",
      structured.id,
    );

    expect(result).toMatchObject({ success: true, lessons: 2 });
    expect(storedLegacy).toMatchObject({
      schemaVersion: 1,
      evidenceVerdict: "unverified",
      lifecycle: "active",
      sensitivity: "restricted",
    });
    expect(storedStructured).toMatchObject({
      schemaVersion: 1,
      mechanismId: "import/normalization",
      evidenceVerdict: "supported",
      lifecycle: "active",
      sensitivity: "confidential",
      evidenceRefs: [expect.objectContaining({ commitSha: "d".repeat(40) })],
    });
  });

  it("rejects invalid structured lessons before replace mutation", async () => {
    const preserved: Lesson = {
      id: "lsn_preserved",
      content: "Preserve this lesson",
      context: "",
      confidence: 0.5,
      reinforcements: 0,
      source: "manual",
      sourceIds: [],
      tags: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      decayRate: 0.05,
    };
    await kv.set("mem:lessons", preserved.id, preserved);
    const invalid = {
      ...preserved,
      id: "lsn_invalid",
      mechanismId: "invalid/import",
      claim: "This unsupported record has no durable evidence.",
      evidenceVerdict: "supported",
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
    } as Lesson;
    const exportData: ExportData = {
      version: "0.9.27",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      lessons: [invalid],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "replace",
    })) as { success: boolean; error: string };

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("durable evidence reference"),
    });
    expect(await kv.get("mem:lessons", preserved.id)).toEqual(preserved);
    expect(await kv.get("mem:sessions", "ses_1")).toEqual(testSession);
  });

  it("import rejects unsupported version", async () => {
    const exportData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
    } as unknown as ExportData;

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported export version");
  });

  it("exports and replace-imports a coherent action snapshot and event history", async () => {
    const action: Action = {
      id: "act_v2",
      title: "Actions v2",
      description: "",
      status: "active",
      lifecycle: "active",
      priority: 9,
      createdAt: "2026-07-17T05:00:00.000Z",
      updatedAt: "2026-07-17T06:00:00.000Z",
      createdBy: "codex",
      project: "agentmemory",
      projectId: "agentmemory",
      projectAliases: [],
      owner: "codex",
      tags: ["schema-v2"],
      sourceObservationIds: [],
      sourceMemoryIds: [],
      schemaVersion: 2,
      revision: 9,
      awaitingHuman: false,
    };
    const event: ActionEvent = {
      schemaVersion: 2,
      id: "aev_v2",
      actionId: action.id,
      entityType: "action",
      revision: 9,
      type: "lifecycle_changed",
      actor: "codex",
      timestamp: action.updatedAt,
      after: action,
    };
    await kv.set("mem:actions", action.id, action);
    await kv.set("mem:action-events", event.id, event);
    await kv.set<ActionCollectionState>("mem:action-state", "current", {
      schemaVersion: 2,
      revision: 9,
      updatedAt: action.updatedAt,
    });

    const exported = (await sdk.trigger("mem::export", {})) as ExportData;
    expect(exported.actions).toEqual([action]);
    expect(exported.actionEvents).toEqual([event]);
    expect(exported.actionSnapshot).toEqual({
      schemaVersion: 2,
      revision: 9,
      actionCount: 1,
      edgeCount: 0,
      eventCount: 1,
    });

    const freshKv = mockKV();
    const freshSdk = mockSdk();
    registerExportImportFunction(freshSdk as never, freshKv as never);
    const imported = (await freshSdk.trigger("mem::import", {
      exportData: exported,
      strategy: "replace",
    })) as { success: boolean; actions: number; actionEvents: number };
    expect(imported).toMatchObject({
      success: true,
      actions: 1,
      actionEvents: 1,
    });
    expect(
      await freshKv.get<ActionCollectionState>("mem:action-state", "current"),
    ).toMatchObject({ schemaVersion: 2, revision: 9 });

    const reExported = (await freshSdk.trigger(
      "mem::export",
      {},
    )) as ExportData;
    expect(reExported.actionSnapshot).toEqual(exported.actionSnapshot);
    expect(JSON.parse(JSON.stringify(reExported.actions))).toEqual(
      JSON.parse(JSON.stringify(exported.actions)),
    );
    expect(reExported.actionEvents).toEqual(exported.actionEvents);
  });

  it("normalizes actions from an old export before persistence", async () => {
    const legacy = {
      id: "act_legacy",
      title: "Legacy export action",
      description: "",
      status: "pending",
      priority: 5,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      createdBy: "unknown",
      project: "/home/cp/repos/agent-infra/agentmemory",
      tags: "agent:kimi,worktree:legacy",
      sourceObservationIds: [],
      sourceMemoryIds: [],
    } as unknown as Action;
    const exportData: ExportData = {
      version: "0.9.27",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      actions: [legacy],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; actions: number };
    const stored = await kv.get<Action>("mem:actions", legacy.id);

    expect(result).toMatchObject({ success: true, actions: 1 });
    expect(stored).toMatchObject({
      schemaVersion: 2,
      lifecycle: "pending",
      project: "agentmemory",
      projectId: "agentmemory",
      owner: "kimi",
      worktree: "legacy",
      awaitingHuman: false,
    });
    expect(stored?.tags).toEqual(["agent:kimi", "worktree:legacy"]);
  });

  it("does not turn a legacy dependency block into a permanent manual block on import", async () => {
    const createdAt = "2026-07-01T00:00:00.000Z";
    const dependency = {
      id: "act_dependency",
      title: "Dependency",
      description: "",
      status: "pending",
      priority: 5,
      createdAt,
      updatedAt: createdAt,
      createdBy: "unknown",
      project: "agentmemory",
      tags: [],
      sourceObservationIds: [],
      sourceMemoryIds: [],
    } satisfies Action;
    const dependent = {
      ...dependency,
      id: "act_dependent",
      title: "Dependent",
      status: "blocked",
    } satisfies Action;
    const edge = {
      id: "ae_dependency",
      type: "requires",
      sourceActionId: dependent.id,
      targetActionId: dependency.id,
      createdAt,
    } satisfies ActionEdge;
    const exportData: ExportData = {
      version: "0.9.27",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      actions: [dependency, dependent],
      actionEdges: [edge],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "replace",
    })) as { success: boolean };
    const stored = await kv.get<Action>("mem:actions", dependent.id);

    expect(result.success).toBe(true);
    expect(stored).toMatchObject({
      schemaVersion: 2,
      lifecycle: "pending",
      status: "blocked",
    });
    expect(stored?.blockedReason).toBeUndefined();
  });

  it("rejects invalid action snapshot counts before replace mutation", async () => {
    const preserved = {
      id: "act_preserved",
      title: "Preserve me",
      description: "",
      status: "pending",
      priority: 5,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      createdBy: "codex",
      tags: [],
      sourceObservationIds: [],
      sourceMemoryIds: [],
    } satisfies Action;
    await kv.set("mem:actions", preserved.id, preserved);
    const exportData: ExportData = {
      version: "0.9.27",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      actions: [],
      actionSnapshot: {
        schemaVersion: 2,
        revision: 1,
        actionCount: 1,
        edgeCount: 0,
        eventCount: 0,
      },
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "replace",
    })) as { success: boolean; error: string };

    expect(result).toMatchObject({
      success: false,
      error: "Action snapshot counts or revision are invalid",
    });
    expect(await kv.get("mem:actions", preserved.id)).toEqual(preserved);
    expect(await kv.get("mem:sessions", "ses_1")).toEqual(testSession);
  });

  it("advances the local revision when replace import changes an existing action collection", async () => {
    const existing = {
      id: "act_existing",
      title: "Existing action",
      description: "",
      status: "pending",
      priority: 5,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      createdBy: "codex",
      tags: [],
      sourceObservationIds: [],
      sourceMemoryIds: [],
    } satisfies Action;
    await kv.set("mem:actions", existing.id, existing);
    await kv.set<ActionCollectionState>("mem:action-state", "current", {
      schemaVersion: 2,
      revision: 9,
      updatedAt: "2026-07-17T06:00:00.000Z",
    });
    const emptySnapshot: ExportData = {
      version: "0.9.27",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      actions: [],
      actionEdges: [],
      actionEvents: [],
      actionSnapshot: {
        schemaVersion: 2,
        revision: 0,
        actionCount: 0,
        edgeCount: 0,
        eventCount: 0,
      },
    };

    const result = (await sdk.trigger("mem::import", {
      exportData: emptySnapshot,
      strategy: "replace",
    })) as { success: boolean };
    const state = await kv.get<ActionCollectionState>(
      "mem:action-state",
      "current",
    );

    expect(result.success).toBe(true);
    expect(await kv.get("mem:actions", existing.id)).toBeNull();
    expect(state?.revision).toBe(10);
  });
});
