import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// remember.ts touches the BM25/vector indexes after save; neither exists in
// this harness, so stub them the same way multimodal.test.ts does.
vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({ add: vi.fn(), remove: vi.fn() }),
  vectorIndexAddGuarded: vi.fn().mockResolvedValue(false),
  vectorIndexRemove: vi.fn().mockResolvedValue(undefined),
  flushIndexSave: vi.fn().mockResolvedValue(undefined),
}));

import { stripPrivateData, scrubRecord } from "../src/functions/privacy.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerSlotsFunctions } from "../src/functions/slots.js";
import { registerTeamFunction } from "../src/functions/team.js";
import { registerSketchesFunction } from "../src/functions/sketches.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import { KV } from "../src/state/schema.js";
import type {
  Memory,
  Lesson,
  MemorySlot,
  Sketch,
  TeamSharedItem,
  CompressedObservation,
  ExportData,
  MemoryProvider,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures: one representative secret per pattern family under test
// ---------------------------------------------------------------------------
const GH_TOKEN = "ghp_" + "A".repeat(36);
const ANTHROPIC_KEY = "sk-ant-abcdefghij0123456789xyz";
const DB_URL = "postgres://admin:hunter2secret@db.internal:5432/app";
const PEM_KEY =
  "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7bq=\n-----END RSA PRIVATE KEY-----";

function expectClean(text: string) {
  expect(text).not.toContain(GH_TOKEN);
  expect(text).not.toContain(ANTHROPIC_KEY);
  expect(text).not.toContain("hunter2secret");
  expect(text).not.toContain("BEGIN RSA PRIVATE KEY");
}

// ---------------------------------------------------------------------------
// Shared harness (same shape as lessons.test.ts / multimodal.test.ts)
// ---------------------------------------------------------------------------
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
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    },
  };
}

function mockSdk() {
  const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
  return {
    handlers,
    registerFunction: (
      idOrOpts: string | { id: string },
      cb: (data: unknown) => Promise<unknown>,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      handlers.set(id, cb);
    },
    registerTrigger: () => {},
    trigger: async (
      input: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof input === "string" ? input : input.function_id;
      const payload = typeof input === "string" ? data : input.payload;
      const fn = handlers.get(id);
      // Side-channel triggers (streams, cascade) are out of scope here.
      if (!fn) return undefined;
      return fn(payload);
    },
  };
}

type Harness = {
  kv: ReturnType<typeof mockKV>;
  sdk: ReturnType<typeof mockSdk>;
  call: (fn: string, data: unknown) => Promise<Record<string, unknown>>;
};

function wire(register: (sdk: never, kv: never) => void): Harness {
  const kv = mockKV();
  const sdk = mockSdk();
  register(sdk as never, kv as never);
  const call = async (fn: string, data: unknown) => {
    const handler = sdk.handlers.get(fn);
    if (!handler) throw new Error(`No handler registered: ${fn}`);
    return (await handler(data)) as Record<string, unknown>;
  };
  return { kv, sdk, call };
}

