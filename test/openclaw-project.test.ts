import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import plugin from "../integrations/openclaw/plugin.mjs";

describe("OpenClaw project scope", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "openclaw-scope-")); vi.stubEnv("AGENTMEMORY_PROJECT_NAME", ""); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
  async function scope(cwd: string) {
    const on = vi.fn(); const api = { on, logger: { warn: vi.fn() }, pluginConfig: {} };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"results":[]}'));
    plugin.register(api);
    await on.mock.calls.find(([name]) => name === "before_prompt_build")?.[1]({ prompt: "query", project: "wrong-event-project" }, { sessionId: "s", workspaceDir: cwd });
    return JSON.parse(String(fetch.mock.calls[0][1]?.body)).project;
  }
  it("uses the explicit project override", async () => {
    vi.stubEnv("AGENTMEMORY_PROJECT_NAME", "shared-project");
    expect(await scope(root)).toBe("shared-project");
  });
  it("uses the repository name for nested directories and linked worktrees", async () => {
    const repo = join(root, "service"); const child = join(repo, "src"); mkdirSync(child, { recursive: true });
    const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git(["init", "-q"]); writeFileSync(join(repo, "file"), "fixture"); git(["add", "file"]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
    expect(await scope(child)).toBe("service");
    const worktree = join(root, "feature"); git(["worktree", "add", "--detach", worktree]);
    vi.restoreAllMocks();
    expect(await scope(worktree)).toBe("service");
  });
  it("falls back to a non-git workspace name", async () => { expect(await scope(root)).toBe(basename(root)); });
});
