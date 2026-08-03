import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
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
  AuditEntry,
  Lesson,
} from "../src/types.js";
import { parseImportedLesson } from "../src/functions/lesson-model.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const injectedFailures: Array<{
    operation: "set" | "delete";
    scope: string;
    key: string;
  }> = [];
  let setBarrier:
    | {
        scope: string;
        key: string;
        reached: () => void;
        waitForRelease: Promise<void>;
      }
    | undefined;
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (setBarrier?.scope === scope && setBarrier.key === key) {
        const barrier = setBarrier;
        setBarrier = undefined;
        barrier.reached();
        await barrier.waitForRelease;
      }
      const setFailureIndex = injectedFailures.findIndex(
        (failure) =>
          failure.operation === "set" &&
          failure.scope === scope &&
          failure.key === key,
      );
      if (setFailureIndex >= 0) {
        injectedFailures.splice(setFailureIndex, 1);
        throw new Error(`injected set failure for ${scope}/${key}`);
      }
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      const deleteFailureIndex = injectedFailures.findIndex(
        (failure) =>
          failure.operation === "delete" &&
          failure.scope === scope &&
          failure.key === key,
      );
      if (deleteFailureIndex >= 0) {
        injectedFailures.splice(deleteFailureIndex, 1);
        throw new Error(`injected delete failure for ${scope}/${key}`);
      }
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
    failNext(
      operation: "set" | "delete",
      scope: string,
      key: string,
    ): void {
      injectedFailures.push({ operation, scope, key });
    },
    pauseNextSet(scope: string, key: string): {
      reached: Promise<void>;
      release: () => void;
    } {
      let reached!: () => void;
      let release!: () => void;
      const reachedPromise = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const waitForRelease = new Promise<void>((resolve) => {
        release = resolve;
      });
      setBarrier = { scope, key, reached, waitForRelease };
      return { reached: reachedPromise, release };
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

function emptyExport(lessons: Lesson[] = []): ExportData {
  return {
    version: "0.9.27",
    exportedAt: "2026-08-02T20:00:00.000Z",
    sessions: [],
    observations: {},
    memories: [],
    summaries: [],
    lessons,
  };
}

function structuredLesson(
  id: string,
  overrides: Partial<Lesson> = {},
): Lesson {
  return {
    id,
    content: `Structured lesson ${id}`,
    context: "",
    confidence: 0.7,
    reinforcements: 0,
    source: "manual",
    sourceIds: [],
    project: "agentmemory",
    tags: ["causal"],
    createdAt: "2026-08-02T20:00:00.000Z",
    updatedAt: "2026-08-02T20:00:00.000Z",
    decayRate: 0.05,
    schemaVersion: 1,
    mechanismId: `import/${id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    claim: `The claim for ${id} is falsifiable.`,
    claimType: "causal",
    evidenceVerdict: "supported",
    lifecycle: "active",
    evidenceRefs: [
      {
        kind: "experiment",
        projectId: "agentmemory",
        provenance: {
          type: "oci",
          locator: `ghcr.io/example/${id.toLowerCase()}`,
          digest: `sha256:${"a".repeat(64)}`,
        },
        recordedAt: "2026-08-02T20:00:00.000Z",
        verification: {
          state: "verified",
          verifiedBy: "reviewer@example.test",
          verifiedAt: "2026-08-02T20:30:00.000Z",
        },
      },
    ],
    scope: { ring: "repo", scopeId: "repo:agentmemory" },
    sensitivity: "restricted",
    ...overrides,
  };
}

function importedLesson(raw: Lesson): Lesson {
  const parsed = parseImportedLesson(raw);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.lesson;
}

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
    const structuredCanonical = importedLesson(structured);

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
      structuredCanonical.id,
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
      idAliases: [structured.id],
      evidenceRefs: [
        expect.objectContaining({
          commitSha: "d".repeat(40),
          verification: expect.objectContaining({
            state: "verified",
            basis: "legacy-git-anchor",
          }),
        }),
      ],
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

  it("rejects unknown runtime import strategies before any mutation", async () => {
    const before = await kv.list<Session>("mem:sessions");
    const result = (await sdk.trigger("mem::import", {
      exportData: emptyExport([structuredLesson("unknown-strategy")]),
      strategy: "overwrite",
    } as never)) as { success: boolean; error: string };

    expect(result).toMatchObject({
      success: false,
      error: "strategy must be merge, replace, or skip",
    });
    expect(await kv.list<Session>("mem:sessions")).toEqual(before);
    expect(await kv.list("mem:lessons")).toEqual([]);
  });

  it.each(["retracted", "superseded"] as const)(
    "blocks merge resurrection of a %s lesson without partially writing the batch",
    async (lifecycle) => {
      const replacement = importedLesson(
        structuredLesson(`replacement-${lifecycle}`),
      );
      const activeOriginal = structuredLesson(`terminal-${lifecycle}`);
      const terminal = importedLesson({
        ...activeOriginal,
        lifecycle,
        deleted: true,
        deletedAt: "2026-08-02T21:00:00.000Z",
        deletedBy: "reviewer",
        deleteReason: "terminal evidence state",
        supersededByLessonId:
          lifecycle === "superseded" ? replacement.id : undefined,
      });
      await kv.set("mem:lessons", replacement.id, replacement);
      await kv.set("mem:lessons", terminal.id, terminal);
      const unrelated = structuredLesson(`unrelated-${lifecycle}`);
      const unrelatedCanonical = importedLesson(unrelated);

      const result = (await sdk.trigger("mem::import", {
        exportData: emptyExport([activeOriginal, unrelated]),
        strategy: "merge",
      })) as { success: boolean; error: string };

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining(
          `cannot replace terminal ${lifecycle}`,
        ),
      });
      expect(await kv.get<Lesson>("mem:lessons", terminal.id)).toEqual(
        terminal,
      );
      expect(
        await kv.get("mem:lessons", unrelatedCanonical.id),
      ).toBeNull();
      expect(await kv.list<Lesson>("mem:lessons")).toHaveLength(2);
    },
  );

  it("serializes correction against merge preflight so a concurrent tombstone cannot be resurrected", async () => {
    registerLessonsFunctions(sdk as never, kv as never);
    const raw = structuredLesson("concurrent-correction", {
      evidenceVerdict: "unverified",
      evidenceRefs: [],
    });
    const active = importedLesson(raw);
    await kv.set("mem:lessons", active.id, active);
    const barrier = kv.pauseNextSet("mem:lessons", active.id);

    const correctionPromise = sdk.trigger("mem::lesson-delete", {
      lessonId: active.id,
      reason: "Concurrent evidence invalidation",
      actor: "reviewer",
    });
    await barrier.reached;
    const importPromise = sdk.trigger("mem::import", {
      exportData: emptyExport([raw]),
      strategy: "merge",
    });
    barrier.release();

    const correction = await correctionPromise;
    const imported = await importPromise;
    const finalLesson = await kv.get<Lesson>("mem:lessons", active.id);

    expect(correction).toMatchObject({
      success: true,
      action: "deleted",
    });
    expect(imported).toMatchObject({
      success: false,
      error: expect.stringContaining("cannot replace terminal retracted"),
    });
    expect(finalLesson).toMatchObject({
      lifecycle: "retracted",
      deleted: true,
      deleteReason: "Concurrent evidence invalidation",
    });
  });

  it("allows explicit replace restoration and audits canonical IDs with lifecycle preimages", async () => {
    const active = structuredLesson("explicit-restore");
    const terminal = importedLesson({
      ...active,
      lifecycle: "retracted",
      deleted: true,
      deletedAt: "2026-08-02T21:00:00.000Z",
      deletedBy: "reviewer",
      deleteReason: "bad artifact",
    });
    await kv.set("mem:lessons", terminal.id, terminal);

    const result = (await sdk.trigger("mem::import", {
      exportData: emptyExport([active]),
      strategy: "replace",
    })) as { success: boolean; lessons: number };
    const restored = await kv.list<Lesson>("mem:lessons");
    const audits = await kv.list<AuditEntry>("mem:audit");

    expect(result).toMatchObject({ success: true, lessons: 1 });
    expect(restored).toEqual([
      expect.objectContaining({
        id: terminal.id,
        lifecycle: "active",
        deleted: undefined,
      }),
    ]);
    expect(audits).toContainEqual(
      expect.objectContaining({
        functionId: "mem::import:lessons",
        targetIds: [terminal.id],
        details: expect.objectContaining({
          strategy: "replace",
          lifecycleTransitions: [
            {
              lessonId: terminal.id,
              before: "retracted",
              after: "active",
            },
          ],
        }),
      }),
    );
  });

  it("restores the exact lesson preimage when a merge set fails mid-batch", async () => {
    const preserved = importedLesson(structuredLesson("preserved-set"));
    const first = importedLesson(structuredLesson("first-set"));
    const second = importedLesson(structuredLesson("second-set"));
    await kv.set("mem:lessons", preserved.id, preserved);
    kv.failNext("set", "mem:lessons", second.id);

    const result = (await sdk.trigger("mem::import", {
      exportData: emptyExport([
        structuredLesson("first-set"),
        structuredLesson("second-set"),
      ]),
      strategy: "merge",
    })) as { success: boolean; error: string };

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("exact preimage restored"),
    });
    expect(await kv.list<Lesson>("mem:lessons")).toEqual([preserved]);
    expect(await kv.get("mem:lessons", first.id)).toBeNull();
    expect(await kv.get("mem:lessons", second.id)).toBeNull();
  });

  it("reports and audits rollback failure with the affected lesson IDs", async () => {
    const first = importedLesson(structuredLesson("rollback-failure-first"));
    const second = importedLesson(
      structuredLesson("rollback-failure-second"),
    );
    kv.failNext("set", "mem:lessons", second.id);
    kv.failNext("delete", "mem:lessons", first.id);

    const result = (await sdk.trigger("mem::import", {
      exportData: emptyExport([
        structuredLesson("rollback-failure-first"),
        structuredLesson("rollback-failure-second"),
      ]),
      strategy: "merge",
    })) as { success: boolean; error: string };
    const audits = await kv.list<AuditEntry>("mem:audit");

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("rollback failed"),
    });
    expect(result.error).toContain(first.id);
    expect(audits).toContainEqual(
      expect.objectContaining({
        functionId: "mem::import:lessons-rollback",
        targetIds: [first.id, second.id],
        details: expect.objectContaining({
          rollback: expect.objectContaining({ success: false }),
        }),
      }),
    );
  });

  it("restores the exact lesson preimage when a replace delete fails mid-batch", async () => {
    const first = importedLesson(structuredLesson("first-delete"));
    const second = importedLesson(structuredLesson("second-delete"));
    await kv.set("mem:lessons", first.id, first);
    await kv.set("mem:lessons", second.id, second);
    kv.failNext("delete", "mem:lessons", second.id);

    const result = (await sdk.trigger("mem::import", {
      exportData: emptyExport(),
      strategy: "replace",
    })) as { success: boolean; error: string };

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("exact preimage restored"),
    });
    const restored = await kv.list<Lesson>("mem:lessons");
    expect(restored).toHaveLength(2);
    expect(restored).toEqual(expect.arrayContaining([first, second]));
  });

  it("canonicalizes arbitrary structured IDs and rejects canonical duplicates", async () => {
    const first = {
      ...structuredLesson("arbitrary-one"),
      computedFlags: { stale: true, contradicted: true },
    } as Lesson;
    const duplicate = { ...first, id: "arbitrary-two" };
    const canonical = importedLesson(first);

    const duplicateResult = (await sdk.trigger("mem::import", {
      exportData: emptyExport([first, duplicate]),
      strategy: "merge",
    })) as { success: boolean; error: string };
    expect(duplicateResult).toMatchObject({
      success: false,
      error: expect.stringContaining("Duplicate lesson"),
    });
    expect(await kv.list("mem:lessons")).toEqual([]);

    const success = await sdk.trigger("mem::import", {
      exportData: emptyExport([first]),
      strategy: "merge",
    });
    expect(success).toMatchObject({ success: true, lessons: 1 });
    expect(await kv.list<Lesson>("mem:lessons")).toEqual([
      expect.objectContaining({
        id: canonical.id,
        identityKind: "canonical",
        idAliases: ["arbitrary-one"],
      }),
    ]);
    expect((await kv.list<Lesson>("mem:lessons"))[0]).not.toHaveProperty(
      "computedFlags",
    );
  });

  it("resolves order-independent imported lineage through canonical aliases", async () => {
    const target = structuredLesson("lineage-target");
    const targetCanonical = importedLesson(target);
    const source = {
      ...structuredLesson("lineage-source", {
        evidenceVerdict: "unverified",
        evidenceRefs: [],
      }),
      lifecycle: "superseded" as const,
      deleted: true,
      deletedAt: "2026-08-02T21:00:00.000Z",
      deletedBy: "reviewer",
      deleteReason: "new evidence",
      supersededByLessonId: target.id,
    };
    const sourceCanonical = importedLesson(source);

    const result = await sdk.trigger("mem::import", {
      exportData: emptyExport([source, target]),
      strategy: "merge",
    });

    expect(result).toMatchObject({ success: true, lessons: 2 });
    expect(
      await kv.get<Lesson>("mem:lessons", sourceCanonical.id),
    ).toMatchObject({
      supersededByLessonId: targetCanonical.id,
    });

    const reverseKv = mockKV();
    const reverseSdk = mockSdk();
    registerExportImportFunction(reverseSdk as never, reverseKv as never);
    const reverse = await reverseSdk.trigger("mem::import", {
      exportData: emptyExport([target, source]),
      strategy: "merge",
    });
    expect(reverse).toMatchObject({ success: true, lessons: 2 });
    expect(
      await reverseKv.get<Lesson>("mem:lessons", sourceCanonical.id),
    ).toMatchObject({
      supersededByLessonId: targetCanonical.id,
    });
  });

  it.each([
    {
      name: "dangling contradiction",
      lessons: () => [
        structuredLesson("dangling-contradiction", {
          contradictedByLessonIds: ["missing-target"],
        }),
      ],
      message: "dangling contradiction",
    },
    {
      name: "self contradiction",
      lessons: () => {
        const lesson = structuredLesson("self-contradiction");
        return [{ ...lesson, contradictedByLessonIds: [lesson.id] }];
      },
      message: "cannot contradict itself",
    },
    {
      name: "cross-scope contradiction",
      lessons: () => {
        const target = structuredLesson("cross-scope-target", {
          scope: { ring: "repo", scopeId: "repo:two" },
        });
        return [
          structuredLesson("cross-scope-source", {
            scope: { ring: "repo", scopeId: "repo:one" },
            contradictedByLessonIds: [target.id],
          }),
          target,
        ];
      },
      message: "crosses durable scope or project",
    },
    {
      name: "cross-project contradiction",
      lessons: () => {
        const target = structuredLesson("cross-project-target", {
          project: "project-two",
        });
        return [
          structuredLesson("cross-project-source", {
            project: "project-one",
            contradictedByLessonIds: [target.id],
          }),
          target,
        ];
      },
      message: "crosses durable scope or project",
    },
    {
      name: "cross-scope supersession",
      lessons: () => {
        const target = structuredLesson("cross-supersession-target", {
          scope: { ring: "repo", scopeId: "repo:two" },
        });
        return [
          {
            ...structuredLesson("cross-supersession-source", {
              evidenceVerdict: "unverified",
              evidenceRefs: [],
              scope: { ring: "repo", scopeId: "repo:one" },
            }),
            lifecycle: "superseded" as const,
            deleted: true,
            deletedAt: "2026-08-02T21:00:00.000Z",
            deletedBy: "reviewer",
            deleteReason: "replaced",
            supersededByLessonId: target.id,
          },
          target,
        ];
      },
      message: "crosses durable scope",
    },
    {
      name: "terminal contradiction target",
      lessons: () => {
        const target = structuredLesson("terminal-relation-target", {
          lifecycle: "retracted",
          deleted: true,
          deletedAt: "2026-08-02T21:00:00.000Z",
          deletedBy: "reviewer",
          deleteReason: "invalid",
        });
        return [
          structuredLesson("terminal-relation-source", {
            contradictedByLessonIds: [target.id],
          }),
          target,
        ];
      },
      message: "must be active",
    },
  ])("rejects $name in the complete post-import graph", async ({ lessons, message }) => {
    const result = (await sdk.trigger("mem::import", {
      exportData: emptyExport(lessons()),
      strategy: "merge",
    })) as { success: boolean; error: string };

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining(message),
    });
    expect(await kv.list("mem:lessons")).toEqual([]);
  });

  it("rejects malformed structured export/import without rewriting it as legacy", async () => {
    const malformed = {
      ...structuredLesson("malformed-roundtrip"),
      evidenceRefs: "not-an-array",
    } as unknown as Lesson;
    await kv.set("mem:lessons", malformed.id, malformed);

    await expect(sdk.trigger("mem::export", {})).rejects.toThrow(
      /Invalid structured lesson.*evidenceRefs must be an array/,
    );
    expect(await kv.get("mem:lessons", malformed.id)).toEqual(malformed);

    const fresh = mockKV();
    const freshSdk = mockSdk();
    registerExportImportFunction(freshSdk as never, fresh as never);
    const imported = await freshSdk.trigger("mem::import", {
      exportData: emptyExport([malformed]),
      strategy: "merge",
    });
    expect(imported).toMatchObject({
      success: false,
      error: expect.stringContaining("evidenceRefs must be an array"),
    });
    expect(await fresh.list("mem:lessons")).toEqual([]);
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