// ---------------------------------------------------------------------------
// 1. New patterns in privacy.ts
// ---------------------------------------------------------------------------
describe("privacy.ts — new patterns and scrubRecord", () => {
  it("redacts PEM private key blocks", () => {
    const out = stripPrivateData(`config had\n${PEM_KEY}\nin it`);
    expect(out).toContain("[REDACTED_SECRET]");
    expect(out).not.toContain("BEGIN RSA PRIVATE KEY");
  });

  it("redacts OpenSSH private key blocks", () => {
    const key =
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA==\n-----END OPENSSH PRIVATE KEY-----";
    expect(stripPrivateData(key)).toBe("[REDACTED_SECRET]");
  });

  it("redacts DB connection-string credentials", () => {
    const out = stripPrivateData(`DATABASE_URL=${DB_URL}`);
    expect(out).not.toContain("hunter2secret");
    // host/db suffix survives — only the credential part is removed
    expect(out).toContain("db.internal:5432/app");
  });

  it("redacts mongodb+srv and mysql URLs", () => {
    expect(
      stripPrivateData("mongodb+srv://user:p4ss@cluster.mongodb.net/db"),
    ).not.toContain("p4ss");
    expect(
      stripPrivateData("mysql://root:rootpw@localhost:3306/x"),
    ).not.toContain("rootpw");
  });

  it("does not redact credential-less URLs", () => {
    const url = "postgres://db.internal:5432/app";
    expect(stripPrivateData(url)).toBe(url);
  });

  it("scrubRecord walks nested objects and arrays, preserving non-strings", () => {
    const output = scrubRecord({
      title: `uses ${GH_TOKEN}`,
      nested: { facts: [`db is ${DB_URL}`, "clean fact"] },
      count: 7,
      flag: true,
    });
    expect(output.title).toBe("uses [REDACTED_SECRET]");
    expect(output.nested.facts[0]).not.toContain("hunter2secret");
    expect(output.nested.facts[1]).toBe("clean fact");
    expect(output.count).toBe(7);
    expect(output.flag).toBe(true);
  });

  it("scrubRecord leaves clean records semantically identical", () => {
    const record = { a: "hello", b: [1, 2], c: null };
    expect(scrubRecord(record)).toEqual(record);
  });
});

// ---------------------------------------------------------------------------
// 2. mem::remember (explicit memory_save path)
// ---------------------------------------------------------------------------
describe("mem::remember scrubs explicit saves", () => {
  let h: Harness;
  beforeEach(() => {
    h = wire(registerRememberFunction as never);
  });

  it("scrubs secrets from content before persisting", async () => {
    const res = await h.call("mem::remember", {
      content: `Deploy needs ${GH_TOKEN} and connects via ${DB_URL}`,
      type: "workflow",
    });
    expect(res["success"]).toBe(true);

    const stored = await h.kv.list<Memory>(KV.memories);
    expect(stored).toHaveLength(1);
    expectClean(stored[0].content);
    expectClean(stored[0].title);
    expect(stored[0].content).toContain("[REDACTED_SECRET]");
  });

  it("scrubs PEM keys pasted into memory content", async () => {
    await h.call("mem::remember", {
      content: `Cert setup:\n${PEM_KEY}\ndone`,
    });
    const stored = await h.kv.list<Memory>(KV.memories);
    expectClean(stored[0].content);
  });
});

