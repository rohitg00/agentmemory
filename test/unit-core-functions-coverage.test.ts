import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(),
}));

import { DedupMap } from "../src/functions/dedup.js";
import { registerBranchAwareFunction } from "../src/functions/branch-aware.js";
import { registerFileIndexFunction } from "../src/functions/file-index.js";
import { registerPatternsFunction } from "../src/functions/patterns.js";
import { recordAudit } from "../src/functions/audit.js";
import { recordAccessBatch } from "../src/functions/access-tracker.js";
import { KV } from "../src/state/schema.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

type MockKV = ReturnType<typeof mockKV>;
type MockSdk = ReturnType<typeof mockSdk>;

async function addSession(
  kv: MockKV,
  id: string,
  data: { project?: string; cwd?: string; startedAt?: string } = {},
) {
  await kv.set(KV.sessions, id, {
    id,
    project: data.project,
    cwd: data.cwd ?? `/repo/${id}`,
    startedAt: data.startedAt ?? `2026-06-14T10:0${id.slice(-1)}:00Z`,
  });
}

async function addObservation(
  kv: MockKV,
  sessionId: string,
  id: string,
  data: {
    files?: string[];
    type?: string;
    title?: string;
    narrative?: string;
    importance?: number;
    timestamp?: string;
  },
) {
  await kv.set(KV.observations(sessionId), id, {
    id,
    sessionId,
    timestamp: data.timestamp ?? "2026-06-14T12:00:00Z",
    type: data.type ?? "file_edit",
    title: data.title,
    narrative: data.narrative ?? "",
    files: data.files,
    importance: data.importance ?? 5,
  });
}

describe("DedupMap", () => {
  let dedup: DedupMap | undefined;

  afterEach(() => {
    dedup?.stop();
    dedup = undefined;
    vi.useRealTimers();
  });

  it("hashes only the bounded input preview", () => {
    dedup = new DedupMap();

    const first = dedup.computeHash("s1", "tool", "a".repeat(500) + "x");
    const samePreview = dedup.computeHash("s1", "tool", "a".repeat(500) + "y");
    const differentTool = dedup.computeHash("s1", "other", "a".repeat(500) + "x");

    expect(first).toBe(samePreview);
    expect(first).not.toBe(differentTool);
  });

  it("records duplicates only until the ttl expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T00:00:00Z"));
    dedup = new DedupMap();

    const hash = dedup.computeHash("s1", "tool", { path: "src/index.ts" });
    expect(dedup.isDuplicate(hash)).toBe(false);

    dedup.record(hash);
    expect(dedup.isDuplicate(hash)).toBe(true);
    expect(dedup.size).toBe(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    expect(dedup.isDuplicate(hash)).toBe(false);
    expect(dedup.size).toBe(0);
  });
});

describe("branch-aware functions", () => {
  let sdk: MockSdk;
  let kv: MockKV;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerBranchAwareFunction(sdk as never, kv as never);
  });

  it("rejects missing cwd before shelling out", async () => {
    await expect(sdk.trigger("mem::detect-worktree", { cwd: "" })).resolves.toEqual({
      success: false,
      error: "cwd is required",
    });
    await expect(sdk.trigger("mem::list-worktrees", { cwd: "" })).resolves.toEqual({
      success: false,
      error: "cwd is required",
    });
  });

  it("falls back to plain project info outside a git checkout", async () => {
    const result = await sdk.trigger("mem::detect-worktree", {
      cwd: "/tmp/agentmemory-missing-git-dir",
    }) as {
      success: boolean;
      isWorktree: boolean;
      topLevel: string;
      mainRepoRoot: string;
      gitDir: string | null;
    };

    expect(result).toMatchObject({
      success: true,
      isWorktree: false,
      topLevel: "/tmp/agentmemory-missing-git-dir",
      mainRepoRoot: "/tmp/agentmemory-missing-git-dir",
      gitDir: null,
    });
  });

  it("filters branch sessions to the detected project root", async () => {
    await addSession(kv, "ses_old", {
      cwd: "/tmp/agentmemory-project/src",
      startedAt: "2026-06-14T09:00:00Z",
    });
    await addSession(kv, "ses_new", {
      cwd: "/tmp/agentmemory-project/packages/mcp",
      startedAt: "2026-06-14T11:00:00Z",
    });
    await addSession(kv, "ses_other", {
      cwd: "/tmp/other-project",
      startedAt: "2026-06-14T12:00:00Z",
    });

    const result = await sdk.trigger("mem::branch-sessions", {
      cwd: "/tmp/agentmemory-project",
      branch: "coverage/unit-core-functions",
    }) as { sessions: Array<{ id: string }>; projectRoot: string; branch: string };

    expect(result.projectRoot).toBe("/tmp/agentmemory-project");
    expect(result.branch).toBe("coverage/unit-core-functions");
    expect(result.sessions.map((session) => session.id)).toEqual([
      "ses_new",
      "ses_old",
    ]);
  });
});

