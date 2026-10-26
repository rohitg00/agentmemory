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

async function seed(kv: ReturnType<typeof mockKV>, sessionId: string, project: string, file: string) {
  const startedAt = new Date().toISOString();
  await kv.set(KV.sessions, sessionId, { id: sessionId, project, cwd: `/repos/${project}`, startedAt, status: "completed", observationCount: 1 });
  await kv.set(KV.observations(sessionId), `obs_${sessionId}`, {
    id: `obs_${sessionId}`,
    sessionId,
    timestamp: startedAt,
    type: "file_edit",
    title: `edited ${file} in ${project}`,
    narrative: "",
    facts: [],
    concepts: [],
    files: [file],
    importance: 6,
  });
}

describe("mem::file-context with repository-relative paths", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  const lookup = async (payload: Record<string, unknown>) => {
    const { context } = (await sdk.trigger("mem::file-context", payload)) as { context: string };
    return ["repo-a", "repo-b", "repo-c", "repo-w"].filter((project) => context.includes(`in ${project}`));
  };
  const lookupFor = (files: string[], project: string) => lookup({ files, project });

  beforeEach(async () => {
    sdk = mockSdk({ looseTrigger: true });
    kv = mockKV();
    registerFileIndexFunction(sdk as never, kv as never);
    await seed(kv, "ses_a", "repo-a", "src/a.ts");
    await seed(kv, "ses_b", "repo-b", "src/a.ts");
    await seed(kv, "ses_abs", "repo-c", "/repos/repo-c/src/a.ts");
  });

  it("does not match relative entries to an absolute query without a project", async () => {
    expect(await lookup({ files: ["/repos/repo-c/src/a.ts"] })).toEqual(["repo-c"]);
  });

  it("treats a UNC query as absolute", async () => {
    expect(await lookup({ files: ["\\\\server\\share\\repo-c\\src\\a.ts"] })).toEqual([]);
  });

  it("treats a blank project as no project", async () => {
    expect(await lookup({ files: ["/repos/repo-c/src/a.ts"], project: "  " })).toEqual(["repo-c"]);
  });

  it("matches relative entries of the scoped project only", async () => {
    expect(await lookup({ files: ["/repos/repo-a/src/a.ts"], project: "repo-a" })).toEqual(["repo-a"]);
  });

  it("matches a Windows query against a forward-slash entry", async () => {
    expect(await lookup({ files: ["C:\\repos\\repo-a\\src\\a.ts"], project: "repo-a" })).toEqual(["repo-a"]);
  });

  it("matches a stored Windows entry against a forward-slash query", async () => {
    await seed(kv, "ses_win", "repo-w", "src\\w.ts");
    expect(await lookupFor(["src/w.ts"], "repo-w")).toContain("repo-w");
  });

  it("still matches a relative query against relative entries", async () => {
    expect(await lookup({ files: ["src/a.ts"], project: "repo-b" })).toEqual(["repo-b"]);
  });
});

describe("mem::enrich", () => {
  it("passes its project to mem::file-context", async () => {
    const sdk = mockSdk({ looseTrigger: true });
    const kv = mockKV();
    registerEnrichFunction(sdk as never, kv as never);
    const fileContext = vi.fn(async () => ({ context: "" }));
    sdk.registerFunction("mem::file-context", fileContext);
    sdk.registerFunction("mem::search", async () => ({ results: [] }));
    await sdk.trigger("mem::enrich", { sessionId: "ses_now", files: ["/repos/repo-a/src/a.ts"], project: "repo-a" });
    expect(fileContext).toHaveBeenCalledWith(expect.objectContaining({ project: "repo-a" }));
  });
});
