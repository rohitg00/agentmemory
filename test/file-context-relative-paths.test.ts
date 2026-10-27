import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";
import { registerFileIndexFunction } from "../src/functions/file-index.js";
import { registerEnrichFunction } from "../src/functions/enrich.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(),
}));

const PROJECTS = ["repo-a", "repo-b", "repo-c", "repo-w"];

async function seed(
  kv: ReturnType<typeof mockKV>,
  sessionId: string,
  project: string,
  file: string,
  label = file,
  cwd = `/repos/${project}`,
) {
  const startedAt = new Date().toISOString();
  await kv.set(KV.sessions, sessionId, { id: sessionId, project, cwd, startedAt, status: "completed", observationCount: 1 });
  await kv.set(KV.observations(sessionId), `obs_${sessionId}`, {
    id: `obs_${sessionId}`,
    sessionId,
    timestamp: startedAt,
    type: "file_edit",
    title: `edited ${label} in ${project}`,
    narrative: "",
    facts: [],
    concepts: [],
    files: [file],
    importance: 6,
  });
}

describe("mem::file-context", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  const lookup = async (payload: Record<string, unknown>) => {
    const { context } = (await sdk.trigger("mem::file-context", payload)) as { context: string };
    return context;
  };
  const projectsIn = (context: string) => PROJECTS.filter((project) => context.includes(`in ${project}`));

  beforeEach(async () => {
    sdk = mockSdk({ looseTrigger: true });
    kv = mockKV();
    registerFileIndexFunction(sdk as never, kv as never);
    await seed(kv, "ses_a", "repo-a", "src/a.ts");
    await seed(kv, "ses_b", "repo-b", "src/a.ts");
    await seed(kv, "ses_abs", "repo-c", "/repos/repo-c/src/a.ts");
  });

  describe("without relativeFiles", () => {
    it("matches as before: an absolute query also finds relative entries", async () => {
      expect(projectsIn(await lookup({ files: ["/repos/repo-c/src/a.ts"] }))).toEqual(["repo-a", "repo-b", "repo-c"]);
    });
  });

  describe("with relativeFiles", () => {
    it("matches a relative entry of the scoped project exactly", async () => {
      expect(projectsIn(await lookup({ files: ["src/a.ts"], project: "repo-a", relativeFiles: true }))).toEqual(["repo-a"]);
    });

    it("does not match a root-level entry to a nested file of the same name, or the reverse", async () => {
      await seed(kv, "ses_root", "repo-a", "package.json", "root package.json");
      await seed(kv, "ses_nested", "repo-a", "packages/x/package.json", "nested package.json");
      const nested = await lookup({ files: ["packages/x/package.json"], project: "repo-a", relativeFiles: true });
      const root = await lookup({ files: ["package.json"], project: "repo-a", relativeFiles: true });
      expect([nested.includes("nested package.json"), nested.includes("root package.json")]).toEqual([true, false]);
      expect([root.includes("root package.json"), root.includes("nested package.json")]).toEqual([true, false]);
    });

    it("matches an absolute entry from before relative capture by its path inside the repository", async () => {
      expect(projectsIn(await lookup({ files: ["src/a.ts"], project: "repo-c", relativeFiles: true }))).toEqual(["repo-c"]);
      expect(projectsIn(await lookup({ files: ["a.ts"], project: "repo-c", relativeFiles: true }))).toEqual([]);
    });

    it("finds an older absolute entry only under the session's repository root", async () => {
      await seed(kv, "ses_sub", "repo-x", "/repos/repo-x/packages/x/package.json", "x package.json", "/repos/repo-x/packages/x");
      await seed(kv, "ses_out", "repo-x", "/repos/src/b.ts", "outside b.ts", "/repos/repo-x");
      await seed(kv, "ses_top", "repo-x", "/src/b.ts", "top b.ts", "/repos/repo-x");
      const root = await lookup({ files: ["package.json"], project: "repo-x", relativeFiles: true });
      const nested = await lookup({ files: ["packages/x/package.json"], project: "repo-x", relativeFiles: true });
      const outside = await lookup({ files: ["src/b.ts"], project: "repo-x", relativeFiles: true });
      expect([root.includes("x package.json"), nested.includes("x package.json")]).toEqual([false, true]);
      expect([outside.includes("outside b.ts"), outside.includes("top b.ts")]).toEqual([false, false]);
    });

    it("compares Windows drive letters in any case", async () => {
      await seed(kv, "ses_drive", "repo-w", "C:\\r\\repo-w\\src\\d.ts", "drive d.ts", "c:\\r\\repo-w");
      expect(await lookup({ files: ["src/d.ts"], project: "repo-w", relativeFiles: true })).toContain("drive d.ts");
    });

    it("matches a stored Windows entry", async () => {
      await seed(kv, "ses_win", "repo-w", "src\\w.ts");
      expect(projectsIn(await lookup({ files: ["src/w.ts"], project: "repo-w", relativeFiles: true }))).toEqual(["repo-w"]);
    });

    it("matches an absolute query as before", async () => {
      expect(projectsIn(await lookup({ files: ["/repos/repo-c/src/a.ts"], relativeFiles: true }))).toEqual(["repo-a", "repo-b", "repo-c"]);
    });
  });
});

describe("mem::enrich", () => {
  async function fileContextPayload(payload: Record<string, unknown>) {
    const sdk = mockSdk({ looseTrigger: true });
    registerEnrichFunction(sdk as never, mockKV() as never);
    const fileContext = vi.fn(async (_payload: unknown) => ({ context: "" }));
    sdk.registerFunction("mem::file-context", fileContext);
    sdk.registerFunction("mem::search", async () => ({ results: [] }));
    await sdk.trigger("mem::enrich", { sessionId: "ses_now", files: ["src/a.ts"], ...payload });
    return fileContext.mock.calls[0]?.[0];
  }

  it("passes its project and relativeFiles to mem::file-context for a relative request", async () => {
    expect(await fileContextPayload({ project: "repo-a", relativeFiles: true })).toMatchObject({
      project: "repo-a",
      relativeFiles: true,
    });
  });

  it("does not scope mem::file-context by project otherwise", async () => {
    expect(await fileContextPayload({ project: "repo-a" })).not.toHaveProperty("project");
  });

  it("matches bug memories at path boundaries for a relative request, and as before otherwise", async () => {
    const pastErrors = async (relativeFiles: boolean) => {
      const sdk = mockSdk({ looseTrigger: true });
      const kv = mockKV();
      registerEnrichFunction(sdk as never, kv as never);
      sdk.registerFunction("mem::file-context", async () => ({ context: "" }));
      sdk.registerFunction("mem::search", async () => ({ results: [] }));
      const now = new Date().toISOString();
      await kv.set(KV.memories, "mem_bug", {
        id: "mem_bug", type: "bug", isLatest: true, title: "data bug", content: "broke", files: ["/x/data.ts"],
        createdAt: now, updatedAt: now,
      });
      const { context } = (await sdk.trigger("mem::enrich", { sessionId: "s", files: ["a.ts"], ...(relativeFiles && { relativeFiles }) })) as {
        context: string;
      };
      return context.includes("data bug");
    };
    expect(await pastErrors(true)).toBe(false);
    expect(await pastErrors(false)).toBe(true);
  });
});
