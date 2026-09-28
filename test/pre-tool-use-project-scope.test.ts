import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Claude Code's PreToolUse payload has no `project` field — only session_id,
// cwd, tool_name and tool_input. The hook used to read data.project only, so
// every /agentmemory/enrich call went out unscoped and mem::enrich searched
// the whole corpus, injecting other projects' observations into this
// project's tool turns. It must resolve the project from cwd like every
// other project-aware hook.

let server: Server;
let port: number;
let posts: Array<{ path: string; body: Record<string, unknown> }> = [];

const REPO_NAME = "amem-pretool-fixture";

function runHook(
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("node", ["plugin/scripts/pre-tool-use.mjs"], {
      env: {
        ...process.env,
        AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
        AGENTMEMORY_INJECT_CONTEXT: "true",
        // Keep the fixture's basename as the identity regardless of whether
        // the developer running the suite has remote-identity mode on.
        AGENTMEMORY_PROJECT_FROM_REMOTE: "0",
        AGENTMEMORY_PROJECT_NAME: "",
        ...env,
      },
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe("pre-tool-use enrich is project-scoped", () => {
  let tmpRoot: string;
  let repoDir: string;
  let nestedDir: string;

  beforeAll(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "am-pretool-"));
    repoDir = join(tmpRoot, REPO_NAME);
    nestedDir = join(repoDir, "src", "deep");
    mkdirSync(nestedDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir, stdio: "ignore" });

    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          posts.push({ path: req.url ?? "", body: JSON.parse(body || "{}") });
        } catch {
          posts.push({ path: req.url ?? "", body: {} });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ context: "" }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("derives project from the payload cwd", async () => {
    posts = [];
    await runHook({
      session_id: "s1",
      cwd: repoDir,
      tool_name: "Read",
      tool_input: { file_path: join(repoDir, "src", "thing.ts") },
    });

    expect(posts.length).toBe(1);
    expect(posts[0]!.path).toContain("/agentmemory/enrich");
    expect(posts[0]!.body.project).toBe(REPO_NAME);
  });

  it("resolves to the git toplevel from a nested cwd", async () => {
    posts = [];
    await runHook({
      session_id: "s2",
      cwd: nestedDir,
      tool_name: "Edit",
      tool_input: { file_path: join(nestedDir, "x.ts") },
    });

    expect(posts.length).toBe(1);
    expect(posts[0]!.body.project).toBe(REPO_NAME);
  });

  it("never sends an unscoped enrich request", async () => {
    posts = [];
    await runHook({
      session_id: "s3",
      cwd: repoDir,
      tool_name: "Grep",
      tool_input: { pattern: "handleError", path: repoDir },
    });

    expect(posts.length).toBe(1);
    const project = posts[0]!.body.project;
    expect(project).toBeTruthy();
    expect(typeof project).toBe("string");
  });

  it("an explicit payload project still wins (hosts that do supply one)", async () => {
    posts = [];
    await runHook({
      session_id: "s4",
      cwd: repoDir,
      project: "explicit-project",
      tool_name: "Read",
      tool_input: { file_path: join(repoDir, "y.ts") },
    });

    expect(posts.length).toBe(1);
    expect(posts[0]!.body.project).toBe("explicit-project");
  });

  it("stays a no-op when AGENTMEMORY_INJECT_CONTEXT is not true", async () => {
    posts = [];
    await runHook(
      {
        session_id: "s5",
        cwd: repoDir,
        tool_name: "Read",
        tool_input: { file_path: join(repoDir, "z.ts") },
      },
      { AGENTMEMORY_INJECT_CONTEXT: "false" },
    );

    expect(posts.length).toBe(0);
  });
});
