import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  safeAudit: vi.fn(),
}));

import { registerDurableCandidateFunctions } from "../src/functions/durable-candidates.js";
import { materializeDurableCandidate } from "../src/functions/durable-candidate-utils.js";
import { KV } from "../src/state/schema.js";
import type {
  CompressedObservation,
  MemoryProvider,
  Session,
  SessionSummary,
} from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
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
    functions,
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: vi.fn(),
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) throw new Error(`No function registered for ${input.function_id}`);
      return fn(input.payload);
    },
  };
}

function makeObservation(sessionId: string, id = "obs_1"): CompressedObservation {
  return {
    id,
    sessionId,
    timestamp: "2026-07-10T00:00:00.000Z",
    type: "decision",
    title: "Archive flow decision",
    facts: ["Explicit promote is required for durable memories."],
    narrative:
      "The session introduced durable candidates that stay out of long-term memory until an explicit promote step happens.",
    concepts: ["durable-candidates", "promotion"],
    files: ["src/functions/durable-candidates.ts"],
    importance: 8,
  };
}

function makeProvider(xml: string): MemoryProvider {
  return {
    name: "test",
    compress: async () => "",
    summarize: async () => xml,
  };
}

function makeSummaryXml(sessionId: string, obsId: string): string {
  return `<summary>
<title>Durable lifecycle</title>
<narrative>This session defined a durable candidate lifecycle, kept archive imports idempotent, and reserved long-term memory writes for explicit promote.</narrative>
<decisions><decision>Archive import creates candidates only.</decision></decisions>
<files><file>src/functions/durable-candidates.ts</file></files>
<concepts><concept>durable-candidates</concept></concepts>
<durableCandidates>
  <candidate>
    <type>workflow</type>
    <title>Explicit promote only</title>
    <content>Archived sessions should create durable candidates and only write Memory through explicit promote.</content>
    <concepts><concept>durable-candidates</concept></concepts>
    <files><file>src/functions/durable-candidates.ts</file></files>
    <sourceObservationIds><id>${obsId}</id></sourceObservationIds>
    <confidence>0.82</confidence>
    <promotionReason>Cross-session workflow policy for future recalls.</promotionReason>
  </candidate>
</durableCandidates>
</summary>`;
}

