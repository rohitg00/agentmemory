import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerContextFunction } from "../src/functions/context.js";
import type { StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import type { Lesson, Session, SessionSummary } from "../src/types.js";
import type { ISdk } from "iii-sdk";

vi.mock("iii-sdk", () => ({
  TriggerAction: {
    Enqueue: vi.fn(),
    Void: vi.fn(),
  },
  registerWorker: vi.fn(),
}));

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
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

type ContextHandler = (data: {
  sessionId: string;
  project: string;
  budget?: number;
}) => Promise<{ context: string; blocks: number; tokens: number }>;

const registerFunction = vi.fn();
const sdk = {
  registerFunction,
} as unknown as ISdk;

function wireContext(kv: ReturnType<typeof mockKV>) {
  let handler: ContextHandler | undefined;
  registerFunction.mockReset();
  registerFunction.mockImplementation((id: string, cb: ContextHandler) => {
    if (id === "mem::context") handler = cb;
  });
  registerContextFunction(sdk, kv as unknown as StateKV, 4000);
  if (!handler) throw new Error("mem::context not registered");
  return handler;
}

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: "ses",
    project: "/tmp/repo",
    cwd: "/tmp/repo",
    startedAt: "2026-01-01T00:00:00Z",
    status: "active",
    observationCount: 0,
    ...overrides,
  };
}

function makeLesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: "lesson_worktree",
    content: "reuse the project memory when launched from a Codex worktree",
    context: "",
    confidence: 0.9,
    reinforcements: 1,
    source: "manual",
    sourceIds: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    decayRate: 0.05,
    ...overrides,
  };
}

describe("mem::context project aliases", () => {
  let kv: ReturnType<typeof mockKV>;
  let handler: ContextHandler;

  beforeEach(() => {
    kv = mockKV();
    handler = wireContext(kv);
  });

  it("loads lessons and summaries saved under the current worktree cwd", async () => {
    const canonicalProject = "/tmp/repo";
    const worktreeCwd = "/tmp/repo-worktrees/feature";

    const current = makeSession({
      id: "ses_current",
      project: canonicalProject,
      cwd: worktreeCwd,
    });
    const legacy = makeSession({
      id: "ses_legacy",
      project: worktreeCwd,
      cwd: worktreeCwd,
      startedAt: "2026-01-02T00:00:00Z",
      status: "completed",
    });
    const summary: SessionSummary = {
      sessionId: legacy.id,
      title: "Worktree context carried over",
      narrative: "Previous Codex worktree session found the API mismatch.",
      keyDecisions: ["canonicalize project identity"],
      filesModified: ["src/functions/project-identity.ts"],
      createdAt: "2026-01-02T00:00:00Z",
    };
    const lesson = makeLesson({ project: worktreeCwd });

    await kv.set(KV.sessions, current.id, current);
    await kv.set(KV.sessions, legacy.id, legacy);
    await kv.set(KV.summaries, legacy.id, summary);
    await kv.set(KV.lessons, lesson.id, lesson);

    const result = await handler({
      sessionId: current.id,
      project: canonicalProject,
    });

    expect(result.context).toContain("reuse the project memory");
    expect(result.context).toContain("Worktree context carried over");
    expect(result.context).toContain("canonicalize project identity");
  });
});
