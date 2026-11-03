import { describe, it, expect, vi } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";
import { registerFileIndexFunction } from "../src/functions/file-index.js";
import { relativizeFilePath, relativizePaths, type PathAlias } from "../src/hooks/_relative-paths.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(),
}));

const posix: PathAlias[] = [
  { from: "/repo/.claude/worktrees/wt", to: "" },
  { from: "/repo", to: "" },
];

describe("capture: what a hook sends", () => {
  it.each([
    ["a file in the repository", "/repo/src/a.ts", "src/a.ts"],
    ["a file in a nested worktree", "/repo/.claude/worktrees/wt/src/a.ts", "src/a.ts"],
    ["the root", "/repo", "."],
    ["the root with a trailing slash", "/repo/", "."],
    ["a doubled slash", "/repo//src/a.ts", "src/a.ts"],
    ["a quoted path", '"/repo/a.ts"', '"a.ts"'],
    ["a path with a line suffix", "/repo/a.ts:12:3", "a.ts:12:3"],
    ["a path before shell operators", "cd /repo&&ls|wc", "cd .&&ls|wc"],
    ["a sibling directory", "/repo-old/a.ts", "/repo-old/a.ts"],
    ["the root inside a longer path", "/mnt/repo/a.ts", "/mnt/repo/a.ts"],
    ["a remote `host:` path", "scp host:/repo/a.ts .", "scp host:/repo/a.ts ."],
    ["a URL path", "https://example.com/repo/a", "https://example.com/repo/a"],
    ["another case on a case-sensitive volume", "/Repo/a.ts", "/Repo/a.ts"],
  ])("Linux: %s", (_name, input, expected) => {
    expect(relativizePaths(input, posix, "linux")).toBe(expected);
  });

  it.each([
    ["another case on a case-insensitive volume", "/REPO/a.ts", true, "a.ts"],
    ["another case on a case-sensitive volume", "/REPO/a.ts", false, "/REPO/a.ts"],
  ])("macOS: %s", (_name, input, ignoresCase, expected) => {
    expect(relativizePaths(input, posix, "darwin", ignoresCase)).toBe(expected);
  });

  it.each([
    ["a path field, in full", { file_path: "C:\\Repo\\my dir\\a (1).ts" }, { file_path: "my dir/a (1).ts" }],
    ["free text, up to the next space", "C:\\repo\\a.ts and docs\\b.md", "a.ts and docs\\b.md"],
  ])("Windows: %s", (_name, input, expected) => {
    expect(relativizePaths(input, [{ from: "C:\\repo", to: "" }], "win32")).toEqual(expected);
  });
});

describe("round trip: capture on one machine, look up on another", () => {
  const mac: PathAlias[] = [
    { from: "/Users/me/Dev/app/.claude/worktrees/fix", to: "" },
    { from: "/Users/me/Dev/app", to: "" },
  ];
  const laptop: PathAlias[] = [{ from: "/home/me/dev/app", to: "" }];

  async function store() {
    const sdk = mockSdk({ looseTrigger: true });
    const kv = mockKV();
    registerFileIndexFunction(sdk as never, kv as never);
    const capture = async (id: string, project: string, cwd: string, absolute: string, aliases: PathAlias[]) => {
      const startedAt = new Date().toISOString();
      await kv.set(KV.sessions, id, { id, project, cwd, startedAt, status: "completed", observationCount: 1 });
      await kv.set(KV.observations(id), `obs_${id}`, {
        id: `obs_${id}`, sessionId: id, timestamp: startedAt, type: "file_edit", title: `seen ${id}`,
        narrative: "", facts: [], concepts: [], importance: 6,
        files: [relativizeFilePath(absolute, aliases, "darwin")],
      });
    };
    await capture("mac_src", "app", "/Users/me/Dev/app", "/Users/me/Dev/app/src/a.ts", mac);
    await capture("mac_wt", "app", "/Users/me/Dev/app/.claude/worktrees/fix", "/Users/me/Dev/app/.claude/worktrees/fix/lib/b.ts", mac);
    await capture("mac_root", "app", "/Users/me/Dev/app", "/Users/me/Dev/app/package.json", mac);
    await capture("mac_nested", "app", "/Users/me/Dev/app", "/Users/me/Dev/app/packages/x/package.json", mac);
    await capture("other_src", "other", "/Users/me/Dev/other", "/Users/me/Dev/other/src/a.ts", [{ from: "/Users/me/Dev/other", to: "" }]);
    const found = async (absolute: string, relativeFiles = true) => {
      const query = relativeFiles ? relativizeFilePath(absolute, laptop, "linux") : absolute;
      const { context } = (await sdk.trigger("mem::file-context", {
        files: [query],
        ...(relativeFiles && { project: "app", relativeFiles: true }),
      })) as { context: string };
      return ["mac_src", "mac_wt", "mac_root", "mac_nested", "other_src"].filter((id) => context.includes(`seen ${id}`));
    };
    return found;
  }

  it.each([
    ["a file captured in the main checkout", "/home/me/dev/app/src/a.ts", ["mac_src"]],
    ["a file captured in a worktree", "/home/me/dev/app/lib/b.ts", ["mac_wt"]],
    ["the root package.json, not the nested one", "/home/me/dev/app/package.json", ["mac_root"]],
    ["the nested package.json, not the root one", "/home/me/dev/app/packages/x/package.json", ["mac_nested"]],
    ["a file nobody captured", "/home/me/dev/app/src/none.ts", []],
  ])("finds %s", async (_name, query, expected) => {
    const found = await store();
    expect(await found(query)).toEqual(expected);
  });

  it("matches as on main when the request is not relative", async () => {
    const found = await store();
    expect(await found("/home/me/dev/app/src/a.ts", false)).toEqual(["mac_src", "other_src"]);
  });
});