describe("patterns functions", () => {
  let sdk: MockSdk;
  let kv: MockKV;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerPatternsFunction(sdk as never, kv as never);
  });

  it("detects repeated co-change and error patterns", async () => {
    for (const id of ["ses_1", "ses_2", "ses_3", "ses_4"]) {
      await addSession(kv, id, { project: "core" });
      await addObservation(kv, id, `obs_files_${id}`, {
        files: ["src/functions/a.ts", "src/functions/b.ts"],
        title: "Edited paired files",
      });
    }
    for (const id of ["ses_1", "ses_2", "ses_3"]) {
      await addObservation(kv, id, `obs_error_${id}`, {
        type: "error",
        title: "Timeout waiting for index",
        files: ["src/functions/index-persistence.ts"],
      });
    }

    const result = await sdk.trigger("mem::patterns", { project: "core" }) as {
      patterns: Array<{ type: string; description: string; frequency: number }>;
    };
    const rules = await sdk.trigger("mem::generate-rules", { project: "core" }) as {
      rules: string[];
    };

    expect(result.patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "co_change",
          frequency: 4,
        }),
        expect.objectContaining({
          type: "error_repeat",
          frequency: 3,
          description: "Recurring error: timeout waiting for index",
        }),
      ]),
    );
    expect(rules.rules).toEqual([
      "When modifying src/functions/a.ts, also check src/functions/b.ts (co-changed 4 times).",
      "Watch for: Recurring error: timeout waiting for index (occurred 3 times across 3 sessions).",
    ]);
  });

  it("keeps project filters isolated", async () => {
    await addSession(kv, "ses_core", { project: "core" });
    await addSession(kv, "ses_other", { project: "other" });
    await addObservation(kv, "ses_core", "obs_core", {
      files: ["src/core.ts"],
      title: "core edit",
    });
    await addObservation(kv, "ses_other", "obs_other", {
      type: "error",
      title: "Other project failure",
    });

    const result = await sdk.trigger("mem::patterns", { project: "core" }) as {
      patterns: Array<{ description: string }>;
    };

    expect(result.patterns).toEqual([]);
  });
});

describe("file context function", () => {
  let sdk: MockSdk;
  let kv: MockKV;

  beforeEach(() => {
    vi.clearAllMocks();
    sdk = mockSdk();
    kv = mockKV();
    registerFileIndexFunction(sdk as never, kv as never);
  });

  it("audits invalid file requests without scanning observations", async () => {
    const result = await sdk.trigger("mem::file-context", {
      sessionId: "current",
      files: [" ", ""],
      project: "core",
    }) as { context: string; files: string[] };

    expect(result).toEqual({ context: "", files: [] });
    expect(recordAudit).toHaveBeenCalledWith(
      kv,
      "observe",
      "mem::file-context",
      ["current"],
      expect.objectContaining({
        error: "invalid_payload",
        hasSessionId: true,
        hasProject: true,
        fileCount: 0,
      }),
    );
  });

  it("builds high-importance file context from other sessions in the same project", async () => {
    await addSession(kv, "current", {
      project: "core",
      startedAt: "2026-06-14T12:00:00Z",
    });
    await addSession(kv, "other", {
      project: "core",
      startedAt: "2026-06-14T11:00:00Z",
    });
    await addSession(kv, "wrong_project", {
      project: "other",
      startedAt: "2026-06-14T13:00:00Z",
    });
    await addObservation(kv, "other", "obs_match", {
      files: ["packages/app/src/index.ts"],
      type: "file_edit",
      title: "Refined app entrypoint",
      narrative: "Moved startup wiring behind a small adapter.",
      importance: 8,
    });
    await addObservation(kv, "other", "obs_low", {
      files: ["src/index.ts"],
      title: "Low signal edit",
      importance: 3,
    });
    await addObservation(kv, "current", "obs_current", {
      files: ["src/index.ts"],
      title: "Current session should be excluded",
      importance: 10,
    });
    await addObservation(kv, "wrong_project", "obs_wrong_project", {
      files: ["src/index.ts"],
      title: "Wrong project should be excluded",
      importance: 10,
    });

    const result = await sdk.trigger("mem::file-context", {
      sessionId: "current",
      files: ["./src/index.ts"],
      project: "core",
    }) as { context: string };

    expect(result.context).toContain("<agentmemory-file-context>");
    expect(result.context).toContain("## ./src/index.ts");
    expect(result.context).toContain(
      "- [file_edit] Refined app entrypoint: Moved startup wiring behind a small adapter.",
    );
    expect(result.context).not.toContain("Low signal edit");
    expect(result.context).not.toContain("Current session should be excluded");
    expect(result.context).not.toContain("Wrong project should be excluded");
    expect(recordAccessBatch).toHaveBeenCalledWith(kv, ["obs_match"]);
  });

  it("returns empty context when no important matching observations exist", async () => {
    await addSession(kv, "other", { project: "core" });
    await addObservation(kv, "other", "obs_unmatched", {
      files: ["src/other.ts"],
      title: "Unmatched file",
      importance: 9,
    });

    const result = await sdk.trigger("mem::file-context", {
      files: ["src/index.ts"],
      project: "core",
    }) as { context: string };

    expect(result).toEqual({ context: "" });
    expect(recordAccessBatch).not.toHaveBeenCalled();
  });
});