// ---------------------------------------------------------------------------
// 3. mem::lesson-save
// ---------------------------------------------------------------------------
describe("mem::lesson-save scrubs lessons", () => {
  let h: Harness;
  beforeEach(() => {
    h = wire(registerLessonsFunctions as never);
  });

  it("scrubs content and context", async () => {
    const res = await h.call("mem::lesson-save", {
      content: `Auth header must be Bearer ${ANTHROPIC_KEY}`,
      context: `discovered while debugging ${DB_URL}`,
    });
    expect(res["success"]).toBe(true);
    const lesson = res["lesson"] as Lesson;
    expectClean(lesson.content);
    expectClean(lesson.context);

    const stored = await h.kv.list<Lesson>(KV.lessons);
    expectClean(stored[0].content);
  });

  it("dedups on scrubbed content (two different tokens → one lesson)", async () => {
    const first = await h.call("mem::lesson-save", {
      content: `rotate token ghp_${"A".repeat(36)} monthly`,
    });
    const second = await h.call("mem::lesson-save", {
      content: `rotate token ghp_${"B".repeat(36)} monthly`,
    });
    expect(first["action"]).toBe("created");
    // Both scrub to the same string, so the fingerprint matches and the
    // second save reinforces instead of storing a second secret-bearing row.
    expect(second["action"]).toBe("strengthened");
    expect(await h.kv.list<Lesson>(KV.lessons)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Slots: create / append / replace
// ---------------------------------------------------------------------------
describe("slots scrub content writes", () => {
  let h: Harness;
  beforeEach(() => {
    h = wire(registerSlotsFunctions as never);
  });

  it("slot-create scrubs initial content", async () => {
    const res = await h.call("mem::slot-create", {
      label: "deploy_notes",
      content: `staging db: ${DB_URL}`,
    });
    expect(res["success"]).toBe(true);
    expectClean((res["slot"] as MemorySlot).content);
  });

  it("slot-append scrubs appended text", async () => {
    await h.call("mem::slot-create", { label: "scratch", content: "start" });
    const res = await h.call("mem::slot-append", {
      label: "scratch",
      text: `new key is ${GH_TOKEN}`,
    });
    expect(res["success"]).toBe(true);
    const slot = res["slot"] as MemorySlot;
    expect(slot.content).toContain("start");
    expectClean(slot.content);
  });

  it("slot-replace scrubs replacement content", async () => {
    await h.call("mem::slot-create", { label: "scratch2", content: "x" });
    const res = await h.call("mem::slot-replace", {
      label: "scratch2",
      content: `creds:\n${PEM_KEY}`,
    });
    expect(res["success"]).toBe(true);
    expectClean((res["slot"] as MemorySlot).content);
  });
});

// ---------------------------------------------------------------------------
// 5. mem::team-share re-scrubs at the sharing boundary
// ---------------------------------------------------------------------------
describe("mem::team-share scrubs shared content", () => {
  it("scrubs a legacy memory row that still contains a secret", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerTeamFunction(sdk as never, kv as never, {
      teamId: "team1",
      userId: "user1",
      mode: "shared",
    });

    // Simulate a pre-existing row written before a pattern was added.
    await kv.set(KV.memories, "mem_legacy", {
      id: "mem_legacy",
      content: `prod db is ${DB_URL}`,
      title: `uses ${GH_TOKEN}`,
    });

    const handler = sdk.handlers.get("mem::team-share")!;
    const res = (await handler({
      itemId: "mem_legacy",
      itemType: "memory",
    })) as { success: boolean; sharedItem: TeamSharedItem };

    expect(res.success).toBe(true);
    const shared = res.sharedItem.content as { content: string; title: string };
    expectClean(shared.content);
    expectClean(shared.title);

    const stored = await kv.list<TeamSharedItem>(KV.teamShared("team1"));
    expectClean(JSON.stringify(stored[0].content));
  });
});

// ---------------------------------------------------------------------------
// 6. Sketches: create + add
// ---------------------------------------------------------------------------
describe("sketches scrub titles and descriptions", () => {
  let h: Harness;
  beforeEach(() => {
    h = wire(registerSketchesFunction as never);
  });

  it("sketch-create scrubs title and description", async () => {
    const res = await h.call("mem::sketch-create", {
      title: `migrate off ${DB_URL}`,
      description: `old token: ${GH_TOKEN}`,
    });
    expect(res["success"]).toBe(true);
    const sketch = res["sketch"] as Sketch;
    expectClean(sketch.title);
    expectClean(sketch.description);
  });

  it("sketch-add scrubs action title and description", async () => {
    const created = await h.call("mem::sketch-create", { title: "plan" });
    const sketchId = (created["sketch"] as Sketch).id;
    const res = await h.call("mem::sketch-add", {
      sketchId,
      title: `rotate ${ANTHROPIC_KEY}`,
      description: `currently ${DB_URL}`,
    });
    expect(res["success"]).toBe(true);
    const action = res["action"] as { title: string; description: string };
    expectClean(action.title);
    expectClean(action.description);
  });
});

// ---------------------------------------------------------------------------
// 7. mem::import scrubs imported dumps
// ---------------------------------------------------------------------------
describe("mem::import scrubs imported data", () => {
  it("scrubs memories and observations from an imported dump", async () => {
    const h = wire(registerExportImportFunction as never);

    const exportData: ExportData = {
      version: "0.9.27",
      exportedAt: new Date().toISOString(),
      sessions: [
        {
          id: "sess1",
          project: "demo",
          cwd: "/tmp",
          startedAt: new Date().toISOString(),
          status: "completed",
          observationCount: 1,
          firstPrompt: `set ANTHROPIC_API_KEY=${ANTHROPIC_KEY}`,
        },
      ],
      observations: {
        sess1: [
          {
            id: "obs1",
            sessionId: "sess1",
            timestamp: new Date().toISOString(),
            type: "command_run",
            title: "ran deploy",
            facts: [`pushed with ${GH_TOKEN}`],
            narrative: `deployed using ${DB_URL}`,
            concepts: ["deploy"],
            files: [],
            importance: 0.5,
          },
        ],
      },
      memories: [
        {
          id: "mem1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          type: "fact",
          title: "db location",
          content: `database lives at ${DB_URL}`,
          concepts: [],
          files: [],
          sessionIds: ["sess1"],
          strength: 5,
          version: 1,
          isLatest: true,
        },
      ],
      summaries: [],
    };

    const res = await h.call("mem::import", { exportData });
    expect(res["success"]).toBe(true);

    const memories = await h.kv.list<Memory>(KV.memories);
    expectClean(memories[0].content);

    const obs = await h.kv.list<CompressedObservation>(
      KV.observations("sess1"),
    );
    expectClean(obs[0].narrative);
    expectClean(JSON.stringify(obs[0].facts));

    const sessions = await h.kv.list<{ firstPrompt?: string }>(KV.sessions);
    expectClean(sessions[0].firstPrompt ?? "");
  });

  it("imports a clean dump without error", async () => {
    const h = wire(registerExportImportFunction as never);
    const res = await h.call("mem::import", {
      exportData: {
        version: "0.9.27",
        exportedAt: new Date().toISOString(),
        sessions: [],
        observations: {},
        memories: [],
        summaries: [],
      } satisfies ExportData,
    });
    expect(res["success"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. mem::compress scrubs LLM output
// ---------------------------------------------------------------------------
describe("mem::compress scrubs model output", () => {
  it("redacts a secret the model echoed into the summary", async () => {
    const kv = mockKV();
    const sdk = mockSdk();

    // Model echoes a secret from its context into the narrative — the raw
    // observation was scrubbed at capture, but this output was not, until now.
    const xmlWithSecret = `<type>command_run</type>
<title>Configured deploy token</title>
<subtitle>token setup</subtitle>
<facts><fact>set token ${GH_TOKEN}</fact></facts>
<narrative>The agent configured CI using ${GH_TOKEN} against ${DB_URL}</narrative>
<concepts><concept>deploy</concept></concepts>
<files></files>
<importance>5</importance>`;

    const provider: MemoryProvider = {
      name: "mock",
      compress: async () => xmlWithSecret,
      summarize: async () => "",
    };

    registerCompressFunction(sdk as never, kv as never, provider);

    const handler = sdk.handlers.get("mem::compress")!;
    const res = (await handler({
      observationId: "obs_x",
      sessionId: "sess_x",
      raw: {
        id: "obs_x",
        sessionId: "sess_x",
        timestamp: new Date().toISOString(),
        hookType: "post_tool_use",
        toolName: "Bash",
        toolInput: "deploy.sh",
        toolOutput: "ok",
        raw: {},
      },
    })) as { success: boolean; compressed: CompressedObservation };

    expect(res.success).toBe(true);
    expectClean(res.compressed.narrative);
    expectClean(JSON.stringify(res.compressed.facts));
    expectClean(res.compressed.title);

    const stored = await kv.get<CompressedObservation>(
      KV.observations("sess_x"),
      "obs_x",
    );
    expectClean(JSON.stringify(stored));
  });
});