describe("durable candidates lifecycle", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const tempDirs = new Set<string>();

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.clear();
  });

  it("records a shadow recommendation without writing a memory", async () => {
    registerDurableCandidateFunctions(sdk as never, kv as never, makeProvider(""));
    const candidate = {
      id: "cand_shadow", sessionId: "s1", project: "project-a", type: "fact" as const,
      title: "Stable cache invariant", content: "The cache key must include stage, pair id, and benchmark revision.",
      concepts: [], files: [], sourceObservationIds: ["obs1", "obs2", "obs3"], confidence: 0.95,
      createdAt: "2026-07-10T00:00:00.000Z",
    };
    await kv.set(KV.summaries, "s1", {
      sessionId: "s1", project: "project-a", createdAt: "2026-07-10T00:00:00.000Z",
      title: "summary", narrative: "", keyDecisions: [], filesModified: [], concepts: [], observationCount: 3,
      durableCandidates: [candidate],
    });

    const result = await sdk.functions.get("mem::durable-candidates::recommend")!({ candidateId: "cand_shadow" });

    expect(result.recommendations[0]).toMatchObject({ recommendation: "auto_promote_eligible", wouldPromote: false });
    expect(await kv.list(KV.memories)).toEqual([]);
    expect(await kv.get(KV.durableRecommendations, "cand_shadow")).toBeTruthy();
  });

  it("promote skips when a memory already exists for sourceCandidateId and backfills promotedMemoryId", async () => {
    const candidate = materializeDurableCandidate({
      sessionId: "sess_promote",
      project: "agentmemory",
      type: "workflow",
      title: "Explicit promote only",
      content:
        "Archived sessions should create durable candidates and only write Memory through explicit promote.",
      concepts: ["durable-candidates"],
      files: ["src/functions/durable-candidates.ts"],
      sourceObservationIds: ["obs_1"],
      confidence: 0.82,
      promotionReason: "Cross-session workflow policy.",
      createdAt: "2026-07-10T00:00:00.000Z",
    });
    expect(candidate).not.toBeNull();

    const summary: SessionSummary = {
      sessionId: "sess_promote",
      project: "agentmemory",
      createdAt: "2026-07-10T00:00:00.000Z",
      title: "Summary",
      narrative: "Narrative long enough to count as a real summary in tests.",
      keyDecisions: [],
      filesModified: [],
      concepts: [],
      observationCount: 1,
      durableCandidates: [candidate!],
    };
    await kv.set("mem:summaries", summary.sessionId, summary);
    await kv.set("mem:memories", "mem_existing", {
      id: "mem_existing",
      createdAt: "2026-07-10T00:05:00.000Z",
      updatedAt: "2026-07-10T00:05:00.000Z",
      type: "workflow",
      title: candidate!.title,
      content: candidate!.content,
      concepts: candidate!.concepts,
      files: candidate!.files,
      sessionIds: [candidate!.sessionId],
      strength: 8,
      confidence: candidate!.confidence,
      version: 1,
      isLatest: true,
      sourceCandidateId: candidate!.id,
    });

    registerDurableCandidateFunctions(
      sdk as never,
      kv as never,
      makeProvider(makeSummaryXml("sess_promote", "obs_1")),
    );

    const result: any = await sdk.trigger({
      function_id: "mem::durable-candidates::promote",
      payload: { candidateId: candidate!.id },
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.memoryId).toBe("mem_existing");

    const stored = await kv.get<SessionSummary>("mem:summaries", "sess_promote");
    expect(stored?.durableCandidates?.[0]?.promotedMemoryId).toBe("mem_existing");
  });

  it("backfill dry-run reports candidate preview without mutating summaries", async () => {
    const session: Session = {
      id: "sess_backfill_dry",
      project: "agentmemory",
      cwd: "C:/repo",
      startedAt: "2026-07-10T00:00:00.000Z",
      endedAt: "2026-07-10T00:10:00.000Z",
      status: "completed",
      observationCount: 1,
    };
    await kv.set("mem:sessions", session.id, session);
    await kv.set("mem:obs:sess_backfill_dry", "obs_1", makeObservation(session.id));

    registerDurableCandidateFunctions(
      sdk as never,
      kv as never,
      makeProvider(makeSummaryXml(session.id, "obs_1")),
    );

    const result: any = await sdk.trigger({
      function_id: "mem::durable-candidates::backfill",
      payload: { dryRun: true },
    });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.candidatePreview.total).toBe(1);
    expect(result.wouldMutate).toBe(true);
    expect(await kv.get("mem:summaries", session.id)).toBeNull();
  });

  it("backfill real run respects limit and writes candidates only", async () => {
    const sessions: Session[] = [
      {
        id: "sess_backfill_real_1",
        project: "agentmemory",
        cwd: "C:/repo",
        startedAt: "2026-07-10T00:00:00.000Z",
        endedAt: "2026-07-10T00:10:00.000Z",
        status: "completed",
        observationCount: 1,
      },
      {
        id: "sess_backfill_real_2",
        project: "agentmemory",
        cwd: "C:/repo",
        startedAt: "2026-07-10T00:20:00.000Z",
        endedAt: "2026-07-10T00:30:00.000Z",
        status: "completed",
        observationCount: 1,
      },
    ];
    for (const session of sessions) {
      await kv.set("mem:sessions", session.id, session);
      await kv.set(
        `mem:obs:${session.id}`,
        "obs_1",
        makeObservation(session.id),
      );
    }

    registerDurableCandidateFunctions(
      sdk as never,
      kv as never,
      makeProvider(makeSummaryXml("sess_backfill_real_1", "obs_1")),
    );

    const result: any = await sdk.trigger({
      function_id: "mem::durable-candidates::backfill",
      payload: { dryRun: false, limit: 1 },
    });

    expect(result.success).toBe(true);
    expect(result.processedSessions).toHaveLength(1);
    expect(
      (await kv.get<SessionSummary>("mem:summaries", "sess_backfill_real_1"))
        ?.durableCandidates?.length,
    ).toBe(1);
    expect(await kv.get("mem:summaries", "sess_backfill_real_2")).toBeNull();
    expect((await kv.list("mem:memories")).length).toBe(0);
  });

  it("archive/process is idempotent on sessionId + fileHash", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agentmemory-archive-"));
    tempDirs.add(tempDir);
    const archivePath = join(tempDir, "session.jsonl");
    writeFileSync(
      archivePath,
      `${JSON.stringify({
        type: "user",
        sessionId: "sess_archive",
        cwd: "/tmp/agentmemory",
        timestamp: "2026-07-10T00:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "Ship archive processing." }] },
      })}\n`,
      "utf-8",
    );

    sdk.registerFunction("mem::replay::import-jsonl", async () => {
      const session: Session = {
        id: "sess_archive",
        project: "agentmemory",
        cwd: "/tmp/agentmemory",
        startedAt: "2026-07-10T00:00:00.000Z",
        endedAt: "2026-07-10T00:01:00.000Z",
        status: "completed",
        observationCount: 1,
      };
      await kv.set("mem:sessions", session.id, session);
      await kv.set(
        "mem:obs:sess_archive",
        "obs_1",
        makeObservation(session.id),
      );
      return { success: true };
    });

    registerDurableCandidateFunctions(
      sdk as never,
      kv as never,
      makeProvider(makeSummaryXml("sess_archive", "obs_1")),
      { archiveRoot: tempDir },
    );

    const first: any = await sdk.trigger({
      function_id: "mem::archive::process",
      payload: { path: archivePath },
    });
    const movedDir = join(tempDir, "moved");
    mkdirSync(movedDir);
    const movedPath = join(movedDir, "session.jsonl");
    renameSync(archivePath, movedPath);
    const second: any = await sdk.trigger({
      function_id: "mem::archive::process",
      payload: { path: movedPath, force: true },
    });

    expect(first.success).toBe(true);
    expect(first.processed).toHaveLength(1);
    expect(first.processed[0].sessionId).toBe("sess_archive");
    expect(first.processed[0].durableCandidateCount).toBe(1);
    expect(second.skipped[0].reason).toBe("already_completed");
    const ledger = await kv.get<any>("mem:archive-imports", first.processed[0].idempotencyKey);
    expect(ledger.status).toBe("completed");
    expect(ledger.attempts).toBe(1);
  });

  it("completes a zero-observation archive without attempting a summary", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agentmemory-archive-empty-"));
    tempDirs.add(tempDir);
    const archivePath = join(tempDir, "empty.jsonl");
    writeFileSync(
      archivePath,
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            id: "sess_archive_empty",
            cwd: "C:\\work\\agentmemory",
            timestamp: "2026-07-10T00:00:00.000Z",
          },
        }),
        JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }),
      ].join("\n") + "\n",
      "utf-8",
    );

    sdk.registerFunction("mem::replay::import-jsonl", async () => {
      await kv.set("mem:sessions", "sess_archive_empty", {
        id: "sess_archive_empty",
        project: "agentmemory",
        cwd: "C:\\work\\agentmemory",
        startedAt: "2026-07-10T00:00:00.000Z",
        endedAt: "2026-07-10T00:00:00.000Z",
        status: "completed",
        observationCount: 0,
      } satisfies Session);
      return { success: true };
    });
    const summarize = vi.fn();
    registerDurableCandidateFunctions(
      sdk as never,
      kv as never,
      { name: "test", compress: async () => "", summarize },
      { archiveRoot: tempDir },
    );

    const result: any = await sdk.trigger({
      function_id: "mem::archive::process",
      payload: { path: archivePath },
    });

    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]).toMatchObject({
      sessionId: "sess_archive_empty",
      durableCandidateCount: 0,
    });
    expect(summarize).not.toHaveBeenCalled();
    const ledger = await kv.get<any>("mem:archive-imports", result.processed[0].idempotencyKey);
    expect(ledger).toMatchObject({
      status: "completed",
      summaryCreated: false,
      parsedObservationCount: 0,
      importedObservationCount: 0,
    });
  });

  it("retries a failed archive summary without replaying observations", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agentmemory-archive-retry-"));
    tempDirs.add(tempDir);
    const archivePath = join(tempDir, "session.jsonl");
    writeFileSync(
      archivePath,
      `${JSON.stringify({
        type: "user",
        sessionId: "sess_archive_retry",
        cwd: "/tmp/agentmemory",
        timestamp: "2026-07-10T00:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "Retry summary." }] },
      })}\n`,
      "utf-8",
    );

    let replayCalls = 0;
    let failSummary = true;
    sdk.registerFunction("mem::replay::import-jsonl", async () => {
      replayCalls += 1;
      const session: Session = {
        id: "sess_archive_retry",
        project: "agentmemory",
        cwd: "/tmp/agentmemory",
        startedAt: "2026-07-10T00:00:00.000Z",
        endedAt: "2026-07-10T00:01:00.000Z",
        status: "completed",
        observationCount: 1,
      };
      await kv.set("mem:sessions", session.id, session);
      await kv.set("mem:obs:sess_archive_retry", "obs_1", makeObservation(session.id));
      return { success: true };
    });
    const provider: MemoryProvider = {
      name: "test",
      compress: async () => "",
      summarize: async () => {
        if (failSummary) throw new Error("summary_unavailable");
        return makeSummaryXml("sess_archive_retry", "obs_1");
      },
    };
    registerDurableCandidateFunctions(sdk as never, kv as never, provider, {
      archiveRoot: tempDir,
    });

    const first: any = await sdk.trigger({
      function_id: "mem::archive::process",
      payload: { path: archivePath },
    });
    const afterFailure = await kv.list<any>("mem:archive-imports");
    expect(first.skipped[0].reason).toBe("summary_unavailable");
    expect(afterFailure[0].status).toBe("failed");
    expect(afterFailure[0].failureStage).toBe("summary");

    failSummary = false;
    const second: any = await sdk.trigger({
      function_id: "mem::archive::process",
      payload: { path: archivePath, force: true },
    });

    expect(second.processed).toHaveLength(1);
    expect(replayCalls).toBe(1);
    expect((await kv.list<any>("mem:archive-imports"))[0].status).toBe("completed");
  });

  it("requires force metadata for a low-confidence candidate", async () => {
    const candidate = materializeDurableCandidate({
      sessionId: "sess_force",
      project: "agentmemory",
      type: "workflow",
      title: "Needs review",
      content: "This candidate has limited supporting evidence.",
      concepts: ["review"],
      files: [],
      sourceObservationIds: ["obs_1"],
      confidence: 0.6,
      createdAt: "2026-07-10T00:00:00.000Z",
    });
    expect(candidate).not.toBeNull();
    await kv.set("mem:summaries", "sess_force", {
      sessionId: "sess_force",
      project: "agentmemory",
      createdAt: "2026-07-10T00:00:00.000Z",
      title: "Summary",
      narrative: "Narrative long enough to count as a valid test summary.",
      keyDecisions: [],
      filesModified: [],
      concepts: [],
      observationCount: 1,
      durableCandidates: [candidate!],
    } satisfies SessionSummary);
    registerDurableCandidateFunctions(
      sdk as never,
      kv as never,
      makeProvider(makeSummaryXml("sess_force", "obs_1")),
    );

    const denied: any = await sdk.trigger({
      function_id: "mem::durable-candidates::promote",
      payload: { candidateId: candidate!.id, force: true },
    });
    const preview: any = await sdk.trigger({
      function_id: "mem::durable-candidates::promote",
      payload: {
        candidateId: candidate!.id,
        force: true,
        dryRun: true,
        forceReason: "Reviewed during migration.",
        promotedBy: "operator",
      },
    });

    expect(denied.error).toBe("force_metadata_required");
    expect(preview.success).toBe(true);
    expect(preview.dryRun).toBe(true);
  });

  it("rejects archive paths outside the configured archive root", async () => {
    const archiveRoot = mkdtempSync(join(tmpdir(), "agentmemory-archive-root-"));
    const outsideRoot = mkdtempSync(join(tmpdir(), "agentmemory-archive-outside-"));
    tempDirs.add(archiveRoot);
    tempDirs.add(outsideRoot);
    const outsidePath = join(outsideRoot, "session.jsonl");
    writeFileSync(outsidePath, "{}\n", "utf-8");

    registerDurableCandidateFunctions(
      sdk as never,
      kv as never,
      makeProvider(makeSummaryXml("sess_archive", "obs_1")),
      { archiveRoot },
    );

    const result: any = await sdk.trigger({
      function_id: "mem::archive::process",
      payload: { path: outsidePath },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("archive path must live under");
  });
});
