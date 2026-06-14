import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(),
  deleteAccessLog: vi.fn(),
}));

vi.mock("../src/config.js", () => ({
  getAgentId: () => undefined,
  isAgentScopeIsolated: () => false,
}));

import { resolveProject } from "../src/hooks/_project.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerSearchFunction, getSearchIndex, setIndexPersistence } from "../src/functions/search.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function initRepo(dir: string): void {
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "agentmemory-test@example.com"]);
  git(dir, ["config", "user.name", "agentmemory test"]);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-m", "initial"]);
}

function makeMockKV() {
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

function makeMockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

function registerMemorySearch() {
  const sdk = makeMockSdk();
  const kv = makeMockKV();
  registerRememberFunction(sdk as never, kv as never);
  registerSearchFunction(sdk as never, kv as never);
  return sdk;
}

describe("worktree project scoping", () => {
  const originalProjectId = process.env.AGENTMEMORY_PROJECT_ID;
  const originalProjectName = process.env.AGENTMEMORY_PROJECT_NAME;

  beforeEach(() => {
    delete process.env.AGENTMEMORY_PROJECT_ID;
    delete process.env.AGENTMEMORY_PROJECT_NAME;
    setIndexPersistence(null);
    getSearchIndex().clear();
  });

  afterEach(() => {
    setIndexPersistence(null);
    getSearchIndex().clear();
    if (originalProjectId === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_ID;
    } else {
      process.env.AGENTMEMORY_PROJECT_ID = originalProjectId;
    }
    if (originalProjectName === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = originalProjectName;
    }
  });

  it("memory written in one linked worktree is recalled from another linked worktree", async () => {
    const parent = mkdtempSync(join(tmpdir(), "amem-e2e-parent-"));
    const linkedParent = mkdtempSync(join(tmpdir(), "amem-e2e-linked-"));
    const linked = join(linkedParent, "same-name");

    try {
      initRepo(parent);
      git(parent, ["worktree", "add", "-b", "feature/e2e", linked]);

      const projectFromParent = resolveProject(parent);
      const projectFromLinked = resolveProject(linked);
      expect(projectFromLinked).toBe(projectFromParent);
      expect(projectFromParent).toMatch(/^git:[a-f0-9]{32}$/);
      expect(projectFromParent).not.toContain(parent);
      expect(projectFromParent).not.toContain(linked);

      const sdk = registerMemorySearch();

      await sdk.trigger("mem::remember", {
        content: "linked worktrees must share repository memory scope",
        type: "fact",
        project: projectFromParent,
      });

      getSearchIndex().clear();

      const result = await sdk.trigger("mem::search", {
        query: "repository memory scope",
        project: projectFromLinked,
      }) as { results: Array<{ observation: { title: string; narrative?: string } }> };

      const combined = result.results
        .map((r) => `${r.observation.title} ${r.observation.narrative ?? ""}`)
        .join(" ");
      expect(combined).toContain("linked worktrees");
    } finally {
      rmSync(linkedParent, { recursive: true, force: true });
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("same-basename unrelated repositories do not share recall", async () => {
    const rootA = mkdtempSync(join(tmpdir(), "amem-same-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "amem-same-b-"));
    const repoA = join(rootA, "same-name");
    const repoB = join(rootB, "same-name");

    try {
      mkdirSync(repoA);
      mkdirSync(repoB);
      initRepo(repoA);
      initRepo(repoB);

      const projectA = resolveProject(repoA);
      const projectB = resolveProject(repoB);
      expect(projectA).not.toBe(projectB);
      expect(projectA).toMatch(/^git:[a-f0-9]{32}$/);
      expect(projectB).toMatch(/^git:[a-f0-9]{32}$/);
      expect(projectA).not.toContain(repoA);
      expect(projectB).not.toContain(repoB);

      const sdk = registerMemorySearch();

      await sdk.trigger("mem::remember", {
        content: "repo A has a private architecture decision",
        type: "architecture",
        project: projectA,
      });

      getSearchIndex().clear();

      const result = await sdk.trigger("mem::search", {
        query: "private architecture decision",
        project: projectB,
      }) as { results: Array<{ observation: { title: string; narrative?: string } }> };

      expect(result.results).toHaveLength(0);
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  });

  it("keeps historical basename scope separate unless AGENTMEMORY_PROJECT_NAME is set", async () => {
    const root = mkdtempSync(join(tmpdir(), "amem-legacy-"));
    const repo = join(root, "same-name");

    try {
      mkdirSync(repo);
      initRepo(repo);

      const historicalProject = basename(repo);
      const opaqueProject = resolveProject(repo);
      expect(opaqueProject).toMatch(/^git:[a-f0-9]{32}$/);
      expect(opaqueProject).not.toBe(historicalProject);
      expect(opaqueProject).not.toContain(repo);

      const sdk = registerMemorySearch();

      await sdk.trigger("mem::remember", {
        content: "legacy basename scope keeps release checklist",
        type: "workflow",
        project: historicalProject,
      });

      getSearchIndex().clear();

      const opaqueResult = await sdk.trigger("mem::search", {
        query: "release checklist",
        project: opaqueProject,
      }) as { results: Array<{ observation: { title: string; narrative?: string } }> };
      expect(opaqueResult.results).toHaveLength(0);

      process.env.AGENTMEMORY_PROJECT_NAME = historicalProject;
      const overrideProject = resolveProject(repo);
      expect(overrideProject).toBe(historicalProject);

      const legacyResult = await sdk.trigger("mem::search", {
        query: "release checklist",
        project: overrideProject,
      }) as { results: Array<{ observation: { title: string; narrative?: string } }> };
      const combined = legacyResult.results
        .map((r) => `${r.observation.title} ${r.observation.narrative ?? ""}`)
        .join(" ");
      expect(combined).toContain("legacy basename scope");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
